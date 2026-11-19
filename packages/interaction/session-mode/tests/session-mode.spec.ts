import { describe, expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, type SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { createScope } from '@deepseek-ai/dsh-scope'
import CommandRuntime, { type CommandId } from '@deepseek-ai/dsh-commands'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import PlanModeController from '@deepseek-ai/dsh-plan-mode'
import PermissionPresetService from '@deepseek-ai/dsh-permission-presets'
import SessionModeController from '../src/index.ts'
import {
  DEFAULT_MODE, MODE_OFF, PLAN_MODE, resolveConfig, sessionModeProjection, type SessionModeSpec,
} from '../src/definition.ts'
import type { SessionModeConfig } from '../src/index.ts'
import type { SessionModeUnitState } from '../src/types.ts'

const TEST_MODEL_SELECTION = { provider: 'test', model: 'test' }
const TEST_SIGNAL = new AbortController().signal

const MODES = {
  modes: [
    { id: 'ask', section: 'Answer questions without changing the workspace.' },
    { id: 'debug', section: 'Reproduce before you fix.' },
    { id: 'multitask', section: 'Delegate independent work in parallel.' },
  ],
} satisfies SessionModeConfig

const PINNED_MODES = {
  modes: [
    {
      id: 'ask',
      permissionPreset: 'read-only',
      section: 'Answer questions without changing the workspace.',
    },
    { id: 'debug', section: 'Reproduce before you fix.' },
  ],
} satisfies SessionModeConfig

/** Pin table used by the fold-only tests; the service tests exercise the real one. */
const NO_PINS = sessionModeProjection(() => null)

function foldEvents(
  events: readonly SessionEvent[],
  definition = NO_PINS,
): SessionModeUnitState {
  return events.reduce(
    (state, event) => definition.apply(state, event),
    definition.init(),
  )
}

function viewOf(
  events: readonly SessionEvent[],
  definition = NO_PINS,
): ReturnType<typeof NO_PINS.wire.view> {
  return definition.wire.view(foldEvents(events, definition))
}

function commandRun(session: Session, id: string, args: string): void {
  session.append('command/run', {
    commandId: brandString<CommandId>(id),
    name: 'mode',
    args,
    source: { kind: 'user' },
  })
}

function commandDone(session: Session, id: string, kind: 'success' | 'error'): void {
  session.append('command/done', {
    commandId: brandString<CommandId>(id),
    kind,
    ...kind === 'error' ? { text: 'failed' } : {},
  })
}

/** Contexts whose plan-mode plugin must mount inside each Agent's scope, as the Web presets compose it. */
const PLAN_IN_AGENT_SCOPE = new WeakSet<Context>()

/** Mount the loop prerequisites, the command surface, and this plugin. */
async function mountMode(
  ctx: Context,
  config: SessionModeConfig = MODES,
  plan: 'absent' | 'composed' | 'agent-scoped' = 'absent',
): Promise<void> {
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(CommandRuntime)
  if (plan === 'composed') await ctx.plugin(PlanModeController, { section: 'Plan guidance.' })
  if (plan === 'agent-scoped') PLAN_IN_AGENT_SCOPE.add(ctx)
  await ctx.plugin(SessionModeController, config)
}

/** Create an Agent over a real Session with a scoped context, as the loop does. */
async function agentWithSession(ctx: Context, id: string): Promise<Agent & { session: Session }> {
  const session = Session.create(brandString<SessionId>(id))
  const agent = {
    id: brandString<SessionId>(id),
    session,
    options: {},
    inject(message: UserMessage) { session.append('user/message', message, { surfaceOp: 'append' }) },
  } as Agent & { session: Session }
  let scoped!: Context
  /** Compose the Agent's scoped world, optionally with a plan plugin isolated to it. */
  async function composeAgentScope(inner: Context): Promise<void> {
    // The Web presets declare `isolate: { planMode: true }`, which hides the
    // service from every context outside the group.
    const scopedContext = PLAN_IN_AGENT_SCOPE.has(ctx) ? inner.isolate('planMode') : inner
    const scope = createScope(scopedContext, agent)
    scoped = scope.ctx
    if (PLAN_IN_AGENT_SCOPE.has(ctx)) await scope.ctx.plugin(PlanModeController, { section: 'Plan guidance.' })
  }
  await ctx.plugin(Object.assign(composeAgentScope, { inject: ['tools'] }))
  ;(agent as { ctx?: Context }).ctx = scoped
  const agents = ctx.get('agents')
  if (agents !== undefined) {
    agents.enter(agent)
    await agents.announce(agent, 'startup')
  }
  return agent
}

async function assemble(ctx: Context, agent: Agent) {
  const toolSet = await ctx.tools.resolve({ agent, modelSelection: TEST_MODEL_SELECTION, signal: TEST_SIGNAL })
  return ctx.systemPrompt.assemble({ agent, scope: agent, toolSet })
}

function sectionText(assembly: { sections: readonly { name: string; text: string }[] }, name: string): string | undefined {
  return assembly.sections.find(section => section.name === name)?.text
}

async function stepBoundary(ctx: Context, agent: Agent): Promise<void> {
  const message = createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } })
  await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { modelSelection: TEST_MODEL_SELECTION, messages: [message], turn: 1, step: 1, signal: TEST_SIGNAL },
    () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
  )
}

