import { describe, expect, it } from 'vitest'
import { classifyText, compilePatterns } from '../src/tiers.ts'

const patterns = {
  yellow: [/订单号/, /BOM\s*表/i],
  red: [/\b1[3-9]\d{9}\b/, /\b\d{17}[\dXx]\b/],
}

describe('classifyText', () => {
  it('returns green for text matching nothing', () => {
    expect(classifyText('帮我写一封周报', patterns)).toEqual({ tier: 'green', pattern: undefined })
  })

  it('returns yellow on a yellow pattern', () => {
    const verdict = classifyText('这份 BOM 表需要更新', patterns)
    expect(verdict.tier).toBe('yellow')
    expect(verdict.pattern).toBe('BOM\\s*表')
  })

  it('returns red on a data-shaped red pattern', () => {
    const verdict = classifyText('客户手机号是 13812345678', patterns)
    expect(verdict.tier).toBe('red')
    expect(verdict.pattern).toBe('\\b1[3-9]\\d{9}\\b')
  })

  it('gives red priority when both yellow and red hit', () => {
    const verdict = classifyText('BOM 表：供应商电话 13812345678', patterns)
    expect(verdict.tier).toBe('red')
  })

  it('matches case-insensitively', () => {
    expect(classifyText('bom 表', patterns).tier).toBe('yellow')
  })
})

describe('compilePatterns', () => {
  it('compiles valid sources and reports invalid ones', () => {
    const reports: string[] = []
    const compiled = compilePatterns(['\\d+', '(unclosed'], line => { reports.push(line) })
    expect(compiled).toHaveLength(1)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toContain('忽略非法正则')
  })
})
