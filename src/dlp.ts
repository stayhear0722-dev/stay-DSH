/**
 * 入站数据分级门（DLP）：把用户消息分为放行/提醒/拦截/转审批四种处置。
 *
 * 这是「三级分级管控」在入站侧的执行点：
 * - 绿区 → pass（零打扰）；
 * - 黄区 → remind（提醒确认，可去重）；
 * - 红区 → block（拦截 + 强制留痕）或 approve（转审批人 + 强制留痕），由 {@link RedPolicy} 决定。
 * 提示注入检测（{@link prompt-guard.ts}）的命中并入黄区：提醒用户来源可疑。
 * @module dsh-lark-channel/dlp
 */

import { classifyText, compilePatterns } from './tiers.ts'
import type { SensitivityTier } from './tiers.ts'
import { guardPromptInjection } from './prompt-guard.ts'

/** 入站处置动作。 */
export type InboundAction = 'pass' | 'remind' | 'block' | 'approve'

/** 红区处置策略。 */
export type RedPolicy = 'block' | 'approval'

/** 一次入站分级的结果。 */
export interface InboundDecision {
  readonly action: InboundAction
  readonly tier: SensitivityTier
  /** 命中的 pattern（黄/红），或提示注入原因（注入命中时）。 */
  readonly pattern: string | undefined
  /** 是否为提示注入命中（用于提醒文案与审计）。 */
  readonly injection: boolean
}

/** 分级所需的配置子集。 */
export interface DlpConfig {
  readonly yellowPatterns: readonly string[]
  readonly redPatterns: readonly string[]
  readonly onYellow: 'remind' | 'off'
  readonly onRed: RedPolicy
}

/** 编译并缓存的正则集合，跨消息复用，避免每条消息重复编译。 */
export interface DlpEngine {
  /** 对一条入站消息做分级决策。 */
  decide(text: string): InboundDecision
}

/**
 * 构建入站分级引擎。
 * @param config - 分级配置。
 * @param report - 报告非法正则（operators 控制台）。
 * @returns 引擎实例。
 */
export function createDlpEngine(config: DlpConfig, report?: (line: string) => void): DlpEngine {
  const yellow = compilePatterns(config.yellowPatterns, report)
  const red = compilePatterns(config.redPatterns, report)
  return {
    decide(text: string): InboundDecision {
      const verdict = classifyText(text, { yellow, red })
      if (verdict.tier === 'red') {
        return {
          action: config.onRed === 'approval' ? 'approve' : 'block',
          tier: 'red',
          pattern: verdict.pattern,
          injection: false,
        }
      }
      if (verdict.tier === 'yellow') {
        return {
          action: config.onYellow === 'remind' ? 'remind' : 'pass',
          tier: 'yellow',
          pattern: verdict.pattern,
          injection: false,
        }
      }
      // 绿区文本再查提示注入：可疑来源内容并入黄区提醒，不阻断正常业务。
      const guard = guardPromptInjection(text)
      if (guard.tier !== 'green') {
        return { action: 'remind', tier: 'yellow', pattern: guard.reason, injection: true }
      }
      return { action: 'pass', tier: 'green', pattern: undefined, injection: false }
    },
  }
}
