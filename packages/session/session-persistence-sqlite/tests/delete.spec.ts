/** Removing one Session releases only the Segments no surviving Session reaches. @module */
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { SessionDeleteBusyError, SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import type { SessionPersistenceCreateOptions } from '@deepseek-ai/dsh-session-persistence'
import * as persistence from '../src/index.ts'
import { SqliteStore } from '../src/sqlite.ts'
import { sqliteLogs } from './fixtures/store.ts'
import { persistenceFixture } from './fixtures/persistence.ts'
import { meta, oneTurnLog } from '../../session-persistence/tests/contract.ts'

const header = (id: string, isSeeded = false): SessionHeader => ({
  version: SESSION_FORMAT_VERSION, id: SessionId(id), createdAt: 0, isSeeded,
})
const event = (seq: number, text = `title ${seq}`): SessionEvent<'session/title'> => ({
  type: 'session/title', seq: SessionSeq(seq), time: seq,
  data: { title: text, messageSeqs: [], source: { kind: 'user' } },
})
const seed = (prefix: readonly SessionEvent[]): SessionEvent[] => [...prefix, {
  type: 'session/end-seed', seq: SessionSeq(prefix.length), time: 0, data: { inherited: true },
}]
const forkOptions = (source: SessionId, prefix: readonly SessionEvent[]): SessionPersistenceCreateOptions => ({
  inheritedEventCount: SessionLogOffset(prefix.length),
  parentSource: { sessionId: source, endSeq: SessionLogOffset(prefix.length), events: seed(prefix) },
})

/** One service instance over a private root, disposed with the test. */
async function service(label: string) {
  const root = await mkdtemp(join(tmpdir(), `dsh-session-delete-${label}-`))
  const ctx = new Context()
  await ctx.plugin(persistence, { root, compression: 'none' })
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  })
  return { root, service: ctx.sessionPersistence }
}

/** Routing records are the `.json` files beside the database. */
async function routingRecords(root: string): Promise<string[]> {
  const names = await readdir(join(root, '.segments'))
  return names.filter(name => name.endsWith('.json'))
}

it('removes a stored Session, its routing record, and reports it as absent', async () => {
  const { root, service: sessions } = await service('absent')
  const id = SessionId('delete-alone')
  const writer = await sessions.create(header(id))
  await writer.append([event(0)])
  await writer.close()
  expect((await sessions.list()).map(entry => entry.header.id)).toEqual([id])
  expect(await routingRecords(root)).toHaveLength(1)

  await sessions.delete(id)

  expect(await sessions.stat(id)).toBeUndefined()
  expect(await sessions.list()).toEqual([])
  expect(await routingRecords(root)).toEqual([])
  await expect(sessions.open(id, 'read')).rejects.toThrow(SessionPersistenceNotFoundError)
})

it('refuses while this process still holds a handle for the Session', async () => {
  const { service: sessions } = await service('open-handle')
  const id = SessionId('delete-busy')
  const writer = await sessions.create(header(id))
  onTestFinished(async () => { await writer.close() })

  const attempt = sessions.delete(id)
  await expect(attempt).rejects.toThrow(SessionDeleteBusyError)
  await expect(attempt).rejects.toMatchObject({ reason: 'open-handle' })
  expect(await sessions.stat(id)).toBeDefined()
})

it('refuses while another provider holds the write lease', async () => {
  const { root, service: sessions } = await service('foreign-writer')
  const id = SessionId('delete-foreign')
  const writer = await sessions.create(header(id))
  await writer.append([event(0)])
  await writer.close()
  const other = sqliteLogs(join(root, '.segments', 'sessions.sqlite'), root, { compression: 'none' })
  const foreign = await other.open(id, 'write')
  onTestFinished(async () => { await foreign.close(); await other.close() })

  const attempt = sessions.delete(id)
  await expect(attempt).rejects.toThrow(SessionDeleteBusyError)
  await expect(attempt).rejects.toMatchObject({ reason: 'foreign-writer' })
  expect(await sessions.stat(id)).toBeDefined()
})

it('reports an unknown Session instead of a successful removal', async () => {
  const { root, service: sessions } = await service('missing')
  await expect(sessions.delete(SessionId('delete-never-created'))).rejects.toThrow(SessionPersistenceNotFoundError)
  const store = sqliteLogs(join(root, '.segments', 'sessions.sqlite'), root, { compression: 'none' })
  onTestFinished(async () => { await store.close() })
  await expect(store.delete(SessionId('delete-never-created'))).rejects.toThrow(SessionPersistenceNotFoundError)
})

