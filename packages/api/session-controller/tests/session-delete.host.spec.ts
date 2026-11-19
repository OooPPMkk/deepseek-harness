/**
 * Session Controller deletion: the retained Agent teardown that must precede
 * the stored log's removal, and the Remote error mapping for a refusal.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import SessionStore, { type SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SessionDeleteBusyError, SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import type { SessionDeleteRequest } from '../src/types.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { TestSessionRemote } from './test-remote.ts'
import { createSessionTestRemote, testSessionPersistence } from './test-remote.ts'

const sid = (id: string): SessionId => brandString<SessionId>(id)

/** Session cwd roots created per test, removed after it settles. */
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A real directory the Controller accepts as a Session cwd. */
function tempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-delete-'))
  tempDirs.push(dir)
  return dir
}

function request(sessionId: SessionId): SessionDeleteRequest {
  return { sessionId }
}

/** The composed Controller over a persistence double whose `delete` is caller-supplied. */
async function composed(options: {
  readonly delete?: (id: SessionId) => Promise<void>
  readonly mount?: boolean
} = {}): Promise<{ ctx: Context; remote: TestSessionRemote; calls: string[] }> {
  // Ordered teardown evidence: the Agent's disposal must precede the removal
  // that deletes the log the Agent was writing.
  const calls: string[] = []
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  if (options.mount !== false) {
    ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
      list: () => Promise.resolve([]),
      delete: options.delete ?? ((id: SessionId) => {
        calls.push(`delete:${id}`)
        return Promise.resolve()
      }),
    }) as never)
  }
  ctx.provide('workspaceRegistry', { get: () => undefined, list: () => [], archivedSessionIds: [] } as never)
  ctx.agents.setFactory({
    createAgent: async (ownerCtx: Context, createOptions: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.create(createOptions.sessionId, {
        ...createOptions.seed === undefined ? {} : { seed: [...createOptions.seed] },
        ...createOptions.meta === undefined ? {} : { meta: createOptions.meta },
      })
      const agent = { id: session.id, session, status: 'idle', ctx: ownerCtx } as Agent
      const unregister = ctx.agents.register(agent)
      return {
        agent,
        dispose: async () => {
          calls.push(`dispose:${session.id}`)
          await unregister()
        },
      }
    },
    resume: () => Promise.reject(new Error('resume must not run: every source here is attached')),
  })
  const remote = await createSessionTestRemote(ctx, {
    defaultModelSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    cwd: '/tmp',
  })
  return { ctx, remote, calls }
}

describe('Session deletion', () => {
  it('disposes the Agent this controller created before it removes the stored log', async () => {
    const { ctx, remote, calls } = await composed()
    const created = await remote.create({ cwd: tempCwd() })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const sessionId = created.value.sessionId
    const removed = vi.fn()
    ctx.on('api-session/removed', removed)

    const response = await remote.delete(request(sessionId))

    expect(response).toMatchObject({ ok: true, value: { sessionId } })
    // The teardown capability is what makes removal safe: the live Agent is
    // gone before the log disappears, so no write target outlives its file.
    expect(ctx.agents.get(sessionId)).toBeUndefined()
    expect(calls).toEqual([`dispose:${sessionId}`, `delete:${sessionId}`])
    expect(removed).toHaveBeenCalledWith(sessionId)
  })

  it('removes a Session with no live Agent without disposing anything', async () => {
    const { ctx, remote, calls } = await composed()

    const response = await remote.delete(request(sid('session-cold')))

    expect(response).toMatchObject({ ok: true, value: { sessionId: sid('session-cold') } })
    expect(calls).toEqual([`delete:${sid('session-cold')}`])
    expect(ctx.agents.get(sid('session-cold'))).toBeUndefined()
  })

  it('maps an absent stored log to session/not-found', async () => {
    const { remote } = await composed({
      delete: id => Promise.reject(new SessionPersistenceNotFoundError(id)),
    })

    const response = await remote.delete(request(sid('session-missing')))

    expect(response.ok).toBe(false)
    if (response.ok) return
    expect(response.error).toMatchObject({
      code: 'session/not-found',
      details: { sessionId: sid('session-missing') },
    })
  })

  it('maps a persistence refusal to session/delete-busy with its reason', async () => {
    const { remote } = await composed({
      delete: id => Promise.reject(new SessionDeleteBusyError(id, 'foreign-writer')),
    })

    const response = await remote.delete(request(sid('session-locked')))

    expect(response.ok).toBe(false)
    if (response.ok) return
    expect(response.error).toMatchObject({
      code: 'session/delete-busy',
      details: { sessionId: sid('session-locked'), reason: 'foreign-writer' },
    })
  })

  it('refuses a live Agent owned outside the API Session controller', async () => {
    const { ctx, remote, calls } = await composed()
    const session = ctx.sessions.create(sid('session-unowned'), { meta: { cwd: '/proj' } })
    await ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)

    const response = await remote.delete(request(session.id))

    expect(response.ok).toBe(false)
    if (response.ok) return
    expect(response.error).toMatchObject({
      code: 'session/delete-busy',
      details: { sessionId: session.id, reason: 'agent-unavailable' },
    })
    // Nothing was removed: the log still belongs to a running Agent.
    expect(calls).toEqual([])
    expect(ctx.agents.get(session.id)).toBeDefined()
  })

  it('reports internal when the composition mounts no session persistence', async () => {
    const { remote } = await composed({ mount: false })

    const response = await remote.delete(request(sid('session-nodisk')))

    expect(response.ok).toBe(false)
    if (response.ok) return
    expect(response.error.code).toBe('gateway/internal')
    expect(response.error.message).toMatch(/session-persistence/)
  })
})
