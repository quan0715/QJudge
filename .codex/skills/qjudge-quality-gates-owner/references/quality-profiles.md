# Quality Profiles

## audit
- 目標：完整清冊與債務分類，不把需要 context 的候選誤當 hard failure。
- 命令：`node .codex/skills/qjudge-quality-gates-owner/scripts/audit-carbon-practices.js --root frontend/src`。
- 狀態：`clean`、`findings`、`policy-reviewed`、`exception-review`、`not-applicable`。
- disposition：`blocker`、`review`、`policy-reviewed`、`exception-review`。
- `policy-reviewed` 必須來自 `carbon-audit-decisions.json` 的精確路徑與元件類型決策，且包含理由、owner 與移除條件。

## staged (local fast path)
- 目標：快速檢查已暫存檔案是否新增 blocker。
- 適用：本機迭代；不可取代合併前的全量檢查。
- Carbon 命令：`bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged`。

## strict (CI hard gate)
- 目標：完整 root 沒有 Carbon internal selector 或 `!important` blocker。
- 適用：目前 CI 與合併前驗證。
- Carbon 命令：`bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all`。

## Current workflow
1. 先用 `audit` 取得包含 review disposition 的完整清冊。
2. 開發中可跑 `staged` 縮短回饋時間。
3. 合併前與 CI 必跑 `strict`；任何 blocker 都會阻擋。