describe('resolveConfig', () => {
  it('accepts declared modes and indexes them by id', () => {
    const resolved = resolveConfig(PINNED_MODES)
    expect(resolved.modes.map(spec => spec.id)).toEqual(['ask', 'debug'])
    expect(resolved.byId.get('ask')?.permissionPreset).toBe('read-only')
    expect(resolved.byId.get('ask')?.section).toBe('Answer questions without changing the workspace.')
    expect(resolveConfig(MODES).byId.get('ask')?.permissionPreset).toBeUndefined()
  })

  it('rejects unknown keys, empty lists, and malformed ids', () => {
    expect(() => resolveConfig({ modes: [], extra: true } as SessionModeConfig)).toThrow('unknown key')
    expect(() => resolveConfig({ modes: [] })).toThrow('non-empty `modes`')
    expect(() => resolveConfig({ modes: [{ id: 'Ask' }] })).toThrow('kebab-case')
    expect(() => resolveConfig({ modes: [{ id: 'ask', note: 'x' } as SessionModeSpec] })).toThrow('unknown key')
  })

  it('refuses reserved ids, duplicates, blank guidance, and reserved presets', () => {
    expect(() => resolveConfig({ modes: [{ id: MODE_OFF }] })).toThrow('reserved mode id')
    expect(() => resolveConfig({ modes: [{ id: PLAN_MODE }] })).toThrow('reserved mode id')
    expect(() => resolveConfig({ modes: [{ id: 'debug' }, { id: 'debug' }] })).toThrow('twice')
    expect(() => resolveConfig({ modes: [{ id: 'debug', section: '   ' }] })).toThrow('non-empty `section`')
    expect(() => resolveConfig({ modes: [{ id: 'debug', permissionPreset: 'auto' }] })).toThrow('reserved preset')
    expect(() => resolveConfig({ modes: [{ id: 'debug', permissionPreset: 'custom' }] })).toThrow('reserved preset')
  })
})

describe('session-mode projection', () => {
  it('commits a settled selection and reports the default before one', () => {
    const session = Session.create(brandString<SessionId>('fold-1'))
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: DEFAULT_MODE, pending: false, pinned: null })
    commandRun(session, 'c1', ' ask ')
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: DEFAULT_MODE, pending: true, pinned: null })
    commandDone(session, 'c1', 'success')
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: 'ask', pending: false, pinned: null })
  })

  it('keeps the previous selection when a command fails', () => {
    const session = Session.create(brandString<SessionId>('fold-2'))
    commandRun(session, 'c1', 'debug')
    commandDone(session, 'c1', 'success')
    commandRun(session, 'c2', 'multitask')
    commandDone(session, 'c2', 'error')
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: 'debug', pending: false, pinned: null })
  })

  it('clears to the default on off and returns to the previous mode after plan', () => {
    const session = Session.create(brandString<SessionId>('fold-3'))
    commandRun(session, 'c1', 'debug')
    commandDone(session, 'c1', 'success')
    commandRun(session, 'c2', PLAN_MODE)
    commandDone(session, 'c2', 'success')
    // The plan selection alone changes nothing until plan-mode logs its state.
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: 'debug', pending: false, pinned: null })
    session.append('plan/mode', { active: true })
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: PLAN_MODE, pending: false, pinned: null })
    session.append('plan/mode', { active: false })
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: 'debug', pending: false, pinned: null })
    commandRun(session, 'c3', MODE_OFF)
    commandDone(session, 'c3', 'success')
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: DEFAULT_MODE, pending: false, pinned: null })
  })

  it('lets a directly entered plan period drive the mode and restores the default afterwards', () => {
    const session = Session.create(brandString<SessionId>('fold-4'))
    session.append('plan/mode', { active: true })
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: PLAN_MODE, pending: false, pinned: null })
    session.append('plan/mode', { active: false })
    expect(viewOf(session.snapshotEvents())).toEqual({ mode: DEFAULT_MODE, pending: false, pinned: null })
  })

  it('reports the preset the mode in force pins', () => {
    const pinned = sessionModeProjection(mode => mode === 'ask' ? 'read-only' : null)
    const session = Session.create(brandString<SessionId>('fold-5'))
    commandRun(session, 'c1', 'ask')
    commandDone(session, 'c1', 'success')
    expect(viewOf(session.snapshotEvents(), pinned)).toEqual({ mode: 'ask', pending: false, pinned: 'read-only' })

    commandRun(session, 'c2', MODE_OFF)
    commandDone(session, 'c2', 'success')
    expect(viewOf(session.snapshotEvents(), pinned)).toEqual({ mode: DEFAULT_MODE, pending: false, pinned: null })
  })
})

