/**
 * 出站分级（手册 10.4：AI 输出人工核验；10.2：红线数据不外泄）。
 *
 * - 绿区输出 → 直接发送（零打扰）；
 * - 黄区输出（命中黄区特征）→ 正常发送，但附带一行核验提醒（不阻断，人工核验是手册要求）；
 * - 红区输出（命中红区数据形态）→ 拦截 + 强制审计留痕，改为发送红区拦截说明。
 * @module dsh-lark-channel/outbound-filter
 */

import { classifyText, compilePatterns } from './tiers.ts'
import type { SensitivityTier } from './tiers.ts'

/** 出站处置。 */
export type OutboundAction = 'send' | 'warn' | 'block'

/** 一次出站分级的结果。 */
export interface OutboundVerdict {
  readonly action: OutboundAction
  readonly tier: SensitivityTier
  readonly pattern: string | undefined
}

/** 出站分级引擎。 */
export interface OutboundFilter {
  decide(text: string): OutboundVerdict
}

/**
 * 构建出站分级引擎。复用黄/红 pattern：红区数据形态命中即拦截；
 * 黄区词级命中只提醒（容忍误报，不牺牲可用性）。
 * @param yellowPatterns - 黄区正则源。
 * @param redPatterns - 红区正则源。
 * @param report - 报告非法正则。
 * @returns 引擎。
 */
export function createOutboundFilter(
  yellowPatterns: readonly string[],
  redPatterns: readonly string[],
  report?: (line: string) => void,
): OutboundFilter {
  const yellow = compilePatterns(yellowPatterns, report)
  const red = compilePatterns(redPatterns, report)
  return {
    decide(text: string): OutboundVerdict {
      const verdict = classifyText(text, { yellow, red })
      if (verdict.tier === 'red') return { action: 'block', tier: 'red', pattern: verdict.pattern }
      if (verdict.tier === 'yellow') return { action: 'warn', tier: 'yellow', pattern: verdict.pattern }
      return { action: 'send', tier: 'green', pattern: undefined }
    },
  }
}

/** 黄区输出的核验提醒（追加在回答后，一行，不阻断）。 */
export function outboundVerifyNote(): string {
  return '\n\n> ⚠️ 本回答可能包含公司敏感信息（手册第 10 章），对外发布前请 100% 人工核验。'
}

/** 红区输出拦截说明。 */
export function outboundBlockMessage(pattern: string | undefined): string {
  const hit = pattern === undefined ? '疑似敏感数据' : `命中红线特征 \`${pattern}\``
  return [
    '🚫 **已拦截该输出：内容可能泄露公司敏感数据（手册第 10.2 条红线）**',
    '',
    `${hit}。该输出未发送到聊天，已记入审计日志。请调整提问方式或先做数据脱敏。`,
  ].join('\n')
}

/**
 * 回答级输出过滤器（renderer 的挂载点）：对一段完整回答给出处置，
 * 并回调审计。由 renderer 在真正发送前调用。
 */
export interface OutboundAnswerFilter {
  /** 分级一段完整回答。 */
  decide(text: string): OutboundVerdict
  /** 拦截时替代原文发送的文案。 */
  blockedText(pattern: string | undefined): string
  /** warn 时追加在回答后的核验提醒。 */
  warnNote(): string
  /** 审计回调（sent / warned / blocked），由宿主提供。 */
  audit(verdict: OutboundVerdict, text: string): void
}
