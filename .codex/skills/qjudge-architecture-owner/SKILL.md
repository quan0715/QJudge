---
name: qjudge-architecture-owner
description: QJudge 架構全責技能。當任務涉及分層責任、import direction、feature 拆分、檔名路徑歸屬、重構規劃時使用。只定義架構決策，不包含 PR/compose/UI 細節。
---

# QJudge Architecture Owner

## Quick start
- 先讀 `references/layer-boundaries.md` 決定代碼落點。
- 新功能或大重構再讀 `references/feature-workflow.md`。
- 先做責任切分，再做檔案搬移或重命名。

## 責任邊界（Owner Scope）
- ✅ layer 目錄責任（features/shared/core/infrastructure/...）。
- ✅ import direction 與 boundary 例外策略。
- ✅ feature workflow（spec -> shared -> feature -> wiring）。
- ❌ 不定義 PR 策略（交給 `qjudge-github-workflow-owner`）。
- ❌ 不定義 UI 視覺與 Carbon 細節（交給 `qjudge-ui-carbon-owner`）。
- ❌ 不定義容器執行流程（交給 `qjudge-env-compose-owner`）。

## 核心規則
- Core 層保持純淨：無 UI、無 I/O。
- Infrastructure 是外部 I/O 唯一入口。
- Shared 不依賴 feature runtime 細節。
- Feature 只組裝該 domain 的 workflow。

## 檢查命令（由 quality skill 提供腳本）
- `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src`
- `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src`

## 參考文件
- 層級邊界：`references/layer-boundaries.md`
- 新功能流程：`references/feature-workflow.md`

## Cross-skill handoff
- 需要提交/PR/release，轉 `qjudge-github-workflow-owner`。
- 需要 UI 規範與 Storybook，轉 `qjudge-ui-carbon-owner`。
- 需要容器環境執行，轉 `qjudge-env-compose-owner`。

## Portable notes
- 可移植核心：清楚邊界 + 單向依賴 + 明確 composition root。
- QJudge 特化僅在路徑命名與 lint 規則；概念可直接複用。
