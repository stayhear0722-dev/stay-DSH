/**
 * 提示注入轻量检测（公司信息安全手册 10.6：防范提示注入，警惕复制粘贴）。
 *
 * 不追求穷尽——只是把明显可疑的「嵌入指令」标记出来并入黄区提醒，
 * 让用户有机会检查来源；真正的防线是系统提示词加固与人工确认。
 * @module dsh-lark-channel/prompt-guard
 */

import type { SensitivityTier } from './tiers.ts'

/** 一次提示注入检测的结果。 */
export interface GuardVerdict {
  readonly tier: SensitivityTier
  /** 命中原因（并入黄区提醒文案与审计）。 */
  readonly reason: string | undefined
}

/** 可疑指令特征：中英文常见注入句式。 */
const INJECTION_MARKERS: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /忽略(上面|以上|之前|前面)?(的)?(所有)?(指令|指示|规则|prompt|要求)/i, reason: '包含"忽略指令"句式，疑似提示注入' },
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i, reason: 'contains "ignore previous instructions", possible prompt injection' },
  { pattern: /(假装|扮演|你现在是|你是)\s*(系统|system)/i, reason: '试图伪装系统角色，疑似提示注入' },
  { pattern: /(输出|显示|泄露)\s*(你的|系统)?\s*(系统提示词|system prompt|初始指令)/i, reason: '试图套取系统提示词，疑似提示注入' },
  { pattern: /reveal\s+(your|the)\s+(system\s+)?prompt/i, reason: 'asks to reveal the system prompt, possible prompt injection' },
]

/**
 * 检测一段文本中的可疑嵌入指令。
 * @param text - 待检测文本。
 * @returns 命中返回黄区 + 原因；未命中返回绿区。
 */
export function guardPromptInjection(text: string): GuardVerdict {
  for (const marker of INJECTION_MARKERS) {
    if (marker.pattern.test(text)) return { tier: 'yellow', reason: marker.reason }
  }
  return { tier: 'green', reason: undefined }
}
