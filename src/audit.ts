/**
 * 审计留痕（公司信息安全手册 11 章：早发现、快处置；12 章：合规审计）。
 *
 * 设计要点：
 * - **红区事件强制留痕**：`record(event, { force: true })` 写失败返回 false，
 *   调用方必须 fail-closed（拒绝该操作），审计是红线的不可关底座；
 * - 黄区确认、审批决定、工具调用、模型/工作区切换都记录；
 * - 绿区默认不记录（零打扰），由 `recordGreen` 打开；
 * - 落盘前按 `stripPii` 剥离 PII（手册 12 章合规，避免审计日志二次泄露）。
 *
 * 输出 JSONL（每行一个 JSON 对象），按大小滚动，对接 SIEM 时可换 sink。
 * @module dsh-lark-channel/audit
 */

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 审计事件（按来源细分）。 */
export type AuditEvent =
  | {
    kind: 'inbound'
    /** 发送者 open id。 */
    senderId: string
    chatId: string
    tier: 'green' | 'yellow' | 'red'
    /** 处置动作：passed | reminded | confirmed | blocked | approved | rejected | cancelled | passed-dedup | pending-approval。 */
    action: string
    pattern?: string | undefined
    /** 门控确认/批准/拒绝的处理人（open id 或姓名）。 */
    decidedBy?: string | undefined
    /** 消息长度（不记录原文，防 PII 与噪声；红区如需取证由 `capture` 字段单独控制）。 */
    length: number
  }
  | {
    kind: 'outbound'
    chatId: string
    tier: 'green' | 'yellow' | 'red'
    action: 'sent' | 'warned' | 'blocked'
    pattern?: string | undefined
    length: number
  }
  | {
    kind: 'tool'
    sessionId: string
    tool: string
    tier: 'yellow' | 'red'
    action: 'warned' | 'approved' | 'rejected' | 'cancelled' | 'pending-approval'
    decidedBy?: string | undefined
    /** 工具参数（已脱敏），便于安全部门回溯。 */
    arguments?: string | undefined
  }
  | {
    kind: 'approval'
    sessionId: string
    tool: string
    outcome: string
    decidedBy?: string | undefined
  }
  | {
    kind: 'model'
    chatId: string
    from: string
    to: string
    action: 'allowed' | 'blocked'
    decidedBy?: string | undefined
  }
  | {
    kind: 'workspace'
    chatId: string
    path: string
  }
  | {
    kind: 'redline'
    source: 'inbound' | 'outbound' | 'tool' | 'model'
    chatId?: string | undefined
    pattern?: string | undefined
    action: string
    length?: number | undefined
  }

/** PII 剥离器：落盘前把常见 PII 替换为占位符（手册 12 章）。 */
function stripPii(text: string): string {
  return text
    .replace(/\b1[3-9]\d{9}\b/g, '<phone>')
    .replace(/\b\d{17}[\dXx]\b/g, '<id-card>')
    .replace(/\b\d{16,19}\b/g, '<card>')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '<email>')
}

/** 审计日志构造选项。 */
export interface AuditOptions {
  /** JSONL 文件路径；缺省 `$DSH_HOME/logs/lark-audit.jsonl` 或 cwd/logs。 */
  readonly logFile?: string | undefined
  /** 落盘前剥离 PII（默认 true）。 */
  readonly stripPii?: boolean
  /** 绿区事件也记录（默认 false = 零打扰）。 */
  readonly recordGreen?: boolean
  /** 单个日志文件超过该字节数即滚动（默认 10 MB）。 */
  readonly rotateBytes?: number
  /** operators 控制台报告（写失败等）。 */
  readonly report?: ((line: string) => void) | undefined
}

/** 默认单文件上限：10 MB。 */
const DEFAULT_ROTATE_BYTES = 10 * 1024 * 1024

/**
 * 审计日志。写操作同步（appendFileSync），保证红区事件在动作完成前落盘。
 */
export class AuditLog {
  private readonly logFile: string
  private readonly strip: boolean
  private readonly recordGreen: boolean
  private readonly rotateBytes: number
  private readonly report: (line: string) => void
  private closed = false

  constructor(options: AuditOptions = {}) {
    this.strip = options.stripPii ?? true
    this.recordGreen = options.recordGreen ?? false
    this.rotateBytes = options.rotateBytes ?? DEFAULT_ROTATE_BYTES
    this.report = options.report ?? (() => {})
    this.logFile = options.logFile ?? join(process.env.DSH_HOME ?? process.cwd(), 'logs', 'lark-audit.jsonl')
    try {
      mkdirSync(dirname(this.logFile), { recursive: true })
    } catch (error) {
      this.report(`lark-channel: audit log directory unavailable: ${String(error)}`)
    }
  }

  /**
   * 记录一条事件。
   * @param event - 审计事件。
   * @param force - 强制留痕（红区事件必须 true）；写失败返回 false，调用方必须拒绝该操作。
   * @returns 是否成功落盘。
   */
  record(event: AuditEvent, force = false): boolean {
    if (this.closed) {
      if (force) this.report('lark-channel: audit closed but a red-line event must be recorded — refusing to proceed')
      return !force
    }
    // 绿区事件默认不记录（零打扰）；红区（redline 或 force）始终记录。
    const tier = 'tier' in event ? event.tier : undefined
    if (event.kind !== 'redline' && !force && tier === 'green' && !this.recordGreen) return true
    const line = JSON.stringify({ ts: new Date().toISOString(), ...this.sanitize(event) })
    try {
      this.rotateIfNeeded()
      appendFileSync(this.logFile, `${line}\n`, 'utf8')
      return true
    } catch (error) {
      this.report(`lark-channel: audit write failed: ${String(error)}`)
      return !force
    }
  }

  /** 关闭日志（后续记录仅红区强制时报告失败）。 */
  close(): void {
    this.closed = true
  }

  /** 剥离事件中可能携带的原文敏感字段。 */
  private sanitize(event: AuditEvent): AuditEvent {
    if (!this.strip) return event
    if (event.kind === 'tool' && event.arguments !== undefined) {
      return { ...event, arguments: stripPii(event.arguments) }
    }
    return event
  }

  /** 按大小滚动：超过阈值时把当前文件改名为 `.1`（覆盖旧滚动）。 */
  private rotateIfNeeded(): void {
    try {
      const size = statSync(this.logFile).size
      if (size < this.rotateBytes) return
      renameSync(this.logFile, `${this.logFile}.1`)
    } catch (error) {
      // 文件尚不存在或首次写入：无需滚动。
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.report(`lark-channel: audit rotate failed: ${String(error)}`)
      }
    }
  }
}
