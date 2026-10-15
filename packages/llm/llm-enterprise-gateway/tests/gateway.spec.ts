/** Harness Admin gateway integration over atomically allocated loopback listeners. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as EnterpriseGateway from '@deepseek-ai/dsh-llm-enterprise-gateway'
import { expect, it, onTestFinished, vi } from 'vitest'

interface GatewayFixture {
  baseURL: string
  server: Server
  headers: IncomingMessage['headers'][]
  requests: Array<Record<string, unknown>>
}

it('exposes the Cordis apply module without a competing default export', () => {
  expect(EnterpriseGateway.apply).toBeTypeOf('function')
  expect(EnterpriseGateway).not.toHaveProperty('default')
})

async function gatewayFixture(statuses: number[]): Promise<GatewayFixture> {
  const headers: IncomingMessage['headers'][] = []
  const requests: Array<Record<string, unknown>> = []
  const server = createServer((request, response) => { void handle(request, response) })
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    headers.push(request.headers)
    requests.push(JSON.parse(await readBody(request)) as Record<string, unknown>)
    const status = statuses.shift() ?? 500
    if (status !== 200) {
      response.writeHead(status, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: { message: `admin-${String(status)}` } }))
      return
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write('data: {"choices":[{"delta":{"content":"hello"},"index":0,"finish_reason":null}]}\n\n')
    response.write('data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\n')
    response.end('data: [DONE]\n\n')
  }
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  onTestFinished(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => { resolve() })
      server.closeAllConnections()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('gateway listener did not bind')
  return { baseURL: `http://127.0.0.1:${String(address.port)}/v1`, server, headers, requests }
}

function enterpriseAccount(tokens: string[]) {
  return {
    resolveAccessToken: vi.fn(async () => tokens[0]),
    refreshAccessToken: vi.fn(async () => tokens[1]),
    rejectAccessToken: vi.fn(async () => undefined),
  }
}

async function run(statuses: number[]) {
  const gateway = await gatewayFixture(statuses)
  const account = enterpriseAccount(['initial-token', 'refreshed-token'])
  const ctx = new Context()
  ctx.provide('enterpriseAccount', account as never)
  await ctx.plugin(LlmRuntime)
  const mounted = ctx.plugin(EnterpriseGateway, {
    gatewayBaseURL: gateway.baseURL,
    models: [{ id: 'catalog-code' }],
    allowLoopbackHttp: true,
  })
  await mounted
  onTestFinished(async () => { await mounted.dispose() })
  const prepared = await ctx.llm.prepareCall({ provider: 'harness-admin', model: 'catalog-code' })
  const chunks = []
  for await (const chunk of prepared.stream({ ...prepared.config, messages: [] })) chunks.push(chunk)
  return { account, chunks, gateway }
}

it('refreshes one rejected access token and retries the exact model code once', async () => {
  const { account, chunks, gateway } = await run([401, 200])
  expect(gateway.headers.map(value => value.authorization)).toEqual([
    'Bearer initial-token',
    'Bearer refreshed-token',
  ])
  expect(gateway.requests).toHaveLength(2)
  expect(gateway.requests[1]).toMatchObject({
    model: 'catalog-code',
    stream: true,
    stream_options: { include_usage: true },
  })
  expect(account.refreshAccessToken).toHaveBeenCalledExactlyOnceWith(
    `${gateway.baseURL}/chat/completions`,
    'initial-token',
    ['model.invoke'],
  )
  expect(account.rejectAccessToken).not.toHaveBeenCalled()
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
})

it.each([
  [403, 'AUTHORIZATION_DENIED'],
  [404, 'UNKNOWN_MODEL'],
  [409, 'MODEL_UNAVAILABLE'],
  [429, 'RATE_LIMIT'],
] as const)('maps Harness Admin HTTP %s without refreshing', async (status, code) => {
  const { account, chunks } = await run([status])
  expect(account.refreshAccessToken).not.toHaveBeenCalled()
  expect(chunks.at(-1)).toMatchObject({
    type: 'finish',
    reason: { kind: 'error', failure: { code, status } },
  })
})

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) {
    const value: unknown = chunk
    if (typeof value === 'string' || value instanceof Uint8Array) chunks.push(Buffer.from(value))
    else throw new TypeError('request body chunk is not binary or text')
  }
  return Buffer.concat(chunks).toString('utf8')
}
