---
name: qjudge-quality-gates-owner
description: QJudge 品質門檻全責技能。當任務涉及 naming lint、architecture lint、樣式禁則（.cds/.bx/!important）與 CI gate 設定時使用。
---

# QJudge Quality Gates Owner

## Quick start
- 先跑 naming：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src`
- 再跑 architecture：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src --policy compat`
- 最後跑 Carbon style gate：
  - `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh`

## 責任邊界（Owner Scope）
- ✅ lint 規則、quality profile（compat/strict）、CI gate 定義。
- ✅ 架構/命名/樣式禁則的可執行檢查腳本。
- ✅ 違規分類與遷移節奏（先報告再阻擋）。
- ❌ 不做 feature 架構決策（交給 `qjudge-architecture-owner`）。
- ❌ 不做 PR 流程決策（交給 `qjudge-github-workflow-owner`）。

## Policy
- `compat`：先兼容既有歷史債，防止新增違規（預設）。
- `strict`：完整 clean architecture 邊界，作為收斂目標。

## 參考文件
- `references/quality-profiles.md`
- `scripts/lint-naming.js`
- `scripts/lint-architecture.js`
- `scripts/check-carbon-style.sh`

## Portable notes
- 可移植核心：可執行規則 > 文字規範。
- 新專案只需替換 root path 與 allowlist file，即可重用。
