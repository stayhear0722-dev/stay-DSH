import { describe, expect, it } from 'vitest'
import {
  createOutboundFilter,
  outboundBlockMessage,
  outboundVerifyNote,
} from '../src/outbound-filter.ts'

const yellow = ['订单号', 'BOM\\s*表']
const red = ['\\b1[3-9]\\d{9}\\b', '\\b\\d{17}[\\dXx]\\b']

describe('createOutboundFilter', () => {
  it('sends green answers untouched', () => {
    const filter = createOutboundFilter(yellow, red)
    expect(filter.decide('这是分析结论')).toEqual({ action: 'send', tier: 'green', pattern: undefined })
  })

  it('warns on yellow output without blocking', () => {
    const filter = createOutboundFilter(yellow, red)
    const verdict = filter.decide('结论基于这份 BOM 表得出')
    expect(verdict.action).toBe('warn')
    expect(verdict.tier).toBe('yellow')
  })

  it('blocks red output and names the pattern', () => {
    const filter = createOutboundFilter(yellow, red)
    const verdict = filter.decide('客户手机号：13812345678')
    expect(verdict.action).toBe('block')
    expect(verdict.tier).toBe('red')
    expect(verdict.pattern).toBe('\\b1[3-9]\\d{9}\\b')
  })
})

describe('outbound copy', () => {
  it('verify note asks for human review', () => {
    expect(outboundVerifyNote()).toContain('人工核验')
  })

  it('block message names the red line and the audit', () => {
    const message = outboundBlockMessage('\\b1[3-9]\\d{9}\\b')
    expect(message).toContain('红线')
    expect(message).toContain('审计')
    expect(outboundBlockMessage(undefined)).toContain('疑似敏感数据')
  })
})
