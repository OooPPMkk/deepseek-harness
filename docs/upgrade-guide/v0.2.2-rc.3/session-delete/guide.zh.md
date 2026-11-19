---
kind: upgrade-guide
description: "SessionPersistence 实现必须新增 delete()，Session Controller 的 Remote 与客户端新增 session/delete 与 delete()。"
---

# `SessionPersistence` 新增 `delete()`，Session Controller 新增 `session/delete`

[English](guide.md) | 中文

## 变更

[`@deepseek-ai/dsh-session-persistence`](../../../../packages/session/session-persistence/README.zh.md) 的 `SessionPersistence` 声明了新的抽象成员，因此每个实现都必须提供它：

```ts
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPersistenceDeleteOptions } from '@deepseek-ai/dsh-session-persistence'

abstract class SessionPersistence {
  abstract delete(id: SessionId, options?: SessionPersistenceDeleteOptions): Promise<void>
}
```

`@deepseek-ai/dsh-session-persistence-jsonl` 的实现先取得该 Session 的写租约，再删除整个 Session 目录。它在以下情况抛出 `SessionDeleteBusyError`（`'open-handle'` 表示本进程仍持有句柄，`'foreign-writer'` 表示另一个进程持有）与 `SessionPersistenceNotFoundError`（未知 id）。

Session Controller 新增 `session/delete`（`SessionDeleteRequest` → `SessionDeleteValue`），`ISessions` 新增 `delete(sessionId)`，失败时以 `SessionDeleteError` 拒绝。Host 会先销毁 API Session 控制器创建的运行中 Agent，再删除日志，并发出 `api-session/removed`。会话右键菜单在“归档会话”下方新增“删除会话”；该操作需要二次确认，且不可撤销。

自定义持久层实现、Remote 消费方，或自行实现 `ISessions` 的客户端会观察到本次变更。归档行为不变，仍保留存储的日志。

## 迁移

1. 为每个 `SessionPersistence` 实现补上 `delete(id, options?)`：解析该 Session 的目录，确认本进程没有打开句柄，取得与写入相同的跨进程写租约，然后删除目录；被其他进程持有时映射为 `SessionDeleteBusyError`。
2. 自定义 `ISessions` 客户端实现 `delete`，或直接委托给仓库自带的 `ClientSessions`。
3. 调用方映射失败时，从 `@deepseek-ai/dsh-session-persistence` 读取 `SessionDeleteBusyError` 与 `SessionPersistenceNotFoundError`，从 `@deepseek-ai/dsh-api-session-controller/client` 读取 `SessionDeleteError`。
4. 确认实现通过类型检查，确认删除一个会话会移除 Session 根目录下的 `session-<id>` 目录，且持有打开句柄的会话会被 `SessionDeleteBusyError` 拒绝。
