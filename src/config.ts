/**
 * Serializable configuration, schema, and direct-call defaults.
 * @module dsh-lark-channel/config
 */

import z from '@deepseek-ai/schemastery'
import { DEFAULT_BOT_HOPS } from './botchat.ts'
import type { SessionScope } from './session.ts'

/**
 * Tools whose answer cannot reach a chat.
 *
 * Empty now. Both tools that used to sit here — `ask_user_question` and
 * `exit_plan_mode` — ask through `ctx.userQuestions`, whose single provider
 * belongs to whichever UI registered it first, so their answers would surface
 * where nobody in this chat is watching. Each is shadowed per agent instead
 * and asks here, as a card. A deployment may still name either one, and that
 * denial wins; so does the fallback, which re-denies a tool whose shadow could
 * not be registered.
 */
const DEFAULT_DENY_TOOLS = [] as const

/** Plugin configuration supplied by the profile composition. */
export interface Config {
  /**
   * Names this row when a deployment composes more than one, so two bots keep
   * separate settings sections, separate app-secret credentials, and separate
   * session ids — two bots in one group would otherwise share an agent.
   *
   * Absent is the original single-row deployment, whose identifiers are
   * unchanged: name the SECOND row, never the first, and nothing already
   * stored moves.
   */
  instance?: string
  /** Lark/Feishu app id (`cli_…`); absent (with no stored credential) starts first-boot QR registration. */
  appId?: string
  /**
   * Lark/Feishu app secret paired with {@link appId}. A deployment that
   * injects one here keeps owning it; onboarding stores what it scans behind
   * {@link Config.appSecretRef} instead, so nothing writes a secret into the
   * user settings document that a credentials provider could hold.
   */
  appSecret?: string
  /**
   * Name of the credential holding the app secret, resolved through
   * `ctx.credentials` on every boot: an environment variable, a dotenv entry,
   * or the provider's own store, whichever is configured.
   */
  appSecretRef?: string
  /** Open-platform domain: `https://open.feishu.cn` (default) or `https://open.larksuite.com`. */
  domain?: string
  /** Absolute workspace directory for chat-driven agents; defaults to the host process cwd. */
  cwd?: string
  /**
   * Directory prefixes `/cd` may point a conversation at; empty allows any
   * existing directory. The platform already decides who can reach the bot at
   * all, so this only narrows where those people may aim it — set it when the
   * bot serves a room whose members should not roam the filesystem.
   */
  workspaceRoots?: string[]
  /**
   * Managed state, not configuration: the workspace each conversation was
   * `/cd`-ed to, keyed by conversation key, written back through the settings
   * service. An empty-string value marks "explicitly the default" — the
   * persistence layer deep-merges patches, so entries are overwritten rather
   * than deleted.
   */
  chatWorkspaces?: Record<string, string>
  /**
   * Managed state, not configuration: the `provider/model` route each
   * conversation asked for via `/model use`, keyed by conversation key, with
   * the same empty-string default marker as {@link chatWorkspaces}.
   */
  chatModels?: Record<string, string>
  /**
   * Managed state, not configuration: how many times each conversation has
   * started over with `/new`, keyed by the session id it derives at epoch
   * zero. Absent is the first session, whose id is unchanged.
   */
  chatEpochs?: Record<string, string>
  /** Provider route override for chat agents; defaults to the host `agentDefaultModel` selection. */
  provider?: string
  /** Model id override for chat agents; defaults to the host `agentDefaultModel` selection. */
  model?: string
  /**
   * Agent preset chat agents join, when the deployment composes a roster.
   * Absent joins the roster default. A deployment WITH a roster keeps every
   * model-facing row on the agent plane, so joining nothing would reach the
   * model with no tools at all.
   */
  preset?: string
  /**
   * Which conversation facet owns one agent session. The session id is derived
   * from that facet alone, so a restarted process reaches the conversation's
   * stored session instead of starting it over. `chat` gives a group one shared
   * agent; `chat-thread` gives each topic thread its own, so parallel topics
   * stop overwriting each other's context; `chat-sender` gives each person in a
   * shared chat their own.
   */
  sessionScope?: SessionScope
  /**
   * How assistant output reaches the chat. `cot` (default) shows the process as
   * a native thinking-process message — reasoning, tool calls with icons,
   * results as code — and sends the answer as an ordinary message, which is
   * where the platform says a final answer belongs. It needs a client new
   * enough to render one (PC 7.70, mobile 7.74); `stream` keeps the whole turn
   * in one typewriter card, for clients older than that surface.
   */
  output?: 'cot' | 'stream'
  /**
   * Show what the agent did on its way to an answer: its reasoning and the
   * tools it called. Off sends the answer alone.
   */
  showProcess?: boolean
  /**
   * Pass images a chat sends on to the model.
   *
   * Off by default, and deliberately: a route that cannot take images rejects
   * the whole request, the image is already in the session log by then, and
   * every later turn resends it — so one screenshot ends the conversation for
   * good, with no way back from the chat, because compaction sends that history
   * too. The host exposes no way to ask a route whether it accepts images, so
   * the deployment that knows its route is a vision one says so here.
   */
  attachImages?: boolean
  /**
   * Let the platform drop the process once its run finishes, leaving only the
   * answer in the conversation. `cot` output only.
   */
  hideProcessWhenDone?: boolean
  /**
   * Register this channel's commands on the bot so Feishu offers them when a
   * user types `/`. Reconciling: the panel ends up offering exactly what this
   * channel accepts, so an entry it no longer offers is removed rather than
   * left to answer "unknown command". Off means commands still work, typed
   * from memory, and a hand-curated panel is left untouched.
   */
  syncSlashCommands?: boolean
  /**
   * Tools chat agents may not call, denied per agent at execution with a
   * reason that redirects the model to the chat.
   *
   * The default names the two human-interaction tools whose answers cannot
   * reach this channel: `ctx.userQuestions` admits ONE provider per context,
   * so when any other UI registered it (the Web app's BFF claims every
   * agent-owned question) a chat agent's question would wait on a surface its
   * human is not watching. Asking in the chat is the native equivalent — a
   * reply is an ordinary message this bridge already turns into the next turn.
   */
  denyTools?: string[]
  /**
   * Bot open ids this channel answers, when a deployment wants only certain
   * ones. Empty — the default — narrows nothing, exactly like every other list
   * here: a bot someone added to a room this channel already serves is part of
   * that room's arrangement. {@link botHops} is what bounds the exchange.
   */
  botPeers?: string[]
  /**
   * Consecutive bot-sourced turns one conversation may run before this channel
   * stops answering. A human message refills it. Without a bound, two agents
   * answer each other until someone notices the bill.
   */
  botHops?: number
  /** In group chats, only respond when the bot is @-mentioned. */
  requireMention?: boolean
  /**
   * Open ids (`ou_…`) allowed to send direct messages, when a deployment wants
   * to narrow them further. Empty serves anyone who can reach the bot at all,
   * which the platform already decides: an app's visibility scope is what says
   * who in the tenant may open a conversation with it, and that decision
   * belongs in the developer console rather than duplicated here.
   */
  senderAllowlist?: string[]
  /**
   * When non-empty, only these group chat ids (`oc_…`) are served. Empty serves
   * any group the bot is added to. Group members are NOT gated individually:
   * a group is a room someone deliberately put the bot in, so the gate that
   * matters is which rooms, and {@link requireMention} decides what counts as
   * addressing it.
   */
  groupAllowlist?: string[]
  /**
   * Open ids (`ou_…`) allowed to answer approval questions. Empty lets whoever
   * may drive that chat answer it too, which in a group is the room; the
   * settled card names who decided either way. Set this when an escalation
   * should need a named human — it grants more power than the sandbox allows.
   */
  approvers?: string[]
  /**
   * 三级分级管控（公司信息安全手册合规）：
   * 🟢 绿区 = 不命中任何 pattern，零打扰直接执行；
   * 🟡 黄区 = 命中 {@link yellowPatterns}（超过一般要求但未到红线）→ 提醒确认；
   * 🔴 红区 = 命中 {@link redPatterns} 或触碰 lockModel/warnTools 之外的高危行为 → 强制审计留痕 + block/approval。
   */
  /** 黄区正则（字符串形式，命中即提醒确认）。默认种子按手册 L2/L3 敏感特征。 */
  yellowPatterns?: string[]
  /** 红区正则（字符串形式，命中即强制留痕并按 {@link onRed} 处置）。默认种子为数据形态特征（PII 等）。 */
  redPatterns?: string[]
  /** 黄区行为：`remind`（默认，提醒确认后继续）| `off`（不提醒直接通过，仅审计记录）。 */
  onYellow?: 'remind' | 'off'
  /** 红区行为：`block`（默认，拦截 + 留痕）| `approval`（转审批人批准 + 留痕）。两者都强制审计。 */
  onRed?: 'block' | 'approval'
  /** 黄区提醒去重窗口（分钟）：同会话同 pattern 在此窗口内不再重复提醒，直接放行。 */
  remindDedupeMinutes?: number
  /** 工具黄区名单：宿主请求审批时自动放行并发送一次提醒（而非审批卡）。 */
  warnTools?: string[]
  /** 工具红区名单：宿主请求审批时强制审批卡片 + 审计留痕（决定人/结果入审计）。 */
  approvalTools?: string[]
  /** 锁定模型路由：true 时 `/model use` 与模型卡片切换需审批人批准，否则拒绝并留痕（红区事件）。 */
  lockModel?: boolean
  /** 审计总开关（默认 true）。注意：红区事件强制留痕，不受本开关影响。 */
  auditEnabled?: boolean
  /** 审计日志文件路径（JSONL）。缺省 `$DSH_HOME/logs/lark-audit.jsonl`。 */
  auditLogFile?: string
  /** 审计：绿区事件是否也记录（默认 false = 零打扰；红区/黄区始终记录）。 */
  auditRecordGreen?: boolean
  /** 审计：落盘前剥离 PII（默认 true）。 */
  auditStripPii?: boolean
}

