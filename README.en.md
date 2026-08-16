# stay-DSH · Enterprise security-framework build of DeepSeek Harness × Feishu

A security-hardened fork of **dsh-lark-channel** ([omdsh-dev/dsh-lark](https://github.com/omdsh-dev/dsh-lark), BSD-3-Clause).

Bridges DeepSeek Harness into Feishu/Lark with built-in **three-tier graduated control** (green: zero friction / yellow: remind / red: audit & block), shaped for enterprise info-security manuals on AI use (data-input red lines, human-in-the-loop, audit trails, credential control).

## Framework overview

| Tier | Trigger | Behavior |
|---|---|---|
| 🟢 Green | no sensitive pattern hit | runs untouched, zero friction |
| 🟡 Yellow | yellow pattern (internal keywords, suspicious prompt injection) | one lightweight reminder card; continue on confirm; deduped per conversation+pattern (default 5 min) |
| 🔴 Red | red pattern (data-shaped PII, etc.) or locked behavior | **mandatory audit record** (fail-closed if write fails) + block or route to approver |

### Modules

- `src/tiers.ts` — tier classifier core (red > yellow > green, tolerant regex compile)
- `src/dlp.ts` — inbound gate (pass / remind / block / approval)
- `src/prompt-guard.ts` — prompt-injection detection (folded into yellow tier)
- `src/remind.ts` — reminder cards, dedupe state, red-line block copy
- `src/audit.ts` — JSONL audit log: red-line events always recorded, PII stripped, size-rotated, SIEM-ready
- `src/outbound-filter.ts` — outbound grading: send / annotate for human review / block+audit
- `src/cards.ts` — gate cards (remind / approve / result, bilingual)

### Key config

```yaml
yellowPatterns: [采购底价, 'BOM\s*表', 源代码, 客户名单]   # yellow: remind
redPatterns: ['\b1[3-9]\d{9}\b', '\b\d{17}[\dXx]\b']      # red: mandatory audit
onYellow: remind        # remind (default) | off
onRed: block            # block (default) | approval
remindDedupeMinutes: 5
warnTools: []           # yellow tools: auto-allow + notice
approvalTools: []       # red tools: mandatory approval + audit
lockModel: false        # true = model switching requires an approver
auditEnabled: true      # red-line events always recorded regardless
auditLogFile: ''        # default $DSH_HOME/logs/lark-audit.jsonl
auditRecordGreen: false
auditStripPii: true
senderAllowlist: []     # DM allowlist (ou_ ids)
groupAllowlist: []      # group allowlist (oc_ ids)
approvers: []           # approval allowlist (needed for onRed: approval)
workspaceRoots: []      # /cd directory prefixes
requireMention: true
```

See `cordis.patch.yml` for the full reference, and `deploy/lark-profile.example.yml` for a sanitized deployment template.

## Deploy

```sh
npm i -g @deepseek-ai/dsh
dsh plugin --profile lark add <path-to-this-package-tarball>
# write security config into $DSH_HOME/profiles/lark/cordis.patch.yml
# (use id-targeted override, NOT an insert row with the same id)
dsh --profile lark
```

Without `LARK_APP_ID`/`LARK_APP_SECRET` env vars, first boot prints a QR code to create the Feishu app;
credentials are stored through the host credential store (settings keep only a reference).

On Windows without admin rights, autostart via the Startup folder using `deploy/start-lark-bot.example.cmd`.

## Upstream

Fork of [omdsh-dev/dsh-lark](https://github.com/omdsh-dev/dsh-lark) (v0.0.6). The hardening lives in the
three-tier modules and the hooks in `src/bridge.ts`; watch `src/config.ts` / `src/bridge.ts` when merging upstream.

## License

BSD-3-Clause (same as upstream).
