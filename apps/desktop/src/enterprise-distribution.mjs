/** Build-owned enterprise Desktop configuration embedded in the application manifest. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ALLOWED_KEYS = new Set(['issuer', 'clientId', 'gatewayBaseURL', 'models', 'allowLoopbackHttp'])
const ALLOWED_MODEL_KEYS = new Set(['id', 'name', 'contextWindow', 'maxTokens', 'input'])

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loopback(hostname) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function modelProfile(value) {
  return record(value)
    && !Object.keys(value).some(key => !ALLOWED_MODEL_KEYS.has(key))
    && typeof value.id === 'string' && value.id !== ''
    && (value.name === undefined || typeof value.name === 'string')
    && (value.contextWindow === undefined || (Number.isInteger(value.contextWindow) && value.contextWindow > 0))
    && (value.maxTokens === undefined || (Number.isInteger(value.maxTokens) && value.maxTokens > 0))
    && (value.input === undefined || (Array.isArray(value.input)
      && value.input.every(input => input === 'text' || input === 'image')))
}

function secureUrl(value, label, allowLoopbackHttp) {
  if (typeof value !== 'string' || value === '') throw new Error(`desktop enterprise: ${label} is required`)
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== 'https:' && !(allowLoopbackHttp && url.protocol === 'http:' && loopback(url.hostname)))) {
    throw new Error(`desktop enterprise: ${label} must use HTTPS, or loopback HTTP when explicitly enabled`)
  }
  return url
}

/**
 * Validate public enterprise settings before they enter a package or Host process.
 * @param {unknown} value Application metadata or parsed deployment file.
 * @returns {{ issuer: string, clientId: string, gatewayBaseURL: string, models: object[], allowLoopbackHttp: boolean } | undefined}
 */
export function resolveDesktopEnterpriseDistribution(value) {
  if (value === undefined) return undefined
  if (!record(value) || Object.keys(value).some(key => !ALLOWED_KEYS.has(key))) {
    throw new Error('desktop enterprise: invalid distribution configuration')
  }
  const allowLoopbackHttp = value.allowLoopbackHttp === true
  if (value.allowLoopbackHttp !== undefined && typeof value.allowLoopbackHttp !== 'boolean') {
    throw new Error('desktop enterprise: allowLoopbackHttp must be boolean')
  }
  const issuer = secureUrl(value.issuer, 'issuer', allowLoopbackHttp)
  if (issuer.pathname !== '/' || issuer.search || issuer.hash) {
    throw new Error('desktop enterprise: issuer must not contain a path, query, or fragment')
  }
  const gateway = secureUrl(value.gatewayBaseURL, 'gatewayBaseURL', allowLoopbackHttp)
  if (gateway.pathname.replace(/\/$/u, '') !== '/v1') {
    throw new Error('desktop enterprise: gatewayBaseURL must end in /v1')
  }
  if (typeof value.clientId !== 'string' || value.clientId === '') {
    throw new Error('desktop enterprise: clientId is required')
  }
  if (!Array.isArray(value.models) || value.models.length === 0
    || value.models.some(model => !modelProfile(model))) {
    throw new Error('desktop enterprise: models must contain Harness Admin model codes')
  }
  return {
    issuer: issuer.href.replace(/\/$/u, ''), clientId: value.clientId,
    gatewayBaseURL: gateway.href.replace(/\/$/u, ''), models: value.models,
    allowLoopbackHttp,
  }
}

/**
 * Read one deployment file selected by Desktop release configuration.
 * @param {NodeJS.ProcessEnv} environment Packaging or development environment.
 * @param {string} appRoot Desktop application root for relative paths.
 * @returns {ReturnType<typeof resolveDesktopEnterpriseDistribution>}
 */
export function loadDesktopEnterpriseDistribution(environment, appRoot) {
  const configured = environment.DSH_DESKTOP_ENTERPRISE_CONFIG
  if (configured === undefined || configured.trim() === '') return undefined
  const path = resolve(appRoot, configured.trim())
  let value
  try { value = JSON.parse(readFileSync(path, 'utf8')) }
  catch { throw new Error(`desktop enterprise: cannot read valid JSON from ${path}`) }
  return resolveDesktopEnterpriseDistribution(value)
}

/**
 * Project packaged public settings into the private Host child's configuration.
 * @param {Exclude<ReturnType<typeof resolveDesktopEnterpriseDistribution>, undefined>} config Validated distribution.
 * @returns {NodeJS.ProcessEnv} Variables consumed only inside the Desktop Host process.
 */
export function enterpriseHostEnvironment(config) {
  return {
    DSH_ENTERPRISE_OIDC_ISSUER: config.issuer,
    DSH_ENTERPRISE_DESKTOP_OIDC_CLIENT_ID: config.clientId,
    DSH_ENTERPRISE_GATEWAY_BASE_URL: config.gatewayBaseURL,
    DSH_ENTERPRISE_MODELS: JSON.stringify(config.models),
    DSH_ENTERPRISE_ALLOW_LOOPBACK_HTTP: config.allowLoopbackHttp ? 'true' : 'false',
  }
}