/** Configuration after defaults have been resolved; credentials may still be pending onboarding. */
export interface ResolvedConfig {
  instance?: string | undefined
  appId?: string | undefined
  appSecret?: string | undefined
  appSecretRef?: string | undefined
  domain?: string | undefined
  cwd?: string | undefined
  workspaceRoots: string[]
  chatWorkspaces: Record<string, string>
  chatModels: Record<string, string>
  chatEpochs: Record<string, string>
  provider?: string | undefined
  model?: string | undefined
  preset?: string | undefined
  sessionScope: SessionScope
  output: 'cot' | 'stream'
  showProcess: boolean
  attachImages: boolean
  hideProcessWhenDone: boolean
  syncSlashCommands: boolean
  denyTools: string[]
  botPeers: string[]
  botHops: number
  requireMention: boolean
  senderAllowlist: string[]
  groupAllowlist: string[]
  approvers: string[]
  yellowPatterns: string[]
  redPatterns: string[]
  onYellow: 'remind' | 'off'
  onRed: 'block' | 'approval'
  remindDedupeMinutes: number
  warnTools: string[]
  approvalTools: string[]
  lockModel: boolean
  auditEnabled: boolean
  auditLogFile: string | undefined
  auditRecordGreen: boolean
  auditStripPii: boolean
}