it('keeps a parent prefix that a surviving fork still reaches', async () => {
  const { service: sessions } = await service('shared-prefix')
  const parentId = SessionId('delete-parent')
  const prefix = [event(0), event(1)]
  const parent = await sessions.create(header(parentId))
  await parent.append(prefix)
  await parent.close()
  const childId = SessionId('delete-child')
  const child = await sessions.create(header(childId, true), forkOptions(parentId, prefix))
  await child.close()

  await sessions.delete(parentId)

  const reopened = await sessions.open(childId, 'read')
  try { expect((await reopened.read()).events).toHaveLength(3) }
  finally { await reopened.close() }
  expect(await sessions.stat(parentId)).toBeUndefined()
})

it('releases history only the removed fork reached', async () => {
  const { service: sessions } = await service('exclusive-history')
  const parentId = SessionId('delete-keep-parent')
  const prefix = [event(0), event(1)]
  const parent = await sessions.create(header(parentId))
  await parent.append(prefix)
  await parent.close()
  const childId = SessionId('delete-drop-child')
  const child = await sessions.create(header(childId, true), forkOptions(parentId, prefix))
  await child.append([event(3, 'child only')])
  await child.close()

  await sessions.delete(childId)

  const reopened = await sessions.open(parentId, 'read')
  try { expect((await reopened.read()).events).toEqual(prefix) }
  finally { await reopened.close() }
  expect(await sessions.stat(childId)).toBeUndefined()
})

it('removes a legacy JSONL Session through the JSONL backend', async () => {
  const fixture = await persistenceFixture()
  const legacy = meta('delete-legacy', '/workspace')
  const jsonl = await fixture.mount('jsonl', 'none')
  const writer = await jsonl.persistence.create(legacy)
  await writer.append(oneTurnLog())
  await writer.close()
  await jsonl.context.fiber.dispose()
  const sqlite = await fixture.mount('sqlite', 'none')
  expect(await sqlite.persistence.stat(legacy.id)).toBeDefined()

  await sqlite.persistence.delete(legacy.id)

  expect(await sqlite.persistence.stat(legacy.id)).toBeUndefined()
})

it('propagates a lease failure that is not ownership contention', async () => {
  const { root, service: sessions } = await service('lease-failure')
  const id = SessionId('delete-lease-failure')
  const writer = await sessions.create(header(id))
  await writer.append([event(0)])
  await writer.close()
  const store = sqliteLogs(join(root, '.segments', 'sessions.sqlite'), root, { compression: 'none' })
  const failure = new Error('lock substrate unavailable')
  const spy = vi.spyOn(SqliteStore.prototype, 'acquireSessionLease').mockRejectedValueOnce(failure)
  onTestFinished(async () => { spy.mockRestore(); await store.close() })

  await expect(store.delete(id)).rejects.toBe(failure)
  expect(await sessions.stat(id)).toBeDefined()
})

it('reports a Session a foreign writer removed after the lease was granted', async () => {
  const { root, service: sessions } = await service('foreign-removal')
  const id = SessionId('delete-raced')
  const writer = await sessions.create(header(id))
  await writer.append([event(0)])
  await writer.close()
  const store = sqliteLogs(join(root, '.segments', 'sessions.sqlite'), root, { compression: 'none' })
  // oxlint-disable-next-line typescript/unbound-method -- Called with the intercepted store as receiver below.
  const acquired = SqliteStore.prototype.acquireSessionLease
  // A writer that never took the lease removes the Trace while this removal holds it.
  const spy = vi.spyOn(SqliteStore.prototype, 'acquireSessionLease').mockImplementationOnce(
    async function (this: SqliteStore, ...args) {
      const lease = await acquired.call(this, ...args)
      const raw = new DatabaseSync(join(root, '.segments', 'sessions.sqlite'))
      try { raw.prepare('DELETE FROM traces WHERE trace_uuid = ?').run(id) }
      finally { raw.close() }
      return lease
    })
  onTestFinished(async () => { spy.mockRestore(); await store.close() })

  await expect(store.delete(id)).rejects.toThrow(SessionPersistenceNotFoundError)
})

it('restores the append-only guards after removing a Session', async () => {
  const { root, service: sessions } = await service('guards')
  const id = SessionId('delete-guards')
  const writer = await sessions.create(header(id))
  await writer.append([event(0)])
  await writer.close()

  await sessions.delete(id)
  // A later Session proves the guards still cover rows written after the removal.
  const survivor = await sessions.create(header(SessionId('delete-guards-survivor')))
  await survivor.append([event(0)])
  await survivor.close()

  const db = new DatabaseSync(join(root, '.segments', 'sessions.sqlite'))
  try {
    const triggerName = z.object({ name: z.string() })
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all()
      .map(row => triggerName.parse(row).name)
    expect(names).toEqual(expect.arrayContaining(['frames_no_delete', 'ancestors_no_delete']))
    expect(() => { db.exec('DELETE FROM frames') }).toThrow(/frames are append-only/)
  } finally { db.close() }
})
