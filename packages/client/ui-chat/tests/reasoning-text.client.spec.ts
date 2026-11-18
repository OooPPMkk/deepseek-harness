import { describe, expect, it } from 'vitest'
import { reasoningText, thinkingDurationMs } from '../src/client/reasoning-text.ts'

describe('reasoning display text', () => {
  it.each([
    '',
    'Ordinary reasoning',
    '普通思考正文',
    '\n  Original text  \n',
    '<note>Original text</note>',
  ])('preserves ordinary reasoning %j', (text) => {
    expect(reasoningText(text)).toBe(text)
  })
})

describe('thinking duration', () => {
  const timing = { stepStartTime: 1_000, firstTokenTime: 4_500 }
  const thought = { kind: 'reasoning' as const, text: 'Inspect the session' }

  it('reports the recorded time to the first token when thinking leads the Step', () => {
    expect(thinkingDurationMs([thought], timing)).toBe(3_500)
  })

  it.each([
    ['no recorded timing', [thought], undefined],
    ['an unavailable step start', [thought], { stepStartTime: null, firstTokenTime: 4_500 }],
    ['an unavailable first token', [thought], { stepStartTime: 1_000, firstTokenTime: null }],
    ['blank leading reasoning', [{ kind: 'reasoning' as const, text: ' \t\n' }], timing],
    ['a leading text block', [{ kind: 'text' as const, text: 'Answer' }], timing],
    ['only tool calls', [{ kind: 'tool-call' as const, callId: 'c1', name: 'read', argsRaw: '{}' }], timing],
    ['no blocks', [], timing],
  ])('reports nothing for %s', (_label, blocks, value) => {
    expect(thinkingDurationMs(blocks, value)).toBeUndefined()
  })

  it('clamps a first token recorded before the step start', () => {
    expect(thinkingDurationMs([thought], { stepStartTime: 5_000, firstTokenTime: 4_000 })).toBe(0)
  })

  it('skips leading tool calls to find the Step first material', () => {
    const call = { kind: 'tool-call' as const, callId: 'c1', name: 'read', argsRaw: '{}' }
    expect(thinkingDurationMs([call, thought], timing)).toBe(3_500)
  })
})