/**
 * 默认黄区 pattern 种子（按手册 L2/L3 敏感特征；管理员可覆盖）。
 * 命中只触发提醒，不阻断——词级命中天然有误报，提醒档容忍误报。
 */
const DEFAULT_YELLOW_PATTERNS = [
  '采购底价',
  '供应商成本',
  'BOM\\s*表',
  'CAD\\s*图纸',
  '源代码',
  '源码',
  '客户名单',
  'Listing\\s*文案',
  '爆款打法',
  '销量数据',
  '客单价',
  '运营数据',
] as const

/**
 * 默认红区 pattern 种子（按手册 L4 数据形态特征：PII 与高敏数据形状）。
 * 数据形态命中代表真实数据正在输入/输出——这比词级命中可靠得多，故放红区。
 */
const DEFAULT_RED_PATTERNS = [
  '\\b1[3-9]\\d{9}\\b',      // 中国大陆手机号
  '\\b\\d{17}[\\dXx]\\b',    // 18 位身份证
  '\\b\\d{16,19}\\b',        // 银行卡/信用卡号
  '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b', // 邮箱地址
] as const

/** Loader-visible configuration schema and defaults. */
export const Config: z<Config> = z.object({
  instance: z.string(),
  appId: z.string(),
  appSecret: z.string().role('secret'),
  appSecretRef: z.string(),
  domain: z.string(),
  cwd: z.string(),
  workspaceRoots: z.array(String),
  chatWorkspaces: z.dict(String).default({}),
  chatModels: z.dict(String).default({}),
  chatEpochs: z.dict(String).default({}),
  provider: z.string(),
  model: z.string(),
  preset: z.string(),
  sessionScope: z.union(['chat', 'chat-thread', 'chat-sender'] as const).default('chat'),
  output: z.union(['cot', 'stream'] as const).default('cot'),
  showProcess: z.boolean().default(true),
  attachImages: z.boolean().default(false),
  hideProcessWhenDone: z.boolean().default(false),
  syncSlashCommands: z.boolean().default(true),
  denyTools: z.array(String).default([...DEFAULT_DENY_TOOLS]),
  botPeers: z.array(String).default([]),
  botHops: z.number().default(DEFAULT_BOT_HOPS),
  requireMention: z.boolean().default(true),
  senderAllowlist: z.array(String),
  groupAllowlist: z.array(String),
  approvers: z.array(String),
  yellowPatterns: z.array(String).default([...DEFAULT_YELLOW_PATTERNS]),
  redPatterns: z.array(String).default([...DEFAULT_RED_PATTERNS]),
  onYellow: z.union(['remind', 'off'] as const).default('remind'),
  onRed: z.union(['block', 'approval'] as const).default('block'),
  remindDedupeMinutes: z.number().default(5),
  warnTools: z.array(String).default([]),
  approvalTools: z.array(String).default([]),
  lockModel: z.boolean().default(false),
  auditEnabled: z.boolean().default(true),
  auditLogFile: z.string(),
  auditRecordGreen: z.boolean().default(false),
  auditStripPii: z.boolean().default(true),
})

