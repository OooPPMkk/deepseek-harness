// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { TranscriptViewMode } from '../src/chat-settings.ts'
import {
  COLLAPSE_TIMINGS, FOLDED_REPLIES, REASONING_DISCLOSURES, derivePresentationPolicy, presentationPolicyFor,
  type ChatPresentationPolicy, type CollapseTiming, type FoldedReplies, type ReasoningDisclosure,
} from '../src/client/presentation-policy.ts'

afterEach(cleanup)

describe('Chat presentation policy', () => {
  it.each([
    ['compact', true, 'collapsed', false, false],
    ['standard', true, 'collapsed', true, true],
    ['detailed', true, 'history', true, true],
    ['verbose', false, 'none', true, false],
  ] as const)('maps %s to stable presentation capabilities', (mode, foldCompletedTurns, stepGrouping, settledReasoningPreview, liveProcessDetail) => {
    const policy = presentationPolicyFor(mode)
    expect(policy).toEqual({
      mode, collapseTiming: 'completion', foldedReplies: 'all', foldCompletedTurns, stepGrouping, settledReasoningPreview,
      liveProcessDetail, revealReasoning: false,
    })
    expect(presentationPolicyFor(mode)).toBe(policy)
    expect(presentationPolicyFor(mode, 'completion')).toBe(policy)
    expect(presentationPolicyFor(mode, 'completion', 'all')).toBe(policy)
    expect(presentationPolicyFor(mode, 'completion', 'all', 'collapsed')).toBe(policy)
    const deferred = presentationPolicyFor(mode, 'next-input')
    expect(deferred).toEqual({ ...policy, collapseTiming: 'next-input' })
    expect(presentationPolicyFor(mode, 'next-input')).toBe(deferred)
    expect(deferred).not.toBe(policy)
    const finalOnly = presentationPolicyFor(mode, 'completion', 'final')
    expect(finalOnly).toEqual({ ...policy, foldedReplies: 'final' })
    expect(presentationPolicyFor(mode, 'completion', 'final')).toBe(finalOnly)
    const revealed = presentationPolicyFor(mode, 'completion', 'all', 'expanded')
    expect(revealed).toEqual({ ...policy, revealReasoning: true })
    expect(presentationPolicyFor(mode, 'completion', 'all', 'expanded')).toBe(revealed)
    expect(revealed).not.toBe(policy)
  })

  it('keeps all thirty-two mode, timing, folded-reply, and reasoning policies distinct and stable', () => {
    const policies = new Set<ChatPresentationPolicy>()
    for (const mode of ['compact', 'standard', 'detailed', 'verbose'] as const) {
      for (const timing of COLLAPSE_TIMINGS) {
        for (const replies of FOLDED_REPLIES) {
          for (const reasoning of REASONING_DISCLOSURES) policies.add(presentationPolicyFor(mode, timing, replies, reasoning))
        }
      }
    }
    expect(policies.size).toBe(32)
  })

  it('forwards all four preferences and removes their subscriptions on disposal', () => {
    const mode = createSnapshotStore<TranscriptViewMode>('compact')
    const timing = createSnapshotStore<CollapseTiming>('completion')
    const replies = createSnapshotStore<FoldedReplies>('all')
    const reasoning = createSnapshotStore<ReasoningDisclosure>('collapsed')
    const policy = derivePresentationPolicy(mode, timing, replies, reasoning)
    const listener = vi.fn()
    const dispose = policy.subscribe(listener)
    expect(policy.getSnapshot()).toBe(presentationPolicyFor('compact'))
    mode.set('detailed')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(policy.getSnapshot()).toBe(presentationPolicyFor('detailed'))
    timing.set('next-input')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(policy.getSnapshot()).toBe(presentationPolicyFor('detailed', 'next-input'))
    timing.set('next-input')
    expect(listener).toHaveBeenCalledTimes(2)
    replies.set('final')
    expect(listener).toHaveBeenCalledTimes(3)
    expect(policy.getSnapshot()).toBe(presentationPolicyFor('detailed', 'next-input', 'final'))
    reasoning.set('expanded')
    expect(listener).toHaveBeenCalledTimes(4)
    expect(policy.getSnapshot()).toBe(presentationPolicyFor('detailed', 'next-input', 'final', 'expanded'))
    dispose()
    mode.set('verbose')
    timing.set('completion')
    replies.set('all')
    reasoning.set('collapsed')
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('renders only consumers whose selected field changes', () => {
    const mode = createSnapshotStore<TranscriptViewMode>('compact')
    const timing = createSnapshotStore<CollapseTiming>('completion')
    const usePresentation = bindSnapshotSelector(derivePresentationPolicy(
      mode, timing, createSnapshotStore<FoldedReplies>('all'), createSnapshotStore<ReasoningDisclosure>('collapsed'),
    ))
    const foldRender = vi.fn()
    const previewRender = vi.fn()
    function Fold() {
      const fold = usePresentation(policy => policy.foldCompletedTurns)
      foldRender(fold)
      return <span>{String(fold)}</span>
    }
    function Preview() {
      const preview = usePresentation(policy => policy.settledReasoningPreview)
      previewRender(preview)
      return <span>{String(preview)}</span>
    }
    render(<><Fold /><Preview /></>)
    expect(foldRender).toHaveBeenCalledTimes(1)
    expect(previewRender).toHaveBeenCalledTimes(1)
    act(() => { mode.set('detailed') })
    expect(foldRender).toHaveBeenCalledTimes(1)
    expect(previewRender).toHaveBeenCalledTimes(2)
    act(() => { mode.set('standard') })
    expect(foldRender).toHaveBeenCalledTimes(1)
    expect(previewRender).toHaveBeenCalledTimes(2)
    act(() => { mode.set('compact') })
    expect(foldRender).toHaveBeenCalledTimes(1)
    expect(previewRender).toHaveBeenCalledTimes(3)
    act(() => { timing.set('next-input') })
    expect(foldRender).toHaveBeenCalledTimes(1)
    expect(previewRender).toHaveBeenCalledTimes(3)
  })
})
