# stay-DSH · 企业信息安全框架版 DeepSeek Harness 飞书通道

基于 **dsh-lark-channel**（[omdsh-dev/dsh-lark](https://github.com/omdsh-dev/dsh-lark)，BSD-3-Clause）的企业安全加固分支。

把 DeepSeek Harness 接入飞书/Lark，并内置**三级分级管控**（绿区零打扰 / 黄区提醒 / 红区留痕），
面向企业信息安全手册的 AI 使用规范（数据输入红线、人在回路、审计留痕、凭证管控）设计。

## 安全框架总览

| 档位 | 判定 | 系统行为 |
|---|---|---|
| 🟢 绿区 | 不命中任何敏感特征 | 直接执行，零打扰 |
| 🟡 黄区 | 命中黄区特征（内部敏感词、可疑提示注入） | 轻量提醒卡片，确认后继续；同会话同特征去重（默认 5 分钟） |
| 🔴 红区 | 命中红区特征（PII 数据形态等）或锁定行为 | **强制审计留痕**（写失败即拒绝操作，fail-closed）+ 拦截或转审批 |

### 核心模块

- `src/tiers.ts` — 三档判定核心（红 > 黄 > 绿，正则编译容错）
- `src/dlp.ts` — 入站分级门控（绿区放行 / 黄区提醒 / 红区 block 或 approval）
- `src/prompt-guard.ts` — 提示注入轻量检测（并入黄区提醒）
- `src/remind.ts` — 黄区提醒卡片、去重状态、红线拦截文案
- `src/audit.ts` — 审计 JSONL 日志：红区事件强制留痕、PII 剥离、按大小滚动、可对接 SIEM
- `src/outbound-filter.ts` — 输出分级：绿直发 / 黄追加人工核验提醒 / 红拦截+留痕
- `src/cards.ts` — 门控卡片（提醒/审批/结果，双语文案）

### 关键配置

```yaml
# 三级分级
yellowPatterns: [采购底价, 'BOM\s*表', 源代码, 客户名单]   # 黄区：提醒确认
redPatterns: ['\b1[3-9]\d{9}\b', '\b\d{17}[\dXx]\b']      # 红区：强制留痕
onYellow: remind        # remind（默认）| off
onRed: block            # block（默认，拦截+留痕）| approval（转审批人+留痕）
remindDedupeMinutes: 5  # 黄区提醒去重窗口

# 工具与模型
warnTools: []           # 工具黄区：自动放行 + 一次提醒
approvalTools: []       # 工具红区：强制审批卡片 + 审计
lockModel: false        # true = 模型切换需审批人（防止数据切到公共模型）

# 审计
auditEnabled: true      # 红区事件强制留痕，不受此开关影响
auditLogFile: ''        # 缺省 $DSH_HOME/logs/lark-audit.jsonl
auditRecordGreen: false # 绿区默认不记录（零打扰）
auditStripPii: true     # 落盘前剥离手机号/身份证/邮箱等 PII

# 访问边界
senderAllowlist: []     # 私聊白名单（ou_ 开头 open_id）
groupAllowlist: []      # 群白名单（oc_ 开头 chat_id）
approvers: []           # 审批人白名单（红区 approval 模式必需）
workspaceRoots: []      # /cd 可切换的目录前缀
requireMention: true    # 群里必须 @ 才响应
```

完整配置见 `cordis.patch.yml`（部署示例见 `deploy/lark-profile.example.yml`）。

## 部署

```sh
# 安装 DSH（需 Node ^22.19 || >=24）
npm i -g @deepseek-ai/dsh

# 创建独立 lark profile 并安装本插件（本地构建）
dsh plugin --profile lark add <本包 tarball 路径>

# 按 deploy/lark-profile.example.yml 写安全配置到
# $DSH_HOME/profiles/lark/cordis.patch.yml（注意用 id-targeted 覆盖，不要 insert 同名行）

# 启动
dsh --profile lark
```

首次启动无 `LARK_APP_ID`/`LARK_APP_SECRET` 环境变量时，会打印二维码引导创建飞书应用，
凭据自动存入宿主凭据存储（settings 只留引用，不落明文）。

Windows 无管理员权限时可用「启动文件夹」自启：把 `deploy/start-lark-bot.example.cmd` 放入
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`。

## 上游

本仓库是 [omdsh-dev/dsh-lark](https://github.com/omdsh-dev/dsh-lark) 的加固分支（v0.0.6）。
安全加固集中在三级分级模块与 `src/bridge.ts` 的挂点上；
升级上游时注意 `src/config.ts` / `src/bridge.ts` 的合并。

## License

BSD-3-Clause（与上游一致）。
