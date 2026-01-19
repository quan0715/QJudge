---
name: QJudge-React-Carbon-Frontend-Architecture-And-Gated-Workflow
description: IBM Carbon React 為主的 QJudge 前端架構與分 Gate 重構工作流，定義目錄責任、Carbon-first 禁止事項、PR 政策、Import Boundaries、Component Registry、AI Prompt 模板與漸進式重構計畫。用於 pages/features/shared/core/services 分層收斂與長期維護。
---

# QJudge React Carbon Frontend Architecture & Gated Workflow

## 快速開始（讀這段 + 按需開啟參考檔）
- 主要說明拆到 `references/`，SKILL 僅保留流程與出口。請依需求讀對應檔案：
  - 架構/目錄/邊界：`references/architecture-and-boundaries.md`
  - Carbon 禁止事項：`references/carbon-first-policy.md`
  - Gate 定義與 DoD：`references/gated-workflow.md`
  - PR / Registry：`references/pr-and-registry.md`
  - CI/grep 檢查：`references/checks-and-scripts.md`
  - 重構 PR 計畫：`references/refactor-plan.md`
  - Gate Prompt 模板：`references/prompt-templates.md`
  - **Storybook 規範**：`references/storybook-guidelines.md`
- Gate 切換必須停下來請使用者確認，再進入下一 Gate。
- 硬性約束（任何任務都適用）：禁止覆蓋 `.cds--*`/`.bx--*`，禁止 `!important`，Layout 一律用 Carbon Grid/FlexGrid/Row/Column；遵守 Import Boundaries。
- **Feature 路由規範**：
  - 每個 feature 必須有 `routes.tsx` 定義路由，由 `index.ts` 統一匯出
  - 使用 `Screen` 命名（如 `ProblemListScreen.tsx`），不使用 `Page`
  - `App.tsx` 透過 `{xxxRoutes}` 引入各 feature 路由
- **Storybook 同步規則**：開發或更新 `shared/ui` 或 `features/*/components` 組件時，必須同步建立或更新對應的 `.stories.tsx`。訪問路徑：`/dev/storybook`（僅開發環境）。

## 常見工作流程
- 開發 shared 小元件（Gate 1）
  1) 確認已有 Gate 0 Spec/狀態與 prop keys；若沒有，停下請使用者補 Gate 0。  
  2) 讀 `references/carbon-first-policy.md`、`references/architecture-and-boundaries.md`。  
  3) 在 `src/shared/ui` 開發：不串 API，不依賴 feature context，不改 layout。  
  4) **同步建立 `.stories.tsx`**：包含 `argTypes` 定義與 Playground story，並在 `features/storybook/registry/index.ts` 註冊。  
  5) 補 Component Registry 條目（見 `references/pr-and-registry.md` 範本）。  
  6) 請使用者確認 Gate 1 成果後，才允許他人進 Gate 2/3 使用。
- 開發新 feature 畫面（Gate 3 ➜ Gate 4）
  1) Gate 0：撰寫 Spec（狀態/欄位/權限），停下請使用者確認。  
  2) Gate 1/2：若需要新的 UI/版型，先要求 Gate 1/2 完成並確認；缺件時回報清單。  
  3) Gate 3：在 `src/features/<domain>/screens` 用 mock/fixtures 組裝，引用 shared/ui + shared/layout，完成後請使用者確認畫面與狀態。  
  4) Gate 4：接 services/hooks，僅做資料 mapping，不改 layout；完成後再請使用者確認。  
  5) PR 說明需含所處 Gate、邊界檢查、Registry 變更、測試方式。

## Gate 切換確認
- 任何跨 Gate（0→1→2→3→4）必須明說「目前 Gate = X，是否同意進入 Gate Y？」等待使用者明確同意後再進行。

## 需要細節？
- 架構/搬移/邊界：開 `references/architecture-and-boundaries.md`
- Carbon/styling：開 `references/carbon-first-policy.md`
- Gate/DoD：開 `references/gated-workflow.md`
- PR/Registry：開 `references/pr-and-registry.md`
- 檢查腳本：開 `references/checks-and-scripts.md`
- 重構路線：開 `references/refactor-plan.md`
- Prompts：開 `references/prompt-templates.md`
- **Storybook 規範**：開 `references/storybook-guidelines.md`