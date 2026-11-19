/**
 * ui-session-mode browser half on a real SlotRegistry: the plugin occupies the
 * conversation-declared `conversation.input.mode` single seat with the mode
 * selector; the injected face records `/mode <id>` (and `/mode off` for the
 * default mode) through the Client Session command writer, folds unmatched or
 * failed admission into a `false` admission result, and teardown empties the
 * seat (HMR safety).
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { ModeSelect, type ModeSelectInjected } from '../src/client/ModeSelect.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

const SID = 's-mode' as SessionId

/**
 * Read the registered seat's injected props. The registry erases the injected
 * parameter list to `never[]`, so the stored function is narrowed here rather
 * than at every call site.
 * @param entry - one registered slot entry.
 * @returns the per-Session props factory the composer seat receives.
 */
function injectedFace(entry: { inject?: unknown }): (id: SessionId) => ModeSelectInjected {
  const face: unknown = entry.inject
  if (typeof face !== 'function') throw new Error('the mode seat declares no injected props')
  return face as (id: SessionId) => ModeSelectInjected
}

async function bench() {
  const ctx = new Context()
  const command = vi.fn<(line: string) => Promise<RemoteResult<{ matched: boolean }>>>(
    () => Promise.resolve({ ok: true, value: { matched: true } }),
  )
  const binding = vi.fn<() => { session: { command: typeof command } } | undefined>(
    () => ({ session: { command } }),
  )
  ctx.provide('sessions', { binding } as never)
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'conversation.input.mode': { kind: 'single', scope: 'session' } },
  } as never, () => null)
  return { ctx, slots, command, binding }
}

describe('ui-session-mode browser apply', () => {
  it('declares every service it binds', () => {
    expect(inject).toEqual(['slots', 'sessions', 'locale'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('occupies the mode seat and releases it on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    try {
      await fiber.await()
      const entry = b.slots.entries('conversation.input.mode')[0]!
      expect(entry.component).toBe(ModeSelect)
    } finally {
      await fiber.dispose()
    }
    expect(b.slots.entries('conversation.input.mode')).toHaveLength(0)
  })

  it('waits until conversation declares the mode seat', async () => {
    const ctx = new Context()
    ctx.provide('sessions', { binding: () => undefined } as never)
    ctx.provide('locale', new LocaleRuntime(ctx))
    await ctx.plugin(SlotRegistry).await()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('conversation.input.mode')).toHaveLength(0)
    ctx.slots.register({
      name: 'root', children: { 'conversation.input.mode': { kind: 'single', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    expect(ctx.slots.entries('conversation.input.mode')).toHaveLength(1)
    await fiber.dispose()
  })

  it('records non-default modes as /mode <id> and the default mode as /mode off', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    try {
      await fiber.await()
      const entry = b.slots.entries('conversation.input.mode')[0]!
      const injected = injectedFace(entry)(SID)

      await expect(injected.select('ask')).resolves.toBe(true)
      expect(b.command).toHaveBeenLastCalledWith('/mode ask')
      await expect(injected.select('multitask')).resolves.toBe(true)
      expect(b.command).toHaveBeenLastCalledWith('/mode multitask')
      await expect(injected.select('agent')).resolves.toBe(true)
      expect(b.command).toHaveBeenLastCalledWith('/mode off')
    } finally {
      await fiber.dispose()
    }
  })

  it('reports unmatched admission and rejected execution without throwing', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    try {
      await fiber.await()
      const entry = b.slots.entries('conversation.input.mode')[0]!
      const injected = injectedFace(entry)(SID)

      b.command.mockResolvedValueOnce({ ok: true, value: { matched: false } })
      await expect(injected.select('debug')).resolves.toBe(false)

      b.command.mockResolvedValueOnce({ ok: false, error: new RemoteError('session/not-found', 'gone', { sessionId: SID }) })
      await expect(injected.select('debug')).rejects.toThrow('mode switch failed: session/not-found: gone')

      b.binding.mockReturnValueOnce(undefined)
      await expect(injected.select('plan')).rejects.toThrow('this session is not materialized yet')
    } finally {
      await fiber.dispose()
    }
  })
})
