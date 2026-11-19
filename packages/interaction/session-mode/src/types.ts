/**
 * Pure types of the session-mode domain: the one home of the `session-mode`
 * projection-key declaration, free of this package's host-side value imports
 * (cordis, dsh-agent, dsh-commands). `./types` serves host consumers and
 * `./client` serves client aggregates, with zero content duplication.
 *
 * @module @deepseek-ai/dsh-session-mode/types
 */

import type { CommandId } from '@deepseek-ai/dsh-commands/types'

/**
 * The session-mode projection's wire value. `mode` is the policy in force for
 * the next request: a configured mode id, `plan` for the logged plan state, or
 * the empty string for the deployment's own agent behavior. `pending` is true
 * while a recorded `/mode` command has not settled. `pinned` is the permission
 * preset the mode in force holds, so a client can show which access level the
 * mode owns instead of offering an edit the next step would override.
 */
export interface SessionModeProjection {
  mode: string
  pending: boolean
  pinned: string | null
}

/** Host state used to derive {@link SessionModeProjection}. */
export interface SessionModeUnitState {
  /** The last settled `/mode <id>` selection; `plan` when plan mode was chosen. */
  selected: string | null
  /** The last settled non-plan selection, so leaving plan mode returns to it. */
  previous: string | null
  /** The latest `/mode` command awaiting its paired settlement. */
  running: { commandId: CommandId; mode: string } | null
  /** Whether the logged `plan/mode` state is active. */
  planActive: boolean
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Collaboration mode folded from the `/mode` command lifecycle and `plan/mode` events. */
    'session-mode': SessionModeProjection
  }
}