describe('session-mode prompt section', () => {
  it('renders only the active mode guidance', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountMode(ctx)
    const agent = await agentWithSession(ctx, 'section-1')

    expect(sectionText(await assemble(ctx, agent), 'mode:policy')).toBe('')

    await ctx.commands.execute(agent, '/mode debug', [], TEST_SIGNAL)
    expect(sectionText(await assemble(ctx, agent), 'mode:policy')).toBe('Reproduce before you fix.')

    await ctx.commands.execute(agent, '/mode off', [], TEST_SIGNAL)
    expect(sectionText(await assemble(ctx, agent), 'mode:policy')).toBe('')
  })

  it('leaves plan guidance to plan mode', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountMode(ctx, MODES, 'composed')
    const agent = await agentWithSession(ctx, 'section-2')

    await ctx.commands.execute(agent, '/mode plan', [], TEST_SIGNAL)
    const assembly = await assemble(ctx, agent)
    expect(sectionText(assembly, 'mode:policy')).toBe('')
    expect(sectionText(assembly, 'plan:policy')).toBe('Plan guidance.')
  })
})

describe('/mode command', () => {
  it('reports the current mode and rejects unknown ids', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountMode(ctx)
    const agent = await agentWithSession(ctx, 'command-1')
    expect(await ctx.commands.execute(agent, '/mode', [], TEST_SIGNAL)).toMatchObject({
      result: { kind: 'success', text: 'current mode default (available: ask, debug, multitask, plan, off)' },
    })
    expect(await ctx.commands.execute(agent, '/mode nope', [], TEST_SIGNAL)).toMatchObject({
      result: { kind: 'error', text: 'unknown mode "nope" (available: ask, debug, multitask, plan, off)' },
    })
    expect(ctx.sessionMode.get(agent.session)).toEqual({ mode: DEFAULT_MODE, pending: false, pinned: null })
  })

  it('refuses the reserved plan id when plan mode is not composed', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountMode(ctx)
    const agent = await agentWithSession(ctx, 'command-2')
    expect(await ctx.commands.execute(agent, '/mode plan', [], TEST_SIGNAL)).toMatchObject({
      result: { kind: 'error', text: 'plan mode is not composed in this deployment' },
    })
  })

  it('switches modes and leaves the reserved plan id to plan mode', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountMode(ctx, MODES, 'composed')
    const agent = await agentWithSession(ctx, 'command-3')

    expect(await ctx.commands.execute(agent, '/mode multitask', [], TEST_SIGNAL)).toMatchObject({
      result: { kind: 'success', text: 'Mode: multitask.' },
    })
    expect(ctx.sessionMode.get(agent.session).mode).toBe('multitask')

    expect(await ctx.commands.execute(agent, '/mode plan', [], TEST_SIGNAL)).toMatchObject({
      result: { kind: 'success', text: 'Plan mode on. Use /plan off to leave.' },
    })
    expect(ctx.planMode.get(agent).active).toBe(true)
    expect(ctx.sessionMode.get(agent.session).mode).toBe(PLAN_MODE)

    expect(await ctx.commands.execute(agent, '/mode debug', [], TEST_SIGNAL)).toMatchObject({
      result: { kind: 'success', text: 'Mode: debug.' },
    })
    expect(ctx.planMode.get(agent).active).toBe(false)
    expect(ctx.sessionMode.get(agent.session).mode).toBe('debug')
  })

  it('delegates plan through the Agent-scoped /plan command', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountMode(ctx, MODES, 'agent-scoped')
    const agent = await agentWithSession(ctx, 'command-4')
    // The Web presets isolate plan mode under each Agent, so the root context
    // never sees it; only the dispatching Agent's command view resolves /plan.
    expect(ctx.get('planMode') === undefined).toBe(true)

    const entered = await ctx.commands.execute(agent, '/mode plan', [], TEST_SIGNAL)
    expect(entered?.result.kind).toBe('success')
    expect(entered?.result.text).toBe('Plan mode on. Use /plan off to leave.')
    expect(ctx.sessionMode.get(agent.session).mode).toBe(PLAN_MODE)

    const left = await ctx.commands.execute(agent, '/mode debug', [], TEST_SIGNAL)
    expect(left?.result.kind).toBe('success')
    expect(left?.result.text).toBe('Mode: debug.')
    expect(ctx.sessionMode.get(agent.session).mode).toBe('debug')
  })
})

