/**
 * Session modes are switchable collaboration policies: each mode contributes a
 * deployment-owned prompt section for as long as it is selected, and one mode
 * may also pin a permission preset while it is in force. The selection is a
 * recorded `/mode` command, so the log alone reconstructs what the model was
 * told; mode state never adds a session event type.
 *
 * Plan mode stays owned by `dsh-plan-mode`: `plan` is a reserved mode id that
 * delegates to the Agent-scoped `/plan` command, and the projection folds its
 * `plan/mode` events so entering or leaving plan through `/plan` updates the
 * same selection view.
 *
 * See packages/interaction/session-mode/README.md.
 *
 * @module @deepseek-ai/dsh-session-mode
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type CommandRuntime from '@deepseek-ai/dsh-commands'
import type { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
// Type-only: pulls the `plan/mode` event declaration this projection folds.
import type {} from '@deepseek-ai/dsh-plan-mode'
// Type-only: pulls the `permission/preset` event and `ctx.permissionPresets` declarations.
import type {} from '@deepseek-ai/dsh-permission-presets'
import type { SessionModeProjection, SessionModeUnitState } from './types.ts'
import {
  DEFAULT_MODE, MODE_COMMAND, MODE_OFF, PLAN_MODE, effectiveMode, resolveConfig, sessionModeProjection,
  type ResolvedConfig, type SessionModeConfig, type SessionModeProjectionDefinition,
} from './definition.ts'
import { SessionModeError } from './error.ts'

export type * from './types.ts'
export { SessionModeError, type SessionModeErrorCode } from './error.ts'
export type { SessionModeConfig, SessionModeSpec } from './definition.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionMode: SessionModeController
  }
}

/**
 * `ctx.sessionMode`: owns the `mode:policy` prompt section, the `/mode`
 * command, and the permission preset a mode pins while it is in force. Prompt
 * assembly fails while the projection reader is not ready; callers must await
 * plugin activation before running an agent.
 */
export class SessionModeController extends Service {
  static inject = ['systemPrompt', 'sessionProjections']

  /** Validated deployment modes. */
  private readonly config: ResolvedConfig

  private projectionHandle: ProjectionHandle<SessionModeUnitState> | undefined

  /** Permission preset observed when a pinning mode took effect, keyed by session. */
  private readonly pinned = new WeakMap<Session, { mode: string; origin: string }>()

  /** This composition's projection definition; the wire view needs the pin table. */
  private readonly definition: SessionModeProjectionDefinition

  /**
   * @param ctx - plugin context.
   * @param config - deployment modes; see {@link resolveConfig}.
   */
  constructor(ctx: Context, config: SessionModeConfig = { modes: [] }) {
    super(ctx, 'sessionMode')
    this.config = resolveConfig(config)
    this.definition = sessionModeProjection(mode => this.config.byId.get(mode)?.permissionPreset ?? null)
  }

