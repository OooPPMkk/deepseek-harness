/** Chat presentation derived from Host-backed detail, collapse timing, folded replies, and reasoning disclosure. */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import {
  DEFAULT_FOLDED_REPLIES, DEFAULT_REASONING_DISCLOSURE, type CollapseTiming, type FoldedReplies,
  type ReasoningDisclosure, type TranscriptViewMode,
} from '../chat-settings.ts'
export {
  COLLAPSE_TIMINGS, FOLDED_REPLIES, REASONING_DISCLOSURES, type CollapseTiming, type FoldedReplies,
  type ReasoningDisclosure,
} from '../chat-settings.ts'

/** Presentation capabilities that one work-details mode enables. */
export interface ChatPresentationPolicy {
  /** Preference identity for layout resets and diagnostics; renderers select the capabilities below. */
  readonly mode: TranscriptViewMode
  /** Saved collapse timing; completion retains the default immediate folding and scrolling. */
  readonly collapseTiming: CollapseTiming
  /** Assistant replies that stay visible while a completed Turn folds: every reply, or only the final answer. */
  readonly foldedReplies: FoldedReplies
  /** Whether a normally completed Turn folds its process rows behind the whole-Turn control. */
  readonly foldCompletedTurns: boolean
  /** Collapsible group headers for all Turns, historical Turns only, or no Turns. */
  readonly stepGrouping: 'collapsed' | 'history' | 'none'
  /** Show the running command, path, query, or reasoning detail in group titles. */
  readonly liveProcessDetail: boolean
  /** Whether a settled reasoning row previews its first line beside the Think title. */
  readonly settledReasoningPreview: boolean
  /** Whether a reasoning body starts expanded; the reader can still toggle any single row. */
  readonly revealReasoning: boolean
}

const POLICIES: Readonly<Record<TranscriptViewMode, Omit<ChatPresentationPolicy, 'collapseTiming' | 'foldedReplies' | 'revealReasoning'>>> = {
  compact: {
    mode: 'compact',
    foldCompletedTurns: true,
    stepGrouping: 'collapsed',
    liveProcessDetail: false,
    settledReasoningPreview: false,
  },
  standard: {
    mode: 'standard',
    foldCompletedTurns: true,
    stepGrouping: 'collapsed',
    liveProcessDetail: true,
    settledReasoningPreview: true,
  },
  detailed: {
    mode: 'detailed',
    foldCompletedTurns: true,
    stepGrouping: 'history',
    liveProcessDetail: true,
    settledReasoningPreview: true,
  },
  verbose: {
    mode: 'verbose',
    foldCompletedTurns: false,
    stepGrouping: 'none',
    liveProcessDetail: false,
    settledReasoningPreview: true,
  },
}

function withTiming(
  collapseTiming: CollapseTiming,
  foldedReplies: FoldedReplies,
  revealReasoning: boolean,
): Readonly<Record<TranscriptViewMode, ChatPresentationPolicy>> {
  const policy = (mode: TranscriptViewMode): ChatPresentationPolicy =>
    ({ ...POLICIES[mode], collapseTiming, foldedReplies, revealReasoning })
  return {
    compact: policy('compact'),
    standard: policy('standard'),
    detailed: policy('detailed'),
    verbose: policy('verbose'),
  }
}

const TIMING_POLICIES = {
  completion: {
    all: {
      collapsed: withTiming('completion', 'all', false),
      expanded: withTiming('completion', 'all', true),
    },
    final: {
      collapsed: withTiming('completion', 'final', false),
      expanded: withTiming('completion', 'final', true),
    },
  },
  'next-input': {
    all: {
      collapsed: withTiming('next-input', 'all', false),
      expanded: withTiming('next-input', 'all', true),
    },
    final: {
      collapsed: withTiming('next-input', 'final', false),
      expanded: withTiming('next-input', 'final', true),
    },
  },
}

/**
 * Resolve a stable policy for one detail mode, collapse timing, folded-reply choice, and reasoning disclosure.
 * @param mode - persisted work-details mode.
 * @param collapseTiming - persisted timing; defaults to immediate completion folding.
 * @param foldedReplies - persisted folded-reply choice; defaults to keeping every reply visible.
 * @param reasoningDisclosure - persisted reasoning presentation; defaults to collapsed rows.
 * @returns the same policy object for the same choices.
 */
export function presentationPolicyFor(
  mode: TranscriptViewMode,
  collapseTiming: CollapseTiming = 'completion',
  foldedReplies: FoldedReplies = DEFAULT_FOLDED_REPLIES,
  reasoningDisclosure: ReasoningDisclosure = DEFAULT_REASONING_DISCLOSURE,
): ChatPresentationPolicy {
  return TIMING_POLICIES[collapseTiming][foldedReplies][reasoningDisclosure][mode]
}

/**
 * Combine Host-backed detail, persisted timing, folded replies, and reasoning disclosure without owning subscriptions.
 * @param mode - live work-details mode.
 * @param collapseTiming - live Host-backed collapse timing.
 * @param foldedReplies - live Host-backed folded-reply choice.
 * @param reasoningDisclosure - live Host-backed reasoning presentation.
 * @returns observable policy whose subscriptions follow all four preferences.
 */
export function derivePresentationPolicy(
  mode: ObservableSnapshot<TranscriptViewMode>,
  collapseTiming: ObservableSnapshot<CollapseTiming>,
  foldedReplies: ObservableSnapshot<FoldedReplies>,
  reasoningDisclosure: ObservableSnapshot<ReasoningDisclosure>,
): ObservableSnapshot<ChatPresentationPolicy> {
  return {
    getSnapshot: () => presentationPolicyFor(
      mode.getSnapshot(), collapseTiming.getSnapshot(), foldedReplies.getSnapshot(), reasoningDisclosure.getSnapshot(),
    ),
    subscribe: (listener) => {
      const unsubscribeMode = mode.subscribe(listener)
      const unsubscribeTiming = collapseTiming.subscribe(listener)
      const unsubscribeReplies = foldedReplies.subscribe(listener)
      const unsubscribeDisclosure = reasoningDisclosure.subscribe(listener)
      return () => {
        unsubscribeMode()
        unsubscribeTiming()
        unsubscribeReplies()
        unsubscribeDisclosure()
      }
    },
  }
}
