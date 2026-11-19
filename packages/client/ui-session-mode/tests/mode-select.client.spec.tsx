// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionModeProjection } from '@deepseek-ai/dsh-session-mode/client'
import { ModeSelect, type ModeSelectProps } from '../src/client/ModeSelect.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: ModeSelectProps['t'] = makeTranslate(zh)

function setup(options: {
  mode?: string | undefined
  pending?: boolean
  planAvailable?: boolean
  locked?: boolean
  select?: (mode: string) => Promise<boolean>
} = {}) {
  const mode = createSnapshotStore<{ value: SessionModeProjection | undefined }>({
    value: 'mode' in options
      ? options.mode === undefined ? undefined : { mode: options.mode, pending: options.pending ?? false, pinned: null }
      : { mode: '', pending: options.pending ?? false, pinned: null },
  })
  const plan = createSnapshotStore<{ value: { active: boolean } | undefined }>(
    { value: options.planAvailable === false ? undefined : { active: false } },
  )
  const read = (state: unknown): unknown => (state as { value: unknown }).value
  const useProjection = ((key: string, selector?: (value: unknown) => unknown) => {
    const source: { getSnapshot: () => { value: unknown } } = key === 'plan' ? plan : mode
    return bindSnapshotSelector(source as never)(state => (selector ?? (value => value))(read(state)))
  }) as ModeSelectProps['useProjection']
  const select = vi.fn(options.select ?? (() => Promise.resolve(true)))
  // The session standard kit carries hooks this component never calls; the
  // runtime supplies all of them, so only the exercised members are real here.
  const props = {
    locked: options.locked ?? false,
    useProjection,
    select,
    t,
  } as Partial<ModeSelectProps> as ModeSelectProps
  const view = render(<ModeSelect {...props} />)
  return { mode, plan, props, select, view }
}

function trigger(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^对话模式/ }) as HTMLButtonElement
}

describe('ModeSelect', () => {
  it('renders nothing until the host publishes the session-mode projection', () => {
    const { view } = setup({ mode: undefined })
    expect(view.container.innerHTML).toBe('')
  })

  it('shows the default mode and offers every composed mode', () => {
    setup()
    expect(trigger().textContent).toBe('智能体')
    expect(trigger().getAttribute('aria-label')).toBe('对话模式，当前：智能体')
    expect(trigger().getAttribute('title')).toBe('默认行为，使用全部工具。')
    expect(trigger().disabled).toBe(false)

    fireEvent.click(trigger())
    expect(screen.getAllByRole('menuitem').map(item => item.textContent))
      .toEqual(['智能体', '计划', '问答', '调试', '并行'])
    expect([...document.querySelectorAll('[role="menuitem"] svg')]
      .every(icon => icon.closest('[aria-hidden="true"]') !== null)).toBe(true)
  })

  it('submits an ordinary choice optimistically and re-enables after admission', async () => {
    const submitted = Promise.withResolvers<boolean>()
    const { select } = setup({ select: () => submitted.promise })

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: '问答' }))

    expect(select).toHaveBeenCalledExactlyOnceWith('ask')
    expect(trigger().textContent).toBe('问答')
    expect(trigger().disabled).toBe(true)
    expect(screen.queryByRole('menuitem')).toBeNull()

    submitted.resolve(true)
    await act(async () => { await submitted.promise })
    expect(trigger().disabled).toBe(false)
  })

  it('ignores the already-current row', () => {
    const { select } = setup({ mode: 'ask' })
    expect(trigger().textContent).toBe('问答')
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: '问答' }))
    expect(select).not.toHaveBeenCalled()
  })

  it('hides the plan row while plan mode is not composed', () => {
    setup({ planAvailable: false })
    fireEvent.click(trigger())
    expect(screen.getAllByRole('menuitem').map(item => item.textContent))
      .toEqual(['智能体', '问答', '调试', '并行'])
  })

  it('names a deployment mode outside the built-in set', () => {
    setup({ mode: 'review-hard' })
    expect(trigger().textContent).toBe('Review Hard')
    expect(trigger().getAttribute('title')).toBe('选择对话模式')
    fireEvent.click(trigger())
    expect(screen.getAllByRole('menuitem').map(item => item.textContent))
      .toEqual(['Review Hard', '智能体', '计划', '问答', '调试', '并行'])
  })

  it('reports a rejected switch and clears the optimistic name', async () => {
    const select = vi.fn(() => Promise.resolve(false))
    setup({ mode: 'ask', select })
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: '调试' }))
    await act(async () => {})
    expect(trigger().textContent).toBe('问答')
    expect(screen.getByRole('status').textContent).toBe('切换对话模式失败')
  })

  it('treats a throwing switch as a rejected one', async () => {
    const select = vi.fn(() => Promise.reject(new Error('offline')))
    setup({ select })
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: '计划' }))
    await act(async () => {})
    expect(trigger().textContent).toBe('智能体')
    expect(screen.getByRole('status').textContent).toBe('切换对话模式失败')
  })

  it('stays disabled while the host reports a pending mode command', () => {
    setup({ pending: true })
    expect(trigger().disabled).toBe(true)
  })

  it('revokes the open menu and disables the trigger when locked', () => {
    const { props, view } = setup()
    fireEvent.click(trigger())
    expect(screen.getAllByRole('menuitem')).toHaveLength(5)
    view.rerender(<ModeSelect {...props} locked />)
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(trigger().disabled).toBe(true)
  })

  it('revokes the open menu when the projection disappears', () => {
    const { mode } = setup()
    fireEvent.click(trigger())
    expect(screen.getAllByRole('menuitem')).toHaveLength(5)
    act(() => { mode.set({ value: undefined }) })
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
