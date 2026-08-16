import { describe, expect, it } from 'vitest'
import { GATE_ACTION, gateActionValue, redlineBlockMessage, ReminderState } from '../src/remind.ts'

describe('ReminderState', () => {
  const now = 1_000_000

  it('reminds first, then suppresses within the window', () => {
    const state = new ReminderState()
    expect(state.shouldRemind('k', 'p', now, 5)).toBe(true)
    state.markReminded('k', 'p', now)
    expect(state.shouldRemind('k', 'p', now + 60_000, 5)).toBe(false)
    // Window passes → remind again.
    expect(state.shouldRemind('k', 'p', now + 6 * 60_000, 5)).toBe(true)
  })

  it('treats a confirmation as a reminder within the window', () => {
    const state = new ReminderState()
    state.markConfirmed('k', 'p', now)
    expect(state.shouldRemind('k', 'p', now + 60_000, 5)).toBe(false)
  })

  it('keeps patterns apart per conversation', () => {
    const state = new ReminderState()
    state.markReminded('k1', 'p', now)
    expect(state.shouldRemind('k2', 'p', now + 60_000, 5)).toBe(true)
    expect(state.shouldRemind('k1', 'other', now + 60_000, 5)).toBe(true)
  })

  it('clears one conversation without touching others', () => {
    const state = new ReminderState()
    state.markReminded('k1', 'p', now)
    state.markReminded('k2', 'p', now)
    state.clear('k1')
    expect(state.shouldRemind('k1', 'p', now + 60_000, 5)).toBe(true)
    expect(state.shouldRemind('k2', 'p', now + 60_000, 5)).toBe(false)
  })
})

describe('gateActionValue', () => {
  it('parses a well-formed gate payload', () => {
    const value = gateActionValue({
      kind: GATE_ACTION,
      key: 'k',
      chatId: 'oc_1',
      chatType: 'group',
      correlationId: 'c1',
      decision: 'confirm',
      tier: 'yellow',
    })
    expect(value).toEqual({
      kind: GATE_ACTION,
      key: 'k',
      chatId: 'oc_1',
      chatType: 'group',
      correlationId: 'c1',
      decision: 'confirm',
      tier: 'yellow',
    })
  })

  it('rejects foreign payloads and malformed ones', () => {
    expect(gateActionValue({ kind: 'other', correlationId: 'c1', decision: 'confirm', tier: 'yellow', key: 'k', chatId: 'c', chatType: 'p2p' })).toBeUndefined()
    expect(gateActionValue({ kind: GATE_ACTION, correlationId: 3, decision: 'confirm', tier: 'yellow', key: 'k', chatId: 'c', chatType: 'p2p' })).toBeUndefined()
    expect(gateActionValue({ kind: GATE_ACTION, correlationId: 'c1', decision: 'maybe', tier: 'yellow', key: 'k', chatId: 'c', chatType: 'p2p' })).toBeUndefined()
    expect(gateActionValue(null)).toBeUndefined()
  })
})

describe('redlineBlockMessage', () => {
  it('names the pattern and the way out', () => {
    const message = redlineBlockMessage('\\b1[3-9]\\d{9}\\b')
    expect(message).toContain('红线')
    expect(message).toContain('\\b1[3-9]\\d{9}\\b')
    expect(message).toContain('脱敏')
    expect(message).toContain('Security@lanhe-tech.com')
  })

  it('works without a pattern', () => {
    expect(redlineBlockMessage(undefined)).toContain('疑似敏感数据')
  })
})
