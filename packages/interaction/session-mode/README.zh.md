---
description: "会话级协作模式：/mode 命令、mode:policy 提示词段、可选的固定权限预设，以及编辑器模式选择器读取的 session-mode 投影。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-mode

[English](README.md) | 中文

## 概述

会话模式是针对单个 Session 的可切换协作策略。所有模式共用同一套工具目录，差别只在于选中期间的提示词段；某个模式还可以固定一个权限预设。当前选择以 `/mode` 命令记录，因此仅凭会话日志就能重建模型当时收到的内容。

`plan` 是保留模式 id：`/mode plan` 通过调用方 Agent 自己的 `/plan` 命令委托，因此按 Agent 隔离 `dsh-plan-mode` 的预设同样可用；投影折叠 `plan/mode`，`/plan` 与选择器保持同步。

## 目录

- [使用本包](#use-this-package)
- [配置模式](#configure-modes)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Host 侧与 `system-prompt` 一同挂载；Web GUI 另需 `@deepseek-ai/dsh-client-ui-session-mode` 提供编辑器控件。切换通过被记录的命令完成，可以从选择器点选，也可以直接输入：

```
/mode ask
/mode debug
/mode plan
/mode off
```

`/mode off` 回到部署自身的 agent 行为——即选择器标注为默认模式的空选择。部署未声明的模式会明确报错，并保持当前模式不变。

声明了 `permissionPreset` 的模式在生效期间固定该预设：投影以 `pinned` 报告，输入框的访问控件随之锁定并给出说明，而不是接受一次会被下一步覆盖的修改。离开该模式后，恢复进入时观察到的预设。

<a id="configure-modes"></a>
## 配置模式

```yaml
- id: session-mode
  name: '@deepseek-ai/dsh-session-mode'
  config:
    modes:
      - id: ask
        permissionPreset: read-only
        section: |
          You are answering questions; do not change the workspace.
      - id: debug
        section: |
          You are diagnosing a failure. Establish observed behavior first.
```

| 字段 | 含义 |
| --- | --- |
| `id` | 传给 `/mode` 的 kebab-case 模式 id；`off` 与 `plan` 是保留值。 |
| `section` | 模式生效期间渲染为 `mode:policy` 提示词段的指引；声明了模式就必须非空。 |
| `permissionPreset` | 模式生效期间固定的权限预设；`custom` 与 `auto` 会被拒绝。 |

配置在插件加载时校验：未知字段、重复或保留的 id、空指引都会直接报错，而不是悄悄组合出一个不做任何事的模式。

<a id="understand-the-implementation"></a>
## 实现说明

- **不新增会话事件类型。** `mode` 命令的 `command/run` 与 `command/done` 就是持久记录，`session-mode` 投影按 Session 折叠它们，`plan/mode` 事件折叠进同一视图。
- **按需渲染提示词段。** 未选中带指引的模式时 `mode:policy` 渲染为空串，因此默认模式不消耗 token，也不改变请求前缀。
- **权限固定。** 进入声明了 `permissionPreset` 的模式时，在下一个步骤边界应用该预设，并记住它替换掉的预设。离开模式时恢复记住的预设，除非它是 `danger-full-access` 或正在使用的 `auto`——这两种需要用户明确决定，保持不变。固定权限需要组合了 `permission-presets` 服务；没有该服务的部署会在选择时以可见错误拒绝该模式，而不是在缺少预设的情况下仍然进入模式。
- **可回放。** 投影从日志重新计算 `mode` 与 `pending`，重新加载的 Session 显示相同的选中模式。

<a id="model-experience"></a>
## 模型体验

### 模式策略段

#### 模型看到什么

选中一个已声明的模式期间，它的 `section` 文本属于每次请求的 `mode:policy` 系统提示词段。模型也会在对话流中看到被记录的 `/mode` 命令及其结果，并把固定的权限预设读作当前的沙箱与审批策略。

#### Token 影响

生效期间只有当前模式的指引存在，并保留在每一次请求中。默认模式渲染空段，因此请求中既没有 token，也没有分节标记。

#### KV Cache 影响

进入、离开或在模式之间切换都会替换 `mode:policy` 段，因此每次切换后请求前缀变化一次，并在其后的轮次中保持稳定。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **模式不能改动工具目录。** 工具目录稳定是刻意设计：对话中途改动会让提供商请求缓存失效，也使转录无法复现。需要不同工具集的场景应使用不同的 agent preset。
- **模式不按预设隔离。** 插件在 Host 侧组合一次、服务全部 Session，因此某个 preset 无法定义自己的私有模式。
- **没有降级路径。** 恢复记住的权限预设时会拒绝 `danger-full-access` 与 `auto`；从这两种预设进入固定模式的 Session，在离开后仍保留被固定的预设。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
