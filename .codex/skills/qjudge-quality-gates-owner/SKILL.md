---
name: qjudge-quality-gates-owner
description: Use when auditing or enforcing QJudge naming, architecture, Carbon practices, accessibility candidates, style restrictions, or CI quality profiles.
metadata:
  version: "2026.08.12"
  carbon_mcp_verified: "2026-08-12"
  carbon_framework: "v11"
  carbon_reference_tag: "v11.113.0"
---

# QJudge Quality Gates Owner

## Quick start
- 先跑 naming：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src`
- 再跑 architecture：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src`
- 檢查 repository public surface：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-repository-exports.js`
- 跑 Carbon 全量 audit（不因 review findings 失敗）：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/audit-carbon-practices.js --root frontend/src`
- 檢查 staged hard blockers：
  - `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged`
- 需要確認歷史債是否歸零時跑 strict：
  - `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all`

## 責任邊界（Owner Scope）
- ✅ lint 規則、Carbon quality profile（compat/strict）、CI gate 定義。
- ✅ 架構/命名/Carbon public API/樣式禁則的可執行檢查腳本。
- ✅ 違規分類與遷移節奏（先報告再阻擋）。
- ❌ 不做 feature 架構決策（交給 `qjudge-architecture-owner`）。
- ❌ 不做 PR 流程決策（交給 `qjudge-github-workflow-owner`）。

## Policy
- `audit`：全量掃描，將每個檔案標成 `clean`、`findings`、`policy-reviewed`、`exception-review` 或 `not-applicable`；review 類不阻擋。
- `compat`：以 `--staged` 防止新的 Carbon internal selector 與 `!important` 進入（預設 PR gate）。
- `strict`：以 `--all` 掃整個 root；只要仍有 blocker 就失敗，作為歷史債收斂目標。

## Carbon audit contract

- `blocker`：`.cds--*` / `.bx--*` internal selector、`!important`。
- `review`：hard-coded theme/spacing/type、raw controls、accessible labels、notification variant、scroll owner 等需結合 UI context 判斷的候選。
- `policy-reviewed`：已由 `references/carbon-audit-decisions.json` 以精確檔案、元件類型、理由、owner 與移除條件完成審查；新路徑或新控制類型不會自動繼承決策。
- `exception-review`：測試 fixture、`shared/copilot` boundary、editor/media 等合理但仍需人工驗證的例外。
- 需要人工視覺／runtime 判斷的 review debt 由 `references/carbon-manual-review-budget.json` 鎖定上限，只能下降；可精確映射的 spacing 使用 `scripts/fix-carbon-spacing-tokens.js --write` 處理。
- Audit script 會使用專案 TypeScript parser 做 JSX semantic checks；缺少 frontend dependencies 時退回保守 regex 掃描。
- 不建立不存在的 generic Carbon override allowlist。若真的需要 compatibility boundary，必須是命名明確、範圍最小且有移除條件的 app-owned wrapper。

## 參考文件
- `references/quality-profiles.md`
- `references/carbon-audit-decisions.json`
- `references/carbon-manual-review-budget.json`
- `scripts/lint-naming.js`
- `scripts/lint-architecture.js`
- `scripts/lint-repository-exports.js`
- `scripts/audit-carbon-practices.js`
- `scripts/check-carbon-style.sh`

## Portable notes
- 可移植核心：可執行規則 > 文字規範。
- 新專案只需替換 root path 與 package-specific exception policy，即可重用。
