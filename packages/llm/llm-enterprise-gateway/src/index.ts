/** Harness Admin OpenAI Chat Completions routing with Host-only OIDC bearer tokens. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-enterprise-account'
import type {} from '@deepseek-ai/dsh-fs'
import {
  LlmAdapter,
  LlmError,
  resolveImageAttachmentAccess,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type PreparedAdapterCall,
  type ResolvedRetryPolicy,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import {
  authContextFrom,
  credentialStoreFrom,
  PiAiAdapter,
  resolveProfiles,
  type PiAiModelProfile,
  type ResolvedPiAiProviderProfile,
} from '@deepseek-ai/dsh-llm-pi-ai'
import z from '@deepseek-ai/schemastery'

const REQUIRED_SCOPES = ['model.invoke'] as const

const modelProfile = z.object({
  id: z.string().required(),
  name: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  input: z.array(z.union(['text', 'image'] as const)),
})

/** Manually configured Harness Admin model catalog and gateway address. */
export interface Config {
  /** OpenAI-compatible root ending in `/v1`. */
  gatewayBaseURL: string
  /** Harness provider route shown in model selectors. */
  provider?: string
  /** Provider label shown in model selectors. */
  displayName?: string
  /** Harness Admin model codes and their client-side capability metadata. */
  models: PiAiModelProfile[]
  /** Permit an HTTP gateway only on a loopback hostname. */
  allowLoopbackHttp?: boolean
}

/** Runtime schema for {@link Config}. */
export const Config = z.object({
  gatewayBaseURL: z.string().required(),
  provider: z.string().default('harness-admin'),
  displayName: z.string().default('Harness Admin'),
  models: z.array(modelProfile).required(),
  allowLoopbackHttp: z.boolean().default(false),
})

export const name = 'llm-enterprise-gateway'
export const inject = ['llm', 'enterpriseAccount']

interface ResolvedConfig {
  baseURL: string
  requestURL: string
  provider: string
  profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile>
}

interface EnterpriseFailure {
  chunk: Extract<StreamChunk, { type: 'finish' }>
  status?: number
}

/** Register the configured Harness Admin model codes as one provider route. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const adapter = new EnterpriseGatewayAdapter(ctx, resolved)
  ctx.llm.registerAdapter([resolved.provider], adapter)
}

/** Harness Admin adapter layered over the maintained OpenAI Completions translator. */
export class EnterpriseGatewayAdapter extends LlmAdapter {
  private readonly catalog: PiAiAdapter
  private readonly auth

  constructor(private readonly ctx: Context, private readonly config: ResolvedConfig) {
    super()
    this.auth = { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) }
    this.catalog = this.createAdapter(() => Promise.reject(
      new LlmError('Harness Admin model request did not resolve an access token', 'AUTH'),
    ))
  }

  override providerInfo(provider: string): LlmProviderInfo { return this.catalog.providerInfo(provider) }
  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.catalog.providerRetryPolicy(provider)
  }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> { return this.catalog.listModels(provider) }
  override resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.catalog.resolveModel(provider, model, signal)
  }
  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const resolved = await this.resolveModel(provider, model, signal)
    return { model: resolved, stream: options => this.stream(options) }
  }
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> { return this.generate(options) }

  private async * generate(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    let forcedToken: string | undefined
    request: for (let attempt = 0; attempt < 2; attempt++) {
      let requestToken: string | undefined
      const adapter = this.createAdapter(async () => {
        requestToken = forcedToken ?? await this.ctx.enterpriseAccount.resolveAccessToken(
          this.config.requestURL,
          REQUIRED_SCOPES,
        )
        if (requestToken === undefined) {
          throw new LlmError('Sign in to Harness Admin before invoking an enterprise model', 'AUTH')
        }
        return requestToken
      })
      let emitted = false
      let pendingUsage: Extract<StreamChunk, { type: 'usage' }> | undefined
      for await (const source of adapter.stream(options)) {
        if (source.type === 'usage') { pendingUsage = source; continue }
        if (source.type !== 'finish') { emitted = true; yield source; continue }
        const failure = mapEnterpriseFailure(source)
        if (failure.status === 401 && !emitted && attempt === 0 && requestToken !== undefined) {
          forcedToken = await this.ctx.enterpriseAccount.refreshAccessToken(
            this.config.requestURL,
            requestToken,
            REQUIRED_SCOPES,
          )
          if (forcedToken !== undefined) continue request
        }
        if (failure.status === 401 && requestToken !== undefined) {
          await this.ctx.enterpriseAccount.rejectAccessToken(requestToken)
        }
        if (pendingUsage !== undefined) yield pendingUsage
        yield failure.chunk
        return
      }
      return
    }
  }

  private createAdapter(resolveApiKey: () => Promise<string>): PiAiAdapter {
    return new PiAiAdapter({
      profiles: () => this.config.profiles,
      resolveApiKey,
      auth: this.auth,
      resolveAttachments: () => this.ctx.get('attachments'),
      resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
        attachments,
        hostPath => this.ctx.get('fs')?.processPathFromHostPath(hostPath),
        ref,
      ),
      onReplayDegrade: ({ provider, model, reason }) => {
        this.ctx.logger.warn(
          `llm-enterprise-gateway: unusable replay state for route "${provider}/${model}";`
          + ` sending provider-neutral content (${reason})`,
        )
      },
    })
  }
}

