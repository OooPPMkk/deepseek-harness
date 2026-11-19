/** Composer collaboration-mode selector over the host `session-mode` projection. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the ui-conversation SlotMap merge (the input.mode seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the Client Session faces carrying `command()`.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the `session-mode` SessionProjectionMap merge for useProjection.
import type {} from '@deepseek-ai/dsh-session-mode/client'
// Type-only: pulls the `plan` capability marker this selector gates its Plan row on.
import type {} from '@deepseek-ai/dsh-plan-mode/client'
// Type-only: pulls the renderer plugin's Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { DEFAULT_SESSION_MODE, ModeSelect, type ModeSelectInjected } from './ModeSelect.tsx'
import { de, en, es, fr, ja, pt, ru, SESSION_MODE_NS, zh, type SessionModeKey } from './locales.ts'

export type { SessionModeKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer collaboration-mode selector's copy. */
    sessionMode: SessionModeKey
  }
}

/** Services this selector binds: the mode seat, Session command admission, and dictionaries. */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Register the composer mode selector over the projected Session mode.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(SESSION_MODE_NS, { zh, en, ja, es, fr, de, ru, pt }),
    'ui-session-mode: dictionaries',
  )

  // The default mode has no recorded selection, so returning to it is `/mode off`.
  const submit = async (sessionId: SessionId, mode: string): Promise<boolean> => {
    const live = ctx.sessions.binding(sessionId)?.session
    if (live === undefined) throw new Error('this session is not materialized yet')
    const result = await live.command(mode === DEFAULT_SESSION_MODE ? '/mode off' : `/mode ${mode}`)
    if (!result.ok) throw new Error(`mode switch failed: ${result.error.code}: ${result.error.message}`)
    return result.value.matched
  }

  ctx.slots.inject('conversation.input.mode', () => ctx.slots.register({
    name: 'conversation.input.mode',
    locale: SESSION_MODE_NS,
    inject: (sessionId: SessionId): ModeSelectInjected => ({
      select: mode => submit(sessionId, mode),
    }),
  }, ModeSelect))
}
