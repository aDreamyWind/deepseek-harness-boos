/** Optional interactive smoke against a live Harness Admin OIDC client and model gateway. */
import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type ServerResponse } from 'node:http'
import { discover, exchangeToken, profileFromClaims, readUserInfo, stateMatches, verifyIdToken } from '../src/protocol.ts'

type Mode = 'desktop' | 'web'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`enterprise smoke: ${name} is required`)
  return value
}

function openBrowser(url: string): Promise<void> {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', 'start', '', url]]
      : ['xdg-open', [url]]
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error) => { if (error === null) resolve(); else reject(error) })
  })
}

function callbackPage(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'referrer-policy': 'no-referrer',
  }).end(`<!doctype html><html><meta charset="utf-8"><body><p>${message}</p></body></html>`)
}

async function main(): Promise<void> {
  const mode = required('HARNESS_ADMIN_SMOKE_MODE') as Mode
  if (mode !== 'desktop' && mode !== 'web') throw new Error('enterprise smoke: HARNESS_ADMIN_SMOKE_MODE must be desktop or web')
  const issuer = required('HARNESS_ADMIN_SMOKE_ISSUER').replace(/\/$/u, '')
  const clientId = required('HARNESS_ADMIN_SMOKE_CLIENT_ID')
  const gatewayBaseURL = required('HARNESS_ADMIN_SMOKE_GATEWAY_BASE_URL').replace(/\/$/u, '')
  const model = required('HARNESS_ADMIN_SMOKE_MODEL')
  const configuredRedirect = mode === 'desktop' ? 'http://127.0.0.1/oauth/callback'
    : required('HARNESS_ADMIN_SMOKE_REDIRECT_URI')
  const redirect = new URL(configuredRedirect)
  if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || redirect.pathname === '/') {
    throw new Error('enterprise smoke: the interactive callback must use http://127.0.0.1 with a callback path')
  }
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const code = Promise.withResolvers<string>()
  void code.promise.catch(() => undefined)
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const received = url.searchParams.get('state') ?? ''
    const authorizationCode = url.searchParams.get('code')
    if (request.method !== 'GET' || url.pathname !== redirect.pathname || !stateMatches(received, state)
      || authorizationCode === null) {
      callbackPage(response, 400, 'Harness Admin login callback was rejected.')
      return
    }
    callbackPage(response, 200, 'Harness Admin smoke login completed. You can close this tab.')
    code.resolve(authorizationCode)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(mode === 'desktop' ? 0 : Number(redirect.port || 80), '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('enterprise smoke: callback listener did not bind')
    if (mode === 'desktop') redirect.port = String(address.port)
    const metadata = await discover(issuer, AbortSignal.timeout(10_000))
    const authorize = new URL(metadata.authorization_endpoint)
    authorize.search = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: redirect.href,
      scope: 'openid profile model.invoke offline_access', state, nonce,
      code_challenge: challenge, code_challenge_method: 'S256',
    }).toString()
    await openBrowser(authorize.href)
    let loginTimer: ReturnType<typeof setTimeout> | undefined
    const loginTimeout = new Promise<never>((_resolve, reject) => {
      loginTimer = setTimeout(() => { reject(new Error('enterprise smoke: login timed out')) }, 300_000)
    })
    const authorizationCode = await Promise.race([code.promise, loginTimeout])
      .finally(() => { clearTimeout(loginTimer) })
    const tokens = await exchangeToken(metadata.token_endpoint, new URLSearchParams({
      grant_type: 'authorization_code', code: authorizationCode, redirect_uri: redirect.href, code_verifier: verifier,
    }), mode === 'desktop' ? { method: 'none', clientId }
      : { method: 'client_secret_basic', clientId, clientSecret: required('HARNESS_ADMIN_SMOKE_CLIENT_SECRET') },
    AbortSignal.timeout(10_000))
    if (tokens.id_token === undefined) throw new Error('enterprise smoke: token response omitted id_token')
    const claims = await verifyIdToken(tokens.id_token, {
      issuer, clientId, nonce, jwksUri: metadata.jwks_uri, clockSkewSeconds: 60,
      signal: AbortSignal.timeout(10_000),
    })
    const profile = metadata.userinfo_endpoint === undefined ? profileFromClaims(claims)
      : await readUserInfo(metadata.userinfo_endpoint, tokens.access_token, claims.sub, AbortSignal.timeout(10_000))
    const gateway = await fetch(`${gatewayBaseURL}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with OK.' }], stream: false }),
    })
    if (!gateway.ok) throw new Error(`enterprise smoke: gateway returned HTTP ${String(gateway.status)}`)
    await gateway.body?.cancel()
    process.stdout.write(`enterprise smoke: ${mode} login and gateway succeeded for ${profile.organizationCode ?? profile.organizationId ?? profile.subject}\n`)
  } finally {
    server.closeAllConnections()
    if (server.listening) await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
}

await main()