function resolveConfig(config: Config): ResolvedConfig {
  const value = Config(config)
  const baseURL = validateGatewayBaseURL(value.gatewayBaseURL, value.allowLoopbackHttp)
  if (value.provider.length === 0) throw new Error('llm-enterprise-gateway: provider must be non-empty')
  if (value.models.length === 0) throw new Error('llm-enterprise-gateway: models must contain at least one Harness Admin model code')
  const profiles = resolveProfiles({
    [value.provider]: {
      displayName: value.displayName,
      api: 'openai-completions',
      baseURL,
      models: value.models,
      compat: { supportsUsageInStreaming: true },
    },
  })
  return {
    baseURL,
    requestURL: `${baseURL}/chat/completions`,
    provider: value.provider,
    profiles,
  }
}

function validateGatewayBaseURL(value: string, allowLoopbackHttp: boolean): string {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== 'https:' && !(allowLoopbackHttp && url.protocol === 'http:' && loopback))) {
    throw new Error('llm-enterprise-gateway: gatewayBaseURL must use HTTPS, or loopback HTTP when explicitly enabled')
  }
  if (!url.pathname.replace(/\/$/, '').endsWith('/v1')) {
    throw new Error('llm-enterprise-gateway: gatewayBaseURL must end in /v1')
  }
  return url.href.replace(/\/$/, '')
}

function mapEnterpriseFailure(chunk: Extract<StreamChunk, { type: 'finish' }>): EnterpriseFailure {
  if (chunk.reason.kind !== 'error') return { chunk }
  const status = chunk.reason.failure.status ?? httpStatus(chunk.reason.failure.message)
  if (status === undefined) return { chunk }
  const facts = { ...chunk.reason.failure, status }
  switch (status) {
    case 401:
      return { status, chunk: { ...chunk, reason: { kind: 'error', failure: {
        ...facts, code: 'AUTH', message: 'Harness Admin rejected the login session; sign in again',
      } } } }
    case 403:
      return { status, chunk: { ...chunk, reason: { kind: 'error', failure: {
        ...facts, code: 'AUTHORIZATION_DENIED', message: 'This Harness Admin account cannot invoke the selected model',
      } } } }
    case 404:
      return { status, chunk: { ...chunk, reason: { kind: 'error', failure: {
        ...facts, code: 'UNKNOWN_MODEL', message: 'Harness Admin does not contain the configured model code',
      } } } }
    case 409:
      return { status, chunk: { ...chunk, reason: { kind: 'error', failure: {
        ...facts, code: 'MODEL_UNAVAILABLE', message: 'The Harness Admin model or provider connection is disabled',
      } } } }
    case 429:
      return { status, chunk: { ...chunk, reason: { kind: 'error', failure: {
        ...facts, code: 'RATE_LIMIT', message: 'Harness Admin rate or token quota is exhausted',
      } } } }
    default:
      return { status, chunk: { ...chunk, reason: { kind: 'error', failure: facts } } }
  }
}

function httpStatus(message: string): number | undefined {
  const match = /(?:status(?:=|\s)|HTTP\s*|\b)([45]\d\d)\b/i.exec(message)
  return match?.[1] === undefined ? undefined : Number(match[1])
}
