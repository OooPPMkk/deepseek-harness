/**
 * Mode vocabulary and the `session-mode` projection definition. Internal to
 * the plugin package: the entry point keeps the plugin surface (the service
 * class and its `Config`), so `verify-plugin-entry-exports` sees no extra
 * package-level values.
 *
 * @module @deepseek-ai/dsh-session-mode/definition
 */

import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { SessionModeProjection, SessionModeUnitState } from './types.ts'

/** The reserved mode id that means the deployment's own agent behavior. */
export const DEFAULT_MODE = ''

/** The reserved mode id that delegates to plan mode. */
export const PLAN_MODE = 'plan'

/** The argument that clears the selection and returns to {@link DEFAULT_MODE}. */
export const MODE_OFF = 'off'

/** The slash command that switches modes. */
export const MODE_COMMAND = 'mode'

/** One deployment-declared mode. */
export interface SessionModeSpec {
  /** Mode id passed to `/mode`; never `off` or `plan`. */
  id: string
  /** Guidance rendered as the `mode:policy` prompt section while the mode is in force. */
  section?: string
  /**
   * Permission preset pinned while the mode is in force. Leaving the mode
   * restores the preset observed on entry unless that preset is the
   * unrestricted one or live Auto.
   */
  permissionPreset?: string
}

/** Deployment-owned session-mode configuration. */
export interface SessionModeConfig {
  /** Declared modes, in menu order. */
  modes: SessionModeSpec[]
}

/** Validated configuration with an id index. */
export interface ResolvedConfig {
  readonly modes: readonly SessionModeSpec[]
  readonly byId: ReadonlyMap<string, SessionModeSpec>
}

const MODE_ID = /^[a-z][a-z0-9-]*$/
/** Preset names the permission service reserves for derived state and live review. */
const RESERVED_PRESETS: readonly string[] = ['custom', 'auto']

/**
 * Validate deployment-owned mode definitions. Missing, blank, duplicate, or
 * reserved ids, unknown fields, and blank guidance fail at plugin load.
 *
 * @param config - raw plugin config.
 * @returns the validated configuration with its id index.
 */
export function resolveConfig(config: SessionModeConfig): ResolvedConfig {
  const unknown = Object.keys(config).filter(key => key !== 'modes')
  if (unknown.length > 0) {
    throw new Error(`SessionModeConfig has unknown key(s) ${unknown.join(', ')} — config is { modes }`)
  }
  const modes = (config as Partial<SessionModeConfig>).modes
  if (!Array.isArray(modes) || modes.length === 0) {
    throw new Error('SessionModeConfig needs a non-empty `modes` list')
  }
  const byId = new Map<string, SessionModeSpec>()
  for (const entry of modes) {
    const spec = entry as Partial<SessionModeSpec>
    const extra = Object.keys(spec).filter(key => key !== 'id' && key !== 'section' && key !== 'permissionPreset')
    if (extra.length > 0) {
      throw new Error(`SessionModeConfig mode ${JSON.stringify(spec.id)} has unknown key(s) ${extra.join(', ')}`)
    }
    if (typeof spec.id !== 'string' || !MODE_ID.test(spec.id)) {
      throw new Error(`SessionModeConfig needs a kebab-case mode \`id\`, got ${JSON.stringify(spec.id)}`)
    }
    if (spec.id === MODE_OFF || spec.id === PLAN_MODE) {
      throw new Error(`SessionModeConfig cannot redeclare the reserved mode id ${JSON.stringify(spec.id)}`)
    }
    if (byId.has(spec.id)) {
      throw new Error(`SessionModeConfig declares mode ${JSON.stringify(spec.id)} twice`)
    }
    if (spec.section !== undefined && (typeof spec.section !== 'string' || spec.section.trim() === '')) {
      throw new Error(`SessionModeConfig mode ${JSON.stringify(spec.id)} needs a non-empty \`section\` when declared`)
    }
    const preset = spec.permissionPreset
    if (preset !== undefined) {
      if (typeof preset !== 'string' || preset.trim() === '') {
        throw new Error(`SessionModeConfig mode ${JSON.stringify(spec.id)} needs a non-empty \`permissionPreset\` when declared`)
      }
      if (RESERVED_PRESETS.includes(preset)) {
        throw new Error(`SessionModeConfig mode ${JSON.stringify(spec.id)} cannot pin the reserved preset ${JSON.stringify(preset)}`)
      }
    }
    byId.set(spec.id, {
      id: spec.id,
      ...spec.section === undefined ? {} : { section: spec.section },
      ...preset === undefined ? {} : { permissionPreset: preset },
    })
  }
  return { modes: [...byId.values()], byId }
}

