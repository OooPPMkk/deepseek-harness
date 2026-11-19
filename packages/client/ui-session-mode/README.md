---
description: "The Web composer's collaboration-mode selector: switch the Session between agent, plan, ask, debug, and multitask without changing the tool catalog."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-session-mode

English | [中文](README.zh.md)

## Summary

The mode selector sits in the composer tool row ahead of the permission and plan controls. It shows the mode this Session will use for its next Turn and records a `/mode` command when the user picks another one. Modes change the prompt policy, not the tool catalog: the request shape stays stable while the model reads different collaboration guidance.

## Table of Contents

- [Use this control](#use-this-control)
- [Understand the implementation](#understand-the-implementation)
- [Failures](#failures)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-control"></a>
## Use this control

The trigger shows the mode glyph and name, or the glyph alone when the composer is narrow. Clicking it opens the five rows — Agent, Plan, Ask, Debug, Multitask — with the current mode checked. Plan appears only when the host composes `dsh-plan-mode`.

| Mode | What changes |
| --- | --- |
| Agent | The deployment's own behavior; this is the empty recorded selection. Choosing it records `/mode off`. |
| Plan | Delegates to `dsh-plan-mode`: explore and submit a plan instead of implementing. |
| Ask | Read-only answers; the host pins a read-only permission preset while the mode is in force. |
| Debug | Reproduce and gather evidence before proposing a fix. |
| Multitask | Split independent work across parallel subagents; with Agent Teams enabled, register each item on the shared task board. |

The control renders nothing until the host publishes the `session-mode` projection, and it stays disabled while a mode command is pending or the composer is locked.

<a id="understand-the-implementation"></a>
## Understand the implementation

- **Projection, not local state.** The selected name comes from the host `session-mode` projection, which folds the recorded `/mode` command and the `plan/mode` events. A rejected or unadmitted command leaves the displayed mode unchanged.
- **Optimistic label, authoritative settle.** A pick shows immediately and the trigger disables until the command settles; the fold then decides the label.
- **Deployment modes stay visible.** A mode id outside the built-in five still renders as the selected row and on the trigger, so a deployment that adds its own modes is not silently mislabeled.
- **Locale-owned copy.** Mode names, descriptions, and the failure line live in the `sessionMode` dictionaries.

<a id="failures"></a>
## Failures

A command the host does not admit — no `/mode` command composed, a mode id the deployment did not declare, or a Remote rejection — clears the optimistic label, restores the projected mode, and shows a short status line beside the trigger. The next attempt clears it.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `/mode` command line the selector submits: `dsh-session-mode` owns the policy section, the pinned permission preset, and the logged state that line drives.

#### KV Cache effect

A mode change replaces the `mode:policy` system-prompt section once, so the request prefix changes once per switch; the selector itself adds no prompt content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The selector lists five built-in modes plus the current selection.** A mode a deployment adds appears only after `/mode <id>` selects it once.
- **Two controls can leave plan mode.** The plan status chip stays visible next to this selector while plan mode is active, so both turn plan mode off.
- **Selection needs a materialized Session.** A draft with no Session shows no selector, and a binding that disappears mid-switch reports a failure instead of a new mode.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
