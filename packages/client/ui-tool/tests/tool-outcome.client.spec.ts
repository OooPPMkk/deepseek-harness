// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { StartedToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { toolOutcome } from '../src/client/tool/models/tool-outcome.ts'

const GREP_ARGS = '{"pattern":"foo","path":"src"}'
const GLOB_ARGS = '{"pattern":"**/*.ts","path":"src"}'
const READ_ARGS = '{"file_path":"src/a.ts"}'
const READ_CONTENT = '<path>src/a.ts</path>\n<type>file</type>\n<content>\nexport const a = 1\n</content>'
const EDIT_ARGS = '{"file_path":"src/a.ts","old_string":"before","new_string":"after"}'

/** The three lines a settled read fixture returns, starting at file line 41. */
const READ_LINES = [
  { number: 41, text: 'export const a = 1' },
  { number: 42, text: 'export const b = 2' },
  { number: 43, text: 'export const c = 3' },
]

const running = (name: string, argsRaw: string): StartedToolCall => ({
  phase: 'start' as const, args: PartialArguments.fromText(argsRaw), callId: 'c1', name, argsRaw,
  turn: 1, step: 1, time: 1_000, subCalls: [],
})

const settled = (name: string, argsRaw: string, over?: Partial<ToolResultNode>): ToolResultNode => ({
  kind: 'tool-result', seq: 10, time: 2_000, callId: 'c1',
  name, args: PartialArguments.fromText(argsRaw), call: { name, argsRaw }, callTime: 1_000,
  content: [{ type: 'text', text: 'result text' }], isError: false,
  meta: undefined, subCalls: [], ...over,
})

const grepMeta = (total: number) => ({
  shape: 'matches' as const,
  files: [{ path: 'a.ts', matches: [{ lineNumber: 12, line: 'const foo = 1' }] }],
  truncated: false, total,
})

const globMeta = (total: number) => ({
  shape: 'paths' as const, paths: ['src/a.ts', 'src/b.ts'].slice(0, total), truncated: false, total,
})

const readMeta = (lines = READ_LINES) => ({ path: 'src/a.ts', offset: 41, lines, totalLines: 180, lang: 'ts' })

const searchMeta = (sources: { url: string }[]) => ({ sources, truncated: false })

