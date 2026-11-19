---
description: "Web 编辑器的协作模式选择器：在不改动工具目录的前提下，把会话切换到智能体、计划、问答、调试、并行模式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-session-mode

[English](README.md) | 中文

## 概述

模式选择器位于编辑器工具行、权限与计划控件之前。它显示本 Session 下一轮将使用的模式，并在用户选择其他模式时记录一条 `/mode` 命令。模式改变的是提示策略而非工具目录：请求形状保持稳定，模型读到的协作指引不同。

## 目录

- [使用本控件](#use-this-control)
- [实现说明](#understand-the-implementation)
- [失败处理](#failures)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-control"></a>
## 使用本控件

触发器显示模式图标与名称，编辑器变窄时只留图标。点击后展开五行——智能体、计划、问答、调试、并行——当前模式带勾选。只有 Host 组合了 `dsh-plan-mode` 时才会出现「计划」。

| 模式 | 变化 |
| --- | --- |
| 智能体 | 部署自身行为，即空记录选择；选择它记录 `/mode off`。 |
| 计划 | 委托给 `dsh-plan-mode`：先探索并提交计划，不直接实施。 |
| 问答 | 只读作答；模式生效期间 Host 固定为仅可查看权限。 |
| 调试 | 先复现并收集证据，再提出修复。 |
| 并行 | 把独立工作拆给并行的子代理；开启智能体团队协作时，把每一项登记到共享任务板。 |

在 Host 发布 `session-mode` 投影之前控件不渲染；模式命令在途或编辑器锁定期间控件保持禁用。

<a id="understand-the-implementation"></a>
## 实现说明

- **读投影而非本地状态。** 显示的模式来自 Host 的 `session-mode` 投影，它折叠被记录的 `/mode` 命令与 `plan/mode` 事件。命令被拒绝或未被识别时，显示的模式保持不变。
- **乐观标签、以折叠结果为准。** 点选后标签立即切换，触发器禁用直到命令落定，随后由折叠结果决定标签。
- **部署自定义模式可见。** 五个内置模式之外的 id 仍会作为选中行与触发器标签显示，避免部署自增模式被错误标注。
- **文案归语言包所有。** 模式名、描述与失败提示都在 `sessionMode` 字典中。

<a id="failures"></a>
## 失败处理

Host 未识别命令——没有组合 `/mode` 命令、模式 id 未被部署声明，或 Remote 拒绝——会清除乐观标签、恢复投影中的模式，并在触发器旁显示一条简短提示。下一次尝试时清除。

<a id="model-experience"></a>
## 模型体验

间接地，通过选择器提交的 `/mode` 命令行：`dsh-session-mode` 拥有该命令行驱动的 policy 段、固定权限预设与已记录状态。

#### KV Cache 影响

一次模式切换会替换一次 `mode:policy` 系统提示词段，因此请求前缀每次切换变化一次；选择器本身不添加任何提示词内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **选择器列出五个内置模式加上当前选中项。** 部署新增的模式需要先用 `/mode <id>` 选中一次才会出现。
- **两个控件都能关闭计划模式。** 计划模式生效时，原有的计划模式徽标仍保留在本选择器旁。
- **选择需要已实体的 Session。** 没有 Session 的草稿不显示选择器；切换过程中绑定消失时报告失败，而不是切换成新模式。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