  protected async [Service.init](): Promise<void> {
    const ctx = this.ctx
    ctx.systemPrompt.section({
      name: 'mode:policy',
      order: ctx.systemPrompt.getSectionOrder('SESSION_MODE_POLICY'),
      text: (context) => {
        if (context.agent === undefined) return ''
        return this.config.byId.get(this.effective(context.agent.session))?.section ?? ''
      },
    })
    this.projectionHandle = await ctx.sessionProjections.register(this.definition)
    // Pre-step is outside Session.append publication, so the pin is applied
    // inside an open turn without re-entering the session. A failed write must
    // not block the step.
    ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      try {
        this.syncPermission(agent.session)
      } catch (error) {
        ctx.logger.warn('dsh-session-mode: failed to apply the mode permission preset: %o', error)
      }
      return decision
    })
    ctx.inject(['commands'], (commandCtx) => {
      const commands = commandCtx.commands
      commands.register({
        definitionId: brandString<CommandDefinitionId>('@deepseek-ai/dsh-session-mode'),
        name: MODE_COMMAND,
        description: 'Switch the session collaboration mode',
        input: { hint: `[${[...this.config.modes.map(spec => spec.id), PLAN_MODE, MODE_OFF].join('|')}]` },
        handler: ({ agent, rawInput, signal }) => this.switchMode(commands, agent, rawInput.trim(), signal),
      })
    })
  }

  /**
   * Read the mode in force and whether a selection is still settling.
   *
   * @param session - the session to read.
   * @returns the projection value clients render.
   */
  get(session: Session): SessionModeProjection {
    return this.definition.wire.view(this.unitState(session))
  }

  /** The mode whose prompt section the next request must include. */
  private effective(session: Session): string {
    return effectiveMode(this.unitState(session))
  }

  private unitState(session: Session): SessionModeUnitState {
    if (this.projectionHandle === undefined) {
      throw new SessionModeError(
        'session modes are not ready; await plugin activation before running an agent',
        'MODE_STATE_UNAVAILABLE',
      )
    }
    return this.projectionHandle.stateOf(session)
  }

  /**
   * Apply `/mode [id|off]` against the calling agent. Plan is delegated to the
   * `/plan` command because `dsh-plan-mode` mounts inside each Agent's scoped
   * composition, where this root-level service cannot reach it directly; the
   * command registry resolves the agent's own view.
   * @param commands - the registry that dispatched this invocation.
   * @param agent - the agent whose session is switching.
   * @param wanted - trimmed `/mode` argument; empty reports the current mode.
   * @param signal - the dispatcher's cancellation signal.
   * @returns the outcome the dispatcher records.
   */
  private async switchMode(
    commands: CommandRuntime,
    agent: Agent,
    wanted: string,
    signal: AbortSignal,
  ): Promise<{ kind: 'success' | 'error'; text: string }> {
    const available = [...this.config.modes.map(spec => spec.id), PLAN_MODE, MODE_OFF]
    if (wanted === '') {
      const current = this.effective(agent.session)
      return { kind: 'success', text: `current mode ${current === DEFAULT_MODE ? 'default' : current} (available: ${available.join(', ')})` }
    }
    if (wanted !== PLAN_MODE && wanted !== MODE_OFF && !this.config.byId.has(wanted)) {
      return { kind: 'error', text: `unknown mode "${wanted}" (available: ${available.join(', ')})` }
    }
    const pinRefusal = this.presetRefusal(wanted)
    if (pinRefusal !== undefined) return { kind: 'error', text: pinRefusal }
    if (wanted === PLAN_MODE) {
      const delegated = await this.delegate(commands, agent, '/plan', signal)
      if (delegated === undefined) return { kind: 'error', text: 'plan mode is not composed in this deployment' }
      if (delegated.kind === 'error') return delegated
      this.syncPermissionAfterSwitch(agent.session, PLAN_MODE)
      return delegated
    }
    const leavingPlan = this.effective(agent.session) === PLAN_MODE
    if (leavingPlan) await this.delegate(commands, agent, '/plan off', signal)
    this.syncPermissionAfterSwitch(agent.session, wanted === MODE_OFF ? DEFAULT_MODE : wanted)
    const label = wanted === MODE_OFF ? 'default mode' : wanted
    return { kind: 'success', text: `Mode: ${label}.` }
  }

  /**
   * Run another command as this Agent, so a service isolated to the Agent's
   * composition is reachable from this root-level plugin.
   * @param commands - the registry whose agent view resolves the target.
   * @param agent - agent whose scoped command view resolves the target.
   * @param line - full command line.
   * @param signal - the dispatcher's cancellation signal.
   * @returns the nested outcome, or `undefined` when no such command is registered.
   */
  private async delegate(
    commands: CommandRuntime,
    agent: Agent,
    line: string,
    signal: AbortSignal,
  ): Promise<{ kind: 'success' | 'error'; text: string } | undefined> {
    const execution = await commands.execute(agent, line, [], signal)
    if (execution === undefined) return undefined
    const { kind, text } = execution.result
    return { kind, text: text ?? '' }
  }

  /**
   * Refuse a selection whose pinned preset this deployment cannot honour.
   * Activation does not depend on `permission-presets`, so an absent or
   * incomplete preset table surfaces here, before the mode is recorded.
   *
   * @param mode - the mode id being selected.
   * @returns refusal text, or `undefined` when the selection may proceed.
   */
  private presetRefusal(mode: string): string | undefined {
    const preset = this.config.byId.get(mode)?.permissionPreset
    if (preset === undefined) return undefined
    const presets = this.ctx.get('permissionPresets')
    if (presets === undefined) {
      return `mode "${mode}" pins permission preset "${preset}", but this deployment composes no permission presets`
    }
    if (!presets.names.includes(preset)) {
      return `mode "${mode}" pins unknown permission preset "${preset}" (available: ${presets.names.join(', ')})`
    }
    return undefined
  }

  /**
   * Apply the pin for a selection that has not been recorded yet: `command/done`
   * settles after the handler returns, so the caller names the target instead of
   * reading the projection.
   */
  private syncPermissionAfterSwitch(session: Session, wanted: string): void {
    try {
      this.syncPermission(session, wanted)
    } catch (error) {
      this.ctx.logger.warn('dsh-session-mode: failed to apply the mode permission preset: %o', error)
    }
  }

  /**
   * Keep the pinned permission preset in step with the mode in force: pinning
   * modes apply their preset once on entry, and leaving them restores the
   * preset observed on entry unless that preset is unrestricted or live Auto.
   *
   * @param session - session to reconcile.
   * @param selection - the mode being selected, when the caller is the command
   * handler and the projection has not settled yet.
   */
  private syncPermission(session: Session, selection?: string): void {
    const presets = this.ctx.get('permissionPresets')
    if (presets === undefined) return
    const mode = selection ?? this.effective(session)
    const spec = this.config.byId.get(mode)
    const pinned = this.pinned.get(session)
    if (spec?.permissionPreset !== undefined) {
      if (pinned !== undefined) return
      const origin = presets.current(session)
      this.pinned.set(session, { mode, origin })
      if (origin !== spec.permissionPreset) presets.set(session, spec.permissionPreset)
      return
    }
    if (pinned === undefined) return
    this.pinned.delete(session)
    const origin = pinned.origin
    if (!presets.names.includes(origin)) return
    // Re-granting the unrestricted preset or live Auto needs the client's risk
    // confirmation, which only the permission control can present.
    if (origin === 'auto' || presets.resolve(origin).sandbox === 'danger-full-access') return
    if (presets.current(session) !== origin) presets.set(session, origin)
  }
}

export default SessionModeController
