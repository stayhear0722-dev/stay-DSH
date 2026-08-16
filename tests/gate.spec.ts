import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CardActionEvent } from '@larksuite/channel'
import type { HostApprovalOutcome, HostApprovalRequest } from '../src/host.ts'
import { cardControls, fakeMessage, mountChannel, SENDER_ID } from './harness.ts'

/** A card action clicking one gate button, as the authorized owner by default. */
function clickAction(
  value: unknown,
  by: { openId?: string; chatId?: string; name?: string } = {},
): CardActionEvent {
  return {
    messageId: 'om_card_1',
    chatId: by.chatId ?? 'oc_chat_1',
    operator: {
      openId: by.openId ?? SENDER_ID,
      ...by.name === undefined ? {} : { name: by.name },
    },
    action: { value, tag: 'button' },
  }
}

/** 独立的审计日志文件（避免测试写入仓库目录）。 */
function tempAudit() {
  const dir = mkdtempSync(join(tmpdir(), 'lark-gate-'))
  return { dir, file: join(dir, 'audit.jsonl') }
}

/** 读审计文件为对象数组。 */
function auditLines(file: string): Record<string, unknown>[] {
  try {
    return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
  } catch {
    return []
  }
}

/** 从卡片按钮里按 decision 找门控按钮。 */
function gateButton(card: object, decision: string): { value: unknown } {
  const button = cardControls(card).find(control => {
    const value = control.value as { decision?: string }
    return value.decision === decision
  })
  if (button === undefined) throw new Error(`no ${decision} gate button on card`)
  return button
}

describe('三级分级门控（黄区提醒）', () => {
  it('reminds on yellow input and only delivers after confirmation', async () => {
    const audit = tempAudit()
    const harness = await mountChannel({ yellowPatterns: ['订单号'], redPatterns: [], auditLogFile: audit.file })
    await harness.fake.emitMessage(fakeMessage({ content: '客户订单号是多少' }))
    // 提醒卡片已发，但 Agent 未被创建（消息停在门控）。
    await vi.waitFor(() => { expect(harness.fake.sent.length).toBe(1) })
    expect(harness.agents.created).toHaveLength(0)
    const sent = harness.fake.sent[0]!.input as { card: object }
    expect('card' in (sent as object)).toBe(true)

    // 点「确认」后消息才进入 Agent。
    const confirm = gateButton(sent.card, 'confirm')
    await harness.fake.emitCardAction(clickAction(confirm.value))
    await vi.waitFor(() => { expect(harness.agents.created).toHaveLength(1) })
    await vi.waitFor(() => { expect(harness.agents.created[0]!.agent.followup).toHaveBeenCalledTimes(1) })

    // 审计记录提醒与确认。
    const events = auditLines(audit.file)
    expect(events.some(event => event.kind === 'inbound' && event.action === 'reminded')).toBe(true)
    expect(events.some(event => event.kind === 'inbound' && event.action === 'confirmed')).toBe(true)
    await harness.dispose()
  })

  it('cancelling drops the message without creating an agent', async () => {
    const harness = await mountChannel({ yellowPatterns: ['订单号'], redPatterns: [] })
    await harness.fake.emitMessage(fakeMessage({ content: '客户订单号是多少' }))
    await vi.waitFor(() => { expect(harness.fake.sent.length).toBe(1) })
    const sent = harness.fake.sent[0]!.input as { card: object }
    const cancel = gateButton(sent.card, 'cancel')
    await harness.fake.emitCardAction(clickAction(cancel.value))
    // 稍等一拍，确认没有 Agent 被创建。
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(harness.agents.created).toHaveLength(0)
    await harness.dispose()
  })

  it('dedupes yellow reminders within the window, passing the second message straight through', async () => {
    const harness = await mountChannel({ yellowPatterns: ['订单号'], redPatterns: [], remindDedupeMinutes: 5 })
    await harness.fake.emitMessage(fakeMessage({ content: '客户订单号是多少' }))
    await vi.waitFor(() => { expect(harness.fake.sent.length).toBe(1) })
    // 窗口内第二条黄区消息不再弹卡，直接进 Agent。
    await harness.fake.emitMessage(fakeMessage({ content: '再问一次订单号' }))
    await vi.waitFor(() => { expect(harness.agents.created).toHaveLength(1) })
    const cards = harness.fake.sent.filter(message => 'card' in (message.input as object))
    expect(cards).toHaveLength(1)
    await harness.dispose()
  })
})

