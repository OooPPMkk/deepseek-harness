/**
 * Result-oriented row titles for a settled Tool call.
 *
 * A Tool row names the action while it runs ("搜索文件内容") and what the
 * action produced once it settles ("搜索到 6 处匹配"). The outcome is derived
 * from the same validated result metadata the expanded cards already read, so
 * the row and its card can never disagree about how much came back.
 *
 * A copy states a count only when that count is the point; the zero-result
 * variants carry no number, and every failed, running, or unclassified call
 * has no outcome at all — the row keeps its action title.
 */
import type { ToolCallBlock } from './tool-call-model.ts'
import { diffCardModel } from './diff-card-model.ts'
import { parsedToolCall } from './raw-tool-call.ts'
import { readCardModel } from './read-card-model.ts'
import { searchCardModel } from './search-card-model.ts'
import { webCardModel } from './web-card-model.ts'

/** Plural outcome keys and the singular key each selects for a count of one. */
const SINGULAR_KEYS = {
  'tool.outcome.readLines': 'tool.outcome.readLines.one',
  'tool.outcome.grepMatches': 'tool.outcome.grepMatches.one',
  'tool.outcome.globFiles': 'tool.outcome.globFiles.one',
  'tool.outcome.webSources': 'tool.outcome.webSources.one',
  'tool.outcome.patchFiles': 'tool.outcome.patchFiles.one',
} as const

type CountedOutcomeKey = keyof typeof SINGULAR_KEYS

/** The key a count selects, so a single result never reads as a plural. */
function countedKey(key: CountedOutcomeKey, count: number): CountedOutcomeKey | (typeof SINGULAR_KEYS)[CountedOutcomeKey] {
  return count === 1 ? SINGULAR_KEYS[key] : key
}

/** Localized copies an outcome can select, each with the count it interpolates. */
export type ToolOutcome =
  /** A completed read, in the lines it returned. */
  | { readonly key: CountedOutcomeKey | (typeof SINGULAR_KEYS)[CountedOutcomeKey]; readonly count: number }
  /** A grep that matched nothing. */
  | { readonly key: 'tool.outcome.grepNone' }
  /** A glob that found nothing. */
  | { readonly key: 'tool.outcome.globNone' }
  /** A web search that cited nothing. */
  | { readonly key: 'tool.outcome.webNone' }

/**
 * Derive the settled outcome a row states instead of its action title.
 *
 * An errored call has none, so the row keeps naming what failed. Whether a
 * settled outcome is displayed is the row's decision: it also withholds it for
 * a call that was stopped without an error.
 * @param block - preparing, dispatched, or settled Tool block.
 * @returns the outcome copy with its count, or undefined when the call has no
 * recorded result the row can summarize.
 */
export function toolOutcome(block: ToolCallBlock): ToolOutcome | undefined {
  if (!('kind' in block) || block.isError) return undefined
  const call = parsedToolCall(block)
  if (call === null) return undefined
  switch (call.name) {
    case 'read': {
      const card = readCardModel(block)
      return card === null
        ? undefined
        : { key: countedKey('tool.outcome.readLines', card.lines.length), count: card.lines.length }
    }
    case 'grep':
    case 'glob': {
      const card = searchCardModel(block)
      if (card === null) return undefined
      if (card.card.total === 0) {
        return { key: call.name === 'grep' ? 'tool.outcome.grepNone' : 'tool.outcome.globNone' }
      }
      return call.name === 'grep'
        ? { key: countedKey('tool.outcome.grepMatches', card.card.total), count: card.card.total }
        : { key: countedKey('tool.outcome.globFiles', card.card.total), count: card.card.total }
    }
    case 'web_search': {
      const card = webCardModel(block)
      if (card === null || card.kind !== 'search') return undefined
      return card.sources.length === 0
        ? { key: 'tool.outcome.webNone' }
        : { key: countedKey('tool.outcome.webSources', card.sources.length), count: card.sources.length }
    }
    case 'apply_patch':
    case 'edit': {
      const card = diffCardModel(block)
      return card === null
        ? undefined
        : { key: countedKey('tool.outcome.patchFiles', card.card.diffs.length), count: card.card.diffs.length }
    }
    default:
      return undefined
  }
}