/**
 * Resolve the same defaults for direct callers that bypass Cordis Loader.
 * @param config - Serialized configuration with the required credentials.
 * @returns Configuration with all schema defaults applied.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  return {
    ...config,
    workspaceRoots: config.workspaceRoots ?? [],
    chatWorkspaces: config.chatWorkspaces ?? {},
    chatModels: config.chatModels ?? {},
    chatEpochs: config.chatEpochs ?? {},
    sessionScope: config.sessionScope ?? 'chat',
    output: config.output ?? 'cot',
    showProcess: config.showProcess ?? true,
    attachImages: config.attachImages ?? false,
    hideProcessWhenDone: config.hideProcessWhenDone ?? false,
    syncSlashCommands: config.syncSlashCommands ?? true,
    denyTools: config.denyTools ?? [...DEFAULT_DENY_TOOLS],
    botPeers: config.botPeers ?? [],
    botHops: config.botHops ?? DEFAULT_BOT_HOPS,
    requireMention: config.requireMention ?? true,
    senderAllowlist: config.senderAllowlist ?? [],
    groupAllowlist: config.groupAllowlist ?? [],
    approvers: config.approvers ?? [],
    yellowPatterns: config.yellowPatterns ?? [...DEFAULT_YELLOW_PATTERNS],
    redPatterns: config.redPatterns ?? [...DEFAULT_RED_PATTERNS],
    onYellow: config.onYellow ?? 'remind',
    onRed: config.onRed ?? 'block',
    remindDedupeMinutes: config.remindDedupeMinutes ?? 5,
    warnTools: config.warnTools ?? [],
    approvalTools: config.approvalTools ?? [],
    lockModel: config.lockModel ?? false,
    auditEnabled: config.auditEnabled ?? true,
    auditLogFile: config.auditLogFile,
    auditRecordGreen: config.auditRecordGreen ?? false,
    auditStripPii: config.auditStripPii ?? true,
  }
}
