import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AuditLog } from '../src/audit.ts'

/** 一次审计目录，测完即弃。 */
function tempAudit(options: Parameters<typeof AuditLog>[0] = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lark-audit-'))
  const logFile = join(dir, 'audit.jsonl')
  const reports: string[] = []
  const log = new AuditLog({ ...options, logFile: options.logFile ?? logFile, report: line => { reports.push(line) } })
  const lines = (): string[] => {
    try {
      return readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
  return { dir, logFile, log, reports, lines }
}

const greenEvent = { kind: 'inbound', senderId: 'ou_1', chatId: 'oc_1', tier: 'green', action: 'passed', length: 5 } as const

describe('AuditLog', () => {
  it('writes JSONL lines with a timestamp', () => {
    const { log, lines } = tempAudit()
    log.record({ kind: 'inbound', senderId: 'ou_1', chatId: 'oc_1', tier: 'yellow', action: 'reminded', pattern: 'p', length: 3 })
    log.close()
    const parsed = JSON.parse(lines()[0]!) as Record<string, unknown>
    expect(parsed.ts).toBeTypeOf('string')
    expect(parsed.kind).toBe('inbound')
    expect(parsed.tier).toBe('yellow')
  })

  it('skips green events by default (zero friction)', () => {
    const { log, lines } = tempAudit()
    log.record(greenEvent)
    expect(lines()).toHaveLength(0)
  })

  it('records green events when recordGreen is on', () => {
    const { log, lines } = tempAudit({ recordGreen: true })
    log.record(greenEvent)
    expect(lines()).toHaveLength(1)
  })

  it('always records forced (red-line) events, even with recordGreen off', () => {
    const { log, lines } = tempAudit()
    expect(log.record({ kind: 'redline', source: 'inbound', chatId: 'oc_1', action: 'blocked', length: 4 }, true)).toBe(true)
    expect(lines()).toHaveLength(1)
  })

  it('fails closed: a failed forced write reports and returns false', () => {
    const { log, reports } = tempAudit({ logFile: join('Z:', 'no', 'such', 'dir', 'audit.jsonl') })
    expect(log.record({ kind: 'redline', source: 'inbound', chatId: 'oc_1', action: 'blocked', length: 4 }, true)).toBe(false)
    expect(reports.some(line => line.includes('audit write failed'))).toBe(true)
  })

  it('strips PII from tool arguments before writing', () => {
    const { log, lines } = tempAudit()
    log.record({ kind: 'tool', sessionId: 's1', tool: 'shell', tier: 'yellow', action: 'warned', arguments: 'contact 13812345678 email a@b.com' })
    const parsed = JSON.parse(lines()[0]!) as Record<string, unknown>
    expect(String(parsed.arguments)).toBe('contact <phone> email <email>')
  })

  it('rotates past the size cap, keeping the previous file as .1', () => {
    const { dir, log, logFile } = tempAudit({ rotateBytes: 200 })
    for (let i = 0; i < 60; i++) log.record({ kind: 'redline', source: 'inbound', chatId: 'oc_1', action: 'blocked', length: i }, true)
    log.close()
    const files = readdirSync(dir).sort()
    expect(files).toContain('audit.jsonl')
    expect(files).toContain('audit.jsonl.1')
    expect(logFile.length).toBeGreaterThan(0)
  })

  it('refuses further red-line records after close', () => {
    const { log, reports } = tempAudit()
    log.close()
    expect(log.record({ kind: 'redline', source: 'inbound', chatId: 'oc_1', action: 'blocked' }, true)).toBe(false)
    expect(reports.some(line => line.includes('audit closed'))).toBe(true)
  })
})
