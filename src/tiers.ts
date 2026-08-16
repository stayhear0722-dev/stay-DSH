/**
 * 三级分级管控核心（公司信息安全手册合规）。
 *
 * 🟢 绿区（green）：不命中任何 pattern —— 零打扰直接执行；
 * 🟡 黄区（yellow）：命中黄区 pattern（超过一般要求但未到红线）—— 提醒确认后继续；
 * 🔴 红区（red）：命中红区 pattern（红线）—— 强制审计留痕 + 拦截或转审批。
 *
 * 红区优先于黄区：一条文本同时命中两者时按红线处置。
 * @module dsh-lark-channel/tiers
 */

/** 一档敏感度。 */
export type SensitivityTier = 'green' | 'yellow' | 'red'

/** 分级判定所需的 pattern 集合（字符串形式的正则源）。 */
export interface TierPatterns {
  readonly yellow: readonly string[]
  readonly red: readonly string[]
}

/** 一次文本分级的结果。 */
export interface TierVerdict {
  readonly tier: SensitivityTier
  /** 命中的 pattern 原始串：黄区用于提醒文案与去重键，红区用于审计留痕。 */
  readonly pattern: string | undefined
}

/**
 * 编译一串正则源；非法正则跳过并收集报告（管理员配置错误不应让整个通道崩溃）。
 * @param sources - 正则源字符串列表。
 * @param report - 报告一条非法正则（operators 控制台可见）。
 * @returns 可执行的正则列表。
 */
export function compilePatterns(sources: readonly string[], report?: (line: string) => void): RegExp[] {
  const compiled: RegExp[] = []
  for (const source of sources) {
    try {
      compiled.push(new RegExp(source, 'i'))
    } catch (error) {
      report?.(`lark-channel: 忽略非法正则 /${source}/: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return compiled
}

/**
 * 对一段文本做三级分级。红区优先：先查红区，再查黄区，都不命中即绿区。
 * @param text - 待分级文本（入站用户消息或出站助手回答）。
 * @param patterns - 编译好的黄区/红区正则。
 * @returns 档位与命中 pattern。
 */
export function classifyText(text: string, patterns: { yellow: readonly RegExp[]; red: readonly RegExp[] }): TierVerdict {
  for (const regex of patterns.red) {
    if (regex.test(text)) return { tier: 'red', pattern: regex.source }
  }
  for (const regex of patterns.yellow) {
    if (regex.test(text)) return { tier: 'yellow', pattern: regex.source }
  }
  return { tier: 'green', pattern: undefined }
}
