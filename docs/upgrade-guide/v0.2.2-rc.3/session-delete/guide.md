---
kind: upgrade-guide
description: "SessionPersistence implementations must now implement delete(), and the Session Controller Remote and client gain session/delete and delete()."
---

# `SessionPersistence` gains `delete()` and the Session Controller gains `session/delete`

English | [中文](guide.zh.md)

## Change

`SessionPersistence` in [`@deepseek-ai/dsh-session-persistence`](../../../../packages/session/session-persistence/README.md) declares a new abstract member, so every implementation must provide it:

```ts
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPersistenceDeleteOptions } from '@deepseek-ai/dsh-session-persistence'

abstract class SessionPersistence {
  abstract delete(id: SessionId, options?: SessionPersistenceDeleteOptions): Promise<void>
}
```

`@deepseek-ai/dsh-session-persistence-jsonl` implements it by acquiring the Session's write lease, then removing the Session directory. It throws `SessionDeleteBusyError` (`'open-handle'` for a handle this process holds, `'foreign-writer'` for another process) and `SessionPersistenceNotFoundError` for an unknown id.

The Session Controller exposes `session/delete` (`SessionDeleteRequest` → `SessionDeleteValue`), and `ISessions` gains `delete(sessionId)`, which rejects with `SessionDeleteError`. The Host disposes a live Agent the API Session controller created before it removes the log, and emits `api-session/removed`. The Session row menu now offers **Delete session** below **Archive session**; it asks for confirmation and cannot be undone.

A custom persistence implementation, a Remote consumer, or a Client that implements `ISessions` observes the break. Archiving is unchanged and still keeps the stored log.

## Migration

1. Add `delete(id, options?)` to each `SessionPersistence` implementation. Resolve the Session's directory, verify that no handle is open in this process, take the same cross-process write lease that writes use, and remove the directory; map foreign ownership to `SessionDeleteBusyError`.
2. Implement `delete` in a custom `ISessions` client, or delegate to the shipped `ClientSessions`.
3. Read `SessionDeleteBusyError` and `SessionPersistenceNotFoundError` from `@deepseek-ai/dsh-session-persistence` when a caller maps failures, and `SessionDeleteError` from `@deepseek-ai/dsh-api-session-controller/client`.
4. Confirm that the implementation type-checks, that deleting a Session removes its `session-<id>` directory under the Session root, and that a Session with an open handle is refused with `SessionDeleteBusyError`.
