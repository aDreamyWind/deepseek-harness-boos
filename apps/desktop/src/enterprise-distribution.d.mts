/** Public model metadata embedded in one enterprise Desktop release. */
export interface DesktopEnterpriseModel {
  readonly id: string
  readonly name?: string
  readonly contextWindow?: number
  readonly maxTokens?: number
  readonly input?: readonly ('text' | 'image')[]
}

/** Public enterprise settings embedded in one Desktop release. */
export interface DesktopEnterpriseDistribution {
  readonly issuer: string
  readonly clientId: string
  readonly gatewayBaseURL: string
  readonly models: readonly DesktopEnterpriseModel[]
  readonly allowLoopbackHttp: boolean
}

/** Validate public enterprise settings before they enter a package or Host process. */
export function resolveDesktopEnterpriseDistribution(value: unknown): DesktopEnterpriseDistribution | undefined
/** Read one deployment file selected by Desktop release configuration. */
export function loadDesktopEnterpriseDistribution(
  environment: NodeJS.ProcessEnv,
  appRoot: string,
): DesktopEnterpriseDistribution | undefined
/** Project packaged public settings into the private Host child's configuration. */
export function enterpriseHostEnvironment(config: DesktopEnterpriseDistribution): NodeJS.ProcessEnv
