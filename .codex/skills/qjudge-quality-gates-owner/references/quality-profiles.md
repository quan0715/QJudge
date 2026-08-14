# Quality Profiles

## audit
- 目標：完整清冊與債務分類，不把需要 context 的候選誤當 hard failure。
- 命令：`node .codex/skills/qjudge-quality-gates-owner/scripts/audit-carbon-practices.js --root frontend/src`。
- 狀態：`clean`、`findings`、`policy-reviewed`、`exception-review`、`not-applicable`。
- disposition：`blocker`、`review`、`policy-reviewed`、`exception-review`。
- `policy-reviewed` 必須來自 `carbon-audit-decisions.json` 的精確路徑與元件類型決策，且包含理由、owner 與移除條件。

## compat (default)
- 目標：不讓新違規進入，容許已知歷史債先存在。
- 適用：正在重構中、需保持交付速度。
- Carbon 命令：`bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged`。

## strict
- 目標：完整 root 沒有 Carbon internal selector 或 `!important` blocker。
- 適用：模組已完成收斂、準備硬阻擋。
- Carbon 命令：`bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all`。

## Recommended rollout
1. 先產生 `audit` 基線，將 test/editor/copilot 例外逐項確認。
2. PR gate 強制 `compat`，禁止新增 blocker。
3. CI 定期跑 `strict` 並保存完整報告；歷史債未清完前可不阻擋 release。
4. blocker 歸零後，將 `strict` 改成必要 gate。