/** Recorded command ids arrive as plain strings on the wire, as in the plan projection. */
const commandIdSchema = zod.string().transform((value): CommandId => brandString<CommandId>(value))

const unitStateSchema: ZodType<SessionModeUnitState> = zod.object({
  selected: zod.string().nullable(),
  previous: zod.string().nullable(),
  running: zod.object({
    commandId: commandIdSchema,
    mode: zod.string(),
  }).strict().nullable(),
  planActive: zod.boolean(),
}).strict()

/** Wire payload schema of the `session-mode` projection. */
const projectionSchema: ZodType<SessionModeProjection> = zod.object({
  mode: zod.string(),
  pending: zod.boolean(),
  pinned: zod.string().nullable(),
})

/** Resolves the permission preset a mode holds, or `null` when it pins none. */
export type SessionModePinLookup = (mode: string) => string | null

/** This projection's definition with the client view it always registers. */
export type SessionModeProjectionDefinition =
  ProjectionDefinition<'session-mode', SessionModeUnitState> & {
    /** Empty-log state; this unit reads nothing from the Session header. */
    init(): SessionModeUnitState
    wire: {
      viewSchema: ZodType<SessionModeProjection>
      view(state: SessionModeUnitState): SessionModeProjection
    }
  }

/**
 * Build the projection definition. Folding stays deployment-independent — the
 * persisted unit state holds only recorded selections and the logged plan
 * state — while the wire view resolves the preset the mode in force pins from
 * the caller's mode table, because only the deployment knows that pairing.
 * @param pinOf - deployment lookup for a mode's pinned permission preset.
 * @returns the definition to register.
 */
export function sessionModeProjection(pinOf: SessionModePinLookup): SessionModeProjectionDefinition {
  return {
    key: 'session-mode',
    stateVersion: 1,
    stateSchema: unitStateSchema,
    init: (): SessionModeUnitState => ({ selected: null, previous: null, running: null, planActive: false }),
    apply: (state, event) => {
      if (event.type === 'command/run' && event.data.name === MODE_COMMAND) {
        const args = event.data.args
        if (args === undefined) return state
        const mode = args.trim()
        if (mode === '') return state
        return { ...state, running: { commandId: event.data.commandId, mode } }
      }
      if (event.type === 'command/done') {
        const running = state.running
        if (running === null || event.data.commandId !== running.commandId) return state
        if (event.data.kind !== 'success') return { ...state, running: null }
        if (running.mode === MODE_OFF) return { ...state, selected: null, previous: null, running: null }
        if (running.mode === PLAN_MODE) return { ...state, selected: PLAN_MODE, running: null }
        return { ...state, selected: running.mode, previous: running.mode, running: null }
      }
      if (event.type === 'plan/mode') return { ...state, planActive: event.data.active }
      return state
    },
    wire: {
      viewSchema: projectionSchema,
      view: (state) => {
        const mode = effectiveMode(state)
        return { mode, pending: state.running !== null, pinned: pinOf(mode) }
      },
    },
  }
}

/**
 * Derive the mode in force from folded state: plan wins while logged active,
 * otherwise the last explicit selection, else the previous non-plan selection.
 *
 * @param state - folded unit state.
 * @returns the mode id, or {@link DEFAULT_MODE}.
 */
export function effectiveMode(state: SessionModeUnitState): string {
  if (state.planActive) return PLAN_MODE
  if (state.selected === null) return DEFAULT_MODE
  return state.selected === PLAN_MODE ? state.previous ?? DEFAULT_MODE : state.selected
}
