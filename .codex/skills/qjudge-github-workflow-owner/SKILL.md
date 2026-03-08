---
name: qjudge-github-workflow-owner
description: QJudge 的 GitHub 全責工作流。當任務涉及 branch 策略、commit、PR 建立、review gate、release（dev->main）時使用。只處理 Git/PR 決策，不定義 UI 或架構規範細節。
---

# QJudge GitHub Workflow Owner

## Quick start
- 先同步 `dev`：`git switch dev && git fetch origin main && git merge --ff-only origin/main`。
- 從 `dev` 開分支：`git switch -c codex/<topic>`。
- 提交：`bash .codex/skills/qjudge-github-workflow-owner/scripts/commit-changes.sh "type: message"`。
- 開 PR：`bash .codex/skills/qjudge-github-workflow-owner/scripts/create-pr.sh --base dev --title "title"`。

## 責任邊界（Owner Scope）
- ✅ branch 命名、commit 粒度、PR base/head、PR 描述與標籤策略。
- ✅ release 流程（`dev -> main`）。
- ✅ merge 前流程 gate（檢查是否有跑 quality scripts）。
- ❌ 不定義 import boundaries（交給 `qjudge-architecture-owner`）。
- ❌ 不定義 Carbon/UI 規範（交給 `qjudge-ui-carbon-owner`）。
- ❌ 不定義 compose 命令細節（交給 `qjudge-env-compose-owner`）。

## 執行規則
- 僅允許：`codex/* -> dev` 或 `dev -> main`。
- 不在 `main` 直接 commit。
- PR 應小而可審：建議 <= 20 檔、<= 400 行增刪（特殊情況需在 PR 說明理由）。
- 開 PR 前最少要跑：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src`
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src`

## 參考文件
- PR policy / labels：`references/pr-policy.md`

## Cross-skill handoff
- 涉及層級責任或路徑歸屬，先切到 `qjudge-architecture-owner`。
- 涉及 UI/Storybook/overflow，切到 `qjudge-ui-carbon-owner`。
- 涉及容器指令或 migrate/test 執行，切到 `qjudge-env-compose-owner`。

## Portable notes
- 可移植原則：保留 `feature branch -> integration branch -> release branch` 三段流。
- 若非 QJudge 專案，替換 base 分支名與 lint 指令即可沿用。
