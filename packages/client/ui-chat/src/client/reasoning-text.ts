/** Display text preparation for model reasoning. */
import type { AssistantBlock } from './contract/snapshot.ts'

/**
 * Recorded Step boundaries the thinking duration reads.
 * Mirrors the Assistant node timing; only these two fields are needed.
 */
export interface ThinkingTiming {
  /** Matching step/start timestamp, or null outside the loaded event window. */
  readonly stepStartTime: number | null
  /** First non-empty delta timestamp, or null when no delta was recorded. */
  readonly firstTokenTime: number | null
}

/**
 * Elapsed thinking time recorded for a Step.
 *
 * The step's first non-tool-call block must be the reasoning block being
 * labelled; otherwise the first token belongs to other material and time to
 * that token would not describe this reasoning. The figure is the recorded time
 * to the first token, the closest boundary the session log keeps for thinking.
 * @param blocks - the Step's Assistant blocks in protocol order.
 * @param timing - recorded Step boundaries, when the Step has settled.
 * @returns milliseconds spent before the first token, or undefined when unrecorded or not this block's time.
 */
export function thinkingDurationMs(
  blocks: readonly AssistantBlock[],
  timing: ThinkingTiming | undefined,
): number | undefined {
  if (timing === undefined || timing.stepStartTime === null || timing.firstTokenTime === null) return undefined
  const first = blocks.find(block => block.kind !== 'tool-call')
  if (first?.kind !== 'reasoning' || first.text.trim() === '') return undefined
  return Math.max(0, timing.firstTokenTime - timing.stepStartTime)
}

/**
 * Prepare complete or streaming reasoning for display.
 * @param text - original complete or streaming reasoning.
 * @returns display text, or empty text when no displayable content is available.
 */
export function reasoningText(text: string): string {
  if (text[0] !== '<') return text
  /* v8 ignore start -- Custom rendering behavior is outside unit coverage. */
  const opening = '<signature>'
  if (opening.startsWith(text)) return ''
  if (!text.startsWith(opening)) return text
  const closing = '</signature>'
  const end = text.indexOf(closing, opening.length)
  if (end === -1) return ''
  let start = end + closing.length
  while (start < text.length) {
    if (text[start] === '\n') start++
    else if (text[start] === '\r' && text[start + 1] === '\n') start += 2
    else break
  }
  return text.slice(start)
  /* v8 ignore stop */
}
