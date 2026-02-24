---
name: QJudge-React-Carbon-Frontend-Architecture-And-Gated-Workflow
description: IBM Carbon React 為主的 QJudge 前端架構與分 Gate 重構工作流，定義目錄責任、Carbon-first 禁止事項、PR 政策、Import Boundaries、Component Registry、AI Prompt 模板與漸進式重構計畫。用於 app/features/shared/core/infrastructure 分層收斂與長期維護。
---

# QJudge React Carbon Frontend Architecture & Gated Workflow

## 快速開始（精簡）
- 這個 SKILL 只保留入口，細節請按需打開 `references/`：
  - 架構/邊界：`references/architecture-and-boundaries.md`
  - Carbon 規範：`references/carbon-first-policy.md`
  - Gate 與 DoD：`references/gated-workflow.md`
  - PR / Registry：`references/pr-and-registry.md`
  - 檢查腳本：`references/checks-and-scripts.md`
  - Prompt 模板：`references/prompt-templates.md`
  - Storybook：`references/storybook-guidelines.md`
  - 重構路線：`references/refactor-plan.md`

## 現況口徑（2026）
- Canonical 分層：`src/app`、`src/features`、`src/shared`、`src/core`、`src/infrastructure`。
- `src/services` 視為歷史相容區（目前主要是整合測試）；新功能不要新增 runtime 邏輯到 `src/services`。
- 每個 feature 需有 `routes.tsx`，由 `index.ts` 匯出；畫面命名用 `*Screen.tsx`（不新建 `*Page.tsx`）。

## 硬性約束（所有任務都適用）
- 禁止覆蓋 `.cds--*` / `.bx--*`。
- 禁止 `!important`。
- Layout 只用 Carbon Grid/FlexGrid/Row/Column（必要時可用 Stack/Layer）。
- 遵守 Import Boundaries（以 `qjudge-clean-arch-workflow` 的 lint script 為最終 gate）。

## Gate 流程（摘要）
- Gate 0：Spec/狀態/欄位。
- Gate 1：`shared/ui`。
- Gate 2：`shared/layout`。
- Gate 3：`features/*/screens`（mock/fixtures）。
- Gate 4：`features/*/hooks` + `infrastructure` 接線。

## Gate 切換規則
- 跨 Gate 前必須明確詢問並取得使用者同意。

## Storybook 同步規則
- 變更 `shared/ui` 或 `features/*/components`，必須同步更新 `.stories.tsx` 與 story registry。
