/**
 * 入站门控的聊天侧状态：黄区提醒的去重、门控卡片按钮的负载解析、红线拦截文案。
 *
 * 设计：黄区提醒「一次确认即过」——同会话同 pattern 在 `remindDedupeMinutes`
 * 窗口内不再重复打扰，直接放行；红区拦截给出明确原因与合规出路（手册 10.2/10.9）。
 * @module dsh-lark-channel/remind
 */

import type { ConversationSubject } from './session.ts'

/** 门控卡片回调负载的 kind 标记。 */
export const GATE_ACTION = 'dsh-lark-channel/gate'

/** 门控卡片按钮负载：确认继续或取消。 */
export interface GateActionValue extends ConversationSubject {
  readonly kind: typeof GATE_ACTION
  /** 门控记录 id，用于关联原消息与去重。 */
  readonly correlationId: string
  /** 黄区确认 / 红区批准=confirm；取消/拒绝=cancel。 */
  readonly decision: 'confirm' | 'cancel'
  /** 门控档位：yellow（谁都可以确认自己的消息）或 red（必须审批人）。 */
  readonly tier: 'yellow' | 'red'
}

/**
 * 把任意卡片回调负载收窄为本模块的门控负载。
 * @param value - 卡片按钮的原始 value。
 * @returns 类型化负载，或外部卡片的 undefined。
 */
export function gateActionValue(value: unknown): GateActionValue | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record.kind !== GATE_ACTION) return undefined
  if (typeof record.correlationId !== 'string') return undefined
  if (record.decision !== 'confirm' && record.decision !== 'cancel') return undefined
  if (record.tier !== 'yellow' && record.tier !== 'red') return undefined
  if (typeof record.key !== 'string' || typeof record.chatId !== 'string') return undefined
  if (typeof record.chatType !== 'string') return undefined
  if (record.owner !== undefined && typeof record.owner !== 'string') return undefined
  return {
    kind: GATE_ACTION,
    key: record.key,
    chatId: record.chatId,
    chatType: record.chatType,
    correlationId: record.correlationId,
    decision: record.decision,
    tier: record.tier,
    ...record.owner === undefined ? {} : { owner: record.owner },
  }
}

/**
 * 黄区提醒去重状态：同一会话对同一 pattern 在窗口内只提醒一次。
 * 确认后同样记录，避免「提醒→确认→再发同模式内容又提醒」的循环。
 */
export class ReminderState {
  private readonly reminded = new Map<string, number>()
  private readonly confirmed = new Map<string, number>()

  /**
   * 是否应该再次提醒。
   * @param key - 会话 key（conversationKey）。
   * @param pattern - 命中 pattern（去重维度）。
   * @param now - 当前 epoch 毫秒。
   * @param dedupeMinutes - 去重窗口（分钟）。
   * @returns true = 需要提醒；false = 窗口内已提醒/已确认，直接放行。
   */
  shouldRemind(key: string, pattern: string, now: number, dedupeMinutes: number): boolean {
    const window = dedupeMinutes <= 0 ? 0 : dedupeMinutes * 60 * 1000
    const remindedAt = this.reminded.get(`${key}|${pattern}`)
    const confirmedAt = this.confirmed.get(`${key}|${pattern}`)
    if (confirmedAt !== undefined && now - confirmedAt < window) return false
    if (remindedAt !== undefined && now - remindedAt < window) return false
    return true
  }

  /** 记录一次提醒（窗口内不再重复）。 */
  markReminded(key: string, pattern: string, now: number): void {
    this.reminded.set(`${key}|${pattern}`, now)
  }

  /** 记录一次确认（窗口内不再提醒）。 */
  markConfirmed(key: string, pattern: string, now: number): void {
    this.confirmed.set(`${key}|${pattern}`, now)
  }

  /** 会话结束时清理该会话的状态，避免无限增长。 */
  clear(key: string): void {
    for (const [k] of this.reminded) if (k.startsWith(`${key}|`)) this.reminded.delete(k)
    for (const [k] of this.confirmed) if (k.startsWith(`${key}|`)) this.confirmed.delete(k)
  }
}

/**
 * 红线拦截文案：说明命中理由与合规出路，指向手册条款与信息安全部。
 * @param pattern - 命中的红线特征。
 * @returns 发送给聊天的 markdown。
 */
export function redlineBlockMessage(pattern: string | undefined): string {
  const hit = pattern === undefined ? '疑似敏感数据' : `命中红线特征 \`${pattern}\``
  return [
    '🚫 **已拦截：该消息触碰公司信息安全红线（手册第 10 章）**',
    '',
    `${hit}。为保护公司核心信息资产，本条内容未进入 AI 处理，且已记入审计日志。`,
    '',
    '合规出路：',
    '1. 对内容做**脱敏/最小化**处理（如替换真实订单为虚拟案例、金额改为区间）后重发；',
    '2. 确属业务必需，联系**信息安全部**（Security@lanhe-tech.com）申请授权；',
    '3. 涉及 L4 机密数据时，请走公司批准的受控通道，严禁输入外部 AI 工具。',
  ].join('\n')
}