describe('三级分级门控（红区）', () => {
  it('blocks red input, sends the redline notice, and forces an audit record', async () => {
    const audit = tempAudit()
    const harness = await mountChannel({ redPatterns: ['1[3-9]\\d{9}'], yellowPatterns: [], auditLogFile: audit.file })
    await harness.fake.emitMessage(fakeMessage({ content: '手机号 13812345678 查一下' }))
    await vi.waitFor(() => { expect(harness.fake.sent.length).toBe(1) })
    const sent = harness.fake.sent[0]!.input as { text?: string }
    expect(sent.text).toContain('红线')
    expect(harness.agents.created).toHaveLength(0)
    const events = auditLines(audit.file)
    expect(events.some(event => event.kind === 'redline' && event.action === 'blocked')).toBe(true)
    expect(events.some(event => event.kind === 'inbound' && event.tier === 'red')).toBe(true)
    await harness.dispose()
  })

  it('routes red input to approval; only an approver can release it', async () => {
    const harness = await mountChannel({
      redPatterns: ['1[3-9]\\d{9}'],
      yellowPatterns: [],
      onRed: 'approval',
      approvers: ['ou_approver'],
      senderAllowlist: [SENDER_ID],
    })
    await harness.fake.emitMessage(fakeMessage({ content: '手机号 13812345678 查一下' }))
    await vi.waitFor(() => { expect(harness.fake.sent.length).toBe(1) })
    const sent = harness.fake.sent[0]!.input as { card: object }
    const allow = gateButton(sent.card, 'confirm')

    // 非审批人点击被拒。
    const refused = await harness.fake.emitCardAction(clickAction(allow.value, { openId: 'ou_bystander' }))
    expect(refused).toMatchObject({ toast: { type: 'error' } })
    expect(harness.agents.created).toHaveLength(0)

    // 审批人点击后消息进入 Agent。
    await harness.fake.emitCardAction(clickAction(allow.value, { openId: 'ou_approver', name: '审' }))
    await vi.waitFor(() => { expect(harness.agents.created).toHaveLength(1) })
    await harness.dispose()
  })
})

describe('模型路由锁定', () => {
  it('blocks /model use for non-approvers when lockModel is on', async () => {
    const harness = await mountChannel({ lockModel: true, approvers: ['ou_approver'] })
    await harness.fake.emitMessage(fakeMessage({ content: '/model use deepseek/other' }))
    await vi.waitFor(() => { expect(harness.fake.sent.length).toBe(1) })
    const sent = harness.fake.sent[0]!.input as { markdown?: string }
    expect(sent.markdown).toContain('锁定')
    expect(harness.agents.created).toHaveLength(0)
    await harness.dispose()
  })
})

describe('工具黄区自动放行', () => {
  it('auto-allows a warnTool with a notice and audits it', async () => {
    const harness = await mountChannel({ warnTools: ['bash'] })
    await harness.fake.emitMessage(fakeMessage())
    await vi.waitFor(() => { expect(harness.agents.created).toHaveLength(1) })
    const outcome = await harness.ctx.waterfall('approval/request', {
      agent: harness.agents.created[0]!.agent,
      toolName: 'bash',
    } as HostApprovalRequest, async (): Promise<HostApprovalOutcome> => 'unavailable')
    expect(outcome).toBe('allowed-once')
    await vi.waitFor(() => {
      expect(harness.fake.sent.some(message => {
        const text = (message.input as { text?: string }).text ?? ''
        return text.includes('自动放行')
      })).toBe(true)
    })
    await harness.dispose()
  })
})
