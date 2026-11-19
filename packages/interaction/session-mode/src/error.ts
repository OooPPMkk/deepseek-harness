/** Typed session-mode failures. @module */

import { HarnessError } from '@deepseek-ai/dsh-error'

/**
 * Every machine-routable session-mode failure:
 * - `MODE_STATE_UNAVAILABLE`: the `session-mode` projection reader is not
 *   registered yet; await plugin activation before assembling prompts or
 *   running the command.
 */
export type SessionModeErrorCode = 'MODE_STATE_UNAVAILABLE'

/** Typed session-mode failure; `code` is one {@link SessionModeErrorCode}. */
export class SessionModeError extends HarnessError {
  override readonly code: SessionModeErrorCode

  /**
   * @param message - reason and next step for the caller.
   * @param code - failure class.
   * @param options - standard `cause` chaining.
   */
  constructor(message: string, code: SessionModeErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'SessionModeError'
    this.code = code
  }
}
