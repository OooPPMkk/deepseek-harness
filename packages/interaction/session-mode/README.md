---
description: "Recorded per-session collaboration modes for DeepSeek Harness: the /mode command, the mode policy prompt section, optional pinned permission presets, and the session-mode projection the composer selector reads."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-mode

English | [中文](README.zh.md)

## Summary

A session mode is a switchable collaboration policy for one Session. Every mode keeps the same tool catalog and differs only by its prompt section while selected; one mode may also pin a permission preset. The selection is recorded as a `/mode` command, so the session log alone reconstructs what the model was told.

`plan` is reserved: `/mode plan` delegates through the Agent's own `/plan` command, so presets that isolate `dsh-plan-mode` per Agent still work; folding `plan/mode` keeps `/plan` and the selector in sync.

## Table of Contents

- [Use this package](#use-this-package)
- [Configure modes](#configure-modes)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin on the Host plane next to `system-prompt`; the Web GUI adds `@deepseek-ai/dsh-client-ui-session-mode` for the composer control. Switching happens through the recorded command, from the selector or by typing it:

```
/mode ask
/mode debug
/mode plan
/mode off
```

`/mode off` returns to the deployment's own agent behavior — the empty selection the selector labels as the default mode. Modes that the deployment did not declare fail visibly and leave the current mode unchanged.

A mode that declares `permissionPreset` holds that preset for as long as it is in force: the projection reports it as `pinned`, so the composer's access control locks with an explanation instead of accepting an edit the next step would overwrite. Leaving the mode restores the preset observed on entry.

<a id="configure-modes"></a>
## Configure modes

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

| Field | Meaning |
| --- | --- |
| `id` | Kebab-case mode id passed to `/mode`. `off` and `plan` are reserved. |
| `section` | Guidance rendered as the `mode:policy` prompt section while the mode is in force. A declared mode needs non-empty text. |
| `permissionPreset` | Preset pinned while the mode is in force. `custom` and `auto` are rejected. |

Configuration is validated at plugin load: unknown keys, duplicate or reserved ids, and blank guidance fail loud rather than compose a mode that silently does nothing.

<a id="understand-the-implementation"></a>
## Understand the implementation

- **No new session event type.** `command/run` and `command/done` for the `mode` command are the durable record; the `session-mode` projection folds them per Session, and `plan/mode` events fold into the same view.
- **Prompt section on demand.** `mode:policy` renders empty unless a mode with guidance is selected, so the default mode costs no tokens and leaves the request prefix unchanged.
- **Permission pinning.** Entering a mode that declares `permissionPreset` applies that preset at the next step boundary and remembers the preset it replaced for that Session. Leaving the mode restores the remembered preset unless it was `danger-full-access` or live `auto`; those need an explicit user decision and stay put. The pin needs a composed `permission-presets` service, so a deployment without one refuses that mode at selection with a visible error instead of activating the mode without its preset.
- **Readable on replay.** The projection recomputes `mode` and `pending` from the log, so a reloaded Session shows the same selected mode.

<a id="model-experience"></a>
## Model Experience

### Mode policy section

#### What the model sees

While a declared mode is selected, its `section` text is part of the `mode:policy` system-prompt section of every request. The model also sees the recorded `/mode` command and its outcome as conversation flow, and reads a pinned permission preset as the current sandbox and approval policy.

#### Token effect

Only the selected mode's guidance is present, and it stays in every request while the mode is in force. The default mode renders an empty section, so neither tokens nor a section marker reach the request.

#### KV Cache effect

Switching into, out of, or between modes replaces the `mode:policy` section, so the request prefix changes once per switch and stays stable across the turns that follow it.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Modes cannot change the tool catalog.** Tool-catalog stability is deliberate: changing it mid-conversation invalidates the provider request cache and makes the transcript unreproducible. A mode that needs a different toolset is a different agent preset.
- **Modes are not preset-scoped.** The plugin composes once on the Host plane and serves every Session, so a preset cannot define its own private modes.
- **No downgrade path.** Restoring a remembered permission preset refuses `danger-full-access` and `auto`; a Session that entered a pinned mode from those presets keeps the pinned preset after leaving.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