describe('toolOutcome', () => {
  it('has no outcome while a call is still running', () => {
    expect(toolOutcome(running('grep', GREP_ARGS))).toBeUndefined()
    expect(toolOutcome(running('read', READ_ARGS))).toBeUndefined()
  })

  it('has no outcome for a failed call, which keeps its action title', () => {
    expect(toolOutcome(settled('grep', GREP_ARGS, { isError: true, meta: grepMeta(3) }))).toBeUndefined()
    expect(toolOutcome(settled('read', READ_ARGS, { isError: true, meta: readMeta() }))).toBeUndefined()
  })

  it('has no outcome when the call arguments are not a JSON object', () => {
    const block = settled('grep', GREP_ARGS, { meta: grepMeta(3) })
    expect(toolOutcome({ ...block, call: null })).toBeUndefined()
  })

  it('states the lines a read returned', () => {
    expect(toolOutcome(settled('read', READ_ARGS, { content: [{ type: 'text', text: READ_CONTENT }], meta: readMeta() })))
      .toEqual({ key: 'tool.outcome.readLines', count: 3 })
  })

  it('has no read outcome when the result carries no valid read card', () => {
    expect(toolOutcome(settled('read', READ_ARGS, { meta: undefined }))).toBeUndefined()
    expect(toolOutcome(settled('read', READ_ARGS, { meta: readMeta(), content: [{ type: 'text', text: 'plain' }] })))
      .toBeUndefined()
  })

  it('states the matches a grep found', () => {
    expect(toolOutcome(settled('grep', GREP_ARGS, { meta: grepMeta(3) })))
      .toEqual({ key: 'tool.outcome.grepMatches', count: 3 })
  })

  it('states that a grep matched nothing without a count', () => {
    expect(toolOutcome(settled('grep', GREP_ARGS, { meta: grepMeta(0) })))
      .toEqual({ key: 'tool.outcome.grepNone' })
  })

  it('states the files a glob found', () => {
    expect(toolOutcome(settled('glob', GLOB_ARGS, { meta: globMeta(2) })))
      .toEqual({ key: 'tool.outcome.globFiles', count: 2 })
  })

  it('states that a glob found nothing without a count', () => {
    expect(toolOutcome(settled('glob', GLOB_ARGS, { meta: globMeta(0) })))
      .toEqual({ key: 'tool.outcome.globNone' })
  })

  it('has no search outcome when the result carries no valid search card', () => {
    expect(toolOutcome(settled('grep', GREP_ARGS, { meta: undefined }))).toBeUndefined()
    expect(toolOutcome(settled('glob', GLOB_ARGS, { meta: { shape: 'paths', paths: [], truncated: false } })))
      .toBeUndefined()
  })

  it('states the sources a web search cited', () => {
    expect(toolOutcome(settled('web_search', '{"queries":["harness"]}',
      { meta: searchMeta([{ url: 'https://a.example' }, { url: 'https://b.example' }]) })))
      .toEqual({ key: 'tool.outcome.webSources', count: 2 })
  })

  it('states that a web search cited nothing without a count', () => {
    expect(toolOutcome(settled('web_search', '{"queries":["harness"]}', { meta: searchMeta([]) })))
      .toEqual({ key: 'tool.outcome.webNone' })
  })

  it('has no web outcome for a fetch, which has no source list to count', () => {
    expect(toolOutcome(settled('web_fetch', '{"url":"https://example.com"}', {
      meta: { url: 'https://example.com', statusCode: 200, truncated: false },
    }))).toBeUndefined()
  })

  it('has no web outcome when the result carries no valid web card', () => {
    expect(toolOutcome(settled('web_search', '{"queries":["harness"]}', { meta: undefined }))).toBeUndefined()
  })

  it('states the files an edit changed', () => {
    expect(toolOutcome(settled('edit', EDIT_ARGS, {
      meta: { path: 'src/a.ts', diffs: [{ path: 'src/a.ts', oldText: 'before', newText: 'after' }] },
    }))).toEqual({ key: 'tool.outcome.patchFiles.one', count: 1 })
  })

  it('selects the singular copy for a single result', () => {
    expect(toolOutcome(settled('read', READ_ARGS, {
      content: [{ type: 'text', text: READ_CONTENT }], meta: readMeta(READ_LINES.slice(0, 1)),
    }))).toEqual({ key: 'tool.outcome.readLines.one', count: 1 })
    expect(toolOutcome(settled('grep', GREP_ARGS, { meta: grepMeta(1) })))
      .toEqual({ key: 'tool.outcome.grepMatches.one', count: 1 })
    expect(toolOutcome(settled('glob', GLOB_ARGS, { meta: globMeta(1) })))
      .toEqual({ key: 'tool.outcome.globFiles.one', count: 1 })
    expect(toolOutcome(settled('web_search', '{"queries":["harness"]}',
      { meta: searchMeta([{ url: 'https://a.example' }]) })))
      .toEqual({ key: 'tool.outcome.webSources.one', count: 1 })
  })

  it('counts every file a multi-file patch changed', () => {
    expect(toolOutcome(settled('apply_patch', '{"input":"*** Begin Patch"}', {
      meta: { diffs: [
        { path: 'a.ts', oldText: null, newText: 'created' },
        { path: 'b.ts', oldText: 'before', newText: 'after' },
      ] },
    }))).toEqual({ key: 'tool.outcome.patchFiles', count: 2 })
  })

  it('has no patch outcome when the result records no applied diff', () => {
    expect(toolOutcome(settled('edit', EDIT_ARGS, { meta: undefined }))).toBeUndefined()
  })

  it('has no outcome for a tool the row never summarizes', () => {
    expect(toolOutcome(settled('bash', '{"command":"ls"}'))).toBeUndefined()
    expect(toolOutcome(settled('write', '{"file_path":"src/a.ts"}'))).toBeUndefined()
  })
})