describe('pinned permission preset', () => {
  /** Compose the real permission service over stand-in shell and approval services. */
  async function mountWithPermissions(ctx: Context, config: SessionModeConfig = PINNED_MODES): Promise<void> {
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(CommandRuntime)
    await ctx.plugin(PlanModeController, { section: 'Plan guidance.' })
    ctx.provide('shell', {
      sandboxMode: 'workspace-write',
      resolve() { throw new Error('session-mode tests do not execute shell commands') },
      run() { throw new Error('session-mode tests do not execute shell commands') },
      start() { throw new Error('session-mode tests do not execute shell commands') },
    })
    ctx.provide('approval', { config: { policy: 'ask' } })
    await ctx.plugin(PermissionPresetService, {
      presets: {
        'read-only': { sandbox: 'read-only', approval: 'ask', name: 'read-only', description: 'read only' },
        'workspace-write': { sandbox: 'workspace-write', approval: 'ask', name: 'workspace-write', description: 'workspace' },
        'danger-full-access': { sandbox: 'danger-full-access', approval: 'never', name: 'danger-full-access', description: 'full' },
      },
    })
    await ctx.plugin(SessionModeController, config)
  }

  it('pins read-only while ask is in force and restores the observed preset', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountWithPermissions(ctx)
    const agent = await agentWithSession(ctx, 'permission-1')
    ctx.permissionPresets.set(agent.session, 'workspace-write')

    await ctx.commands.execute(agent, '/mode ask', [], TEST_SIGNAL)
    expect(ctx.permissionPresets.current(agent.session)).toBe('read-only')

    await ctx.commands.execute(agent, '/mode off', [], TEST_SIGNAL)
    expect(ctx.permissionPresets.current(agent.session)).toBe('workspace-write')
  })

  it('restores the observed preset when plan mode takes over at a step boundary', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountWithPermissions(ctx)
    const agent = await agentWithSession(ctx, 'permission-2')
    ctx.permissionPresets.set(agent.session, 'workspace-write')
    await ctx.commands.execute(agent, '/mode ask', [], TEST_SIGNAL)
    expect(ctx.permissionPresets.current(agent.session)).toBe('read-only')

    await ctx.commands.execute(agent, '/plan', [], TEST_SIGNAL)
    await stepBoundary(ctx, agent)
    expect(ctx.permissionPresets.current(agent.session)).toBe('workspace-write')
  })

  it('refuses to restore an unrestricted preset without the client confirmation', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountWithPermissions(ctx)
    const agent = await agentWithSession(ctx, 'permission-3')
    ctx.permissionPresets.set(agent.session, 'danger-full-access')

    await ctx.commands.execute(agent, '/mode ask', [], TEST_SIGNAL)
    expect(ctx.permissionPresets.current(agent.session)).toBe('read-only')

    await ctx.commands.execute(agent, '/mode off', [], TEST_SIGNAL)
    expect(ctx.permissionPresets.current(agent.session)).toBe('read-only')
  })

  it('refuses a pinning mode before recording it when the deployment composes no presets', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountMode(ctx, PINNED_MODES)
    const agent = await agentWithSession(ctx, 'permission-4')

    expect(await ctx.commands.execute(agent, '/mode ask', [], TEST_SIGNAL)).toMatchObject({
      result: { kind: 'error', text: 'mode "ask" pins permission preset "read-only", but this deployment composes no permission presets' },
    })
    expect(ctx.sessionMode.get(agent.session)).toEqual({ mode: DEFAULT_MODE, pending: false, pinned: null })
  })

  it('refuses a pinned preset the composed table does not offer', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountWithPermissions(ctx, { modes: [{ id: 'ask', permissionPreset: 'team-policy', section: 'Answer only.' }] })
    const agent = await agentWithSession(ctx, 'permission-5')

    expect(await ctx.commands.execute(agent, '/mode ask', [], TEST_SIGNAL)).toMatchObject({
      result: {
        kind: 'error',
        text: 'mode "ask" pins unknown permission preset "team-policy" (available: read-only, workspace-write, danger-full-access)',
      },
    })
    expect(ctx.sessionMode.get(agent.session)).toEqual({ mode: DEFAULT_MODE, pending: false, pinned: null })
  })
})
