/** Authenticated Remote operations for enterprise account UI consumers. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-enterprise-account'
import type { EnterpriseAccountView, EnterpriseSignInAttemptId } from './types.ts'

/** Enterprise account commands and reconnect-safe state stream. */
export class EnterpriseAccountController extends TypertRemoteService {
  static inject = ['enterpriseAccount']

  /** @param ctx - Host with an enterprise account provider mounted. */
  constructor(ctx: Context) { super(ctx, 'enterpriseAccountController', { namespace: 'enterpriseAccount' }) }

  /**
   * Read the current browser-safe account state.
   * @returns the current credential-free account snapshot.
   */
  @Remote
  getState(): Promise<EnterpriseAccountView> { return this.ctx.enterpriseAccount.getState() }

  /**
   * Begin browser login through the Host callback listener.
   * @returns a new or already-active login attempt.
   */
  @Remote
  startSignIn(): Promise<EnterpriseAccountView> {
    return this.ctx.enterpriseAccount.startSignIn()
  }

  /**
   * Cancel the named local attempt.
   * @param attemptId - attempt to cancel.
   * @returns settled cancellation or commit state.
   */
  @Remote
  cancelSignIn(attemptId: EnterpriseSignInAttemptId): Promise<EnterpriseAccountView> {
    return this.ctx.enterpriseAccount.cancelSignIn(attemptId)
  }

  /**
   * Remove the current enterprise login.
   * @returns signed-out state after local credential removal.
   */
  @Remote
  signOut(): Promise<EnterpriseAccountView> { return this.ctx.enterpriseAccount.signOut() }

  /**
   * Stream the credential-free account projection.
   * @param signal - stream lifetime.
   * @returns an initial snapshot and subsequent complete snapshots.
   */
  @Remote({ mode: 'stream' })
  watch(signal: AbortSignal): AsyncIterable<EnterpriseAccountView> { return this.ctx.enterpriseAccount.watch(signal) }
}

export default EnterpriseAccountController
