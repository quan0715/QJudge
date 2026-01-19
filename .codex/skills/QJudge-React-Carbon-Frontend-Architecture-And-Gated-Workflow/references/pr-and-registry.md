# PR Policy 與 Component Registry

## PR Policy
- PR 粒度：以 Gate 為單位，小範圍重構；單 PR 變更檔案 ≤ 20，程式碼行數（加總增刪）建議 ≤ 400。
- PR 標籤：`gate-0`...`gate-4`，`shared-ui`，`shared-layout`，`services-only`，`core-only`，`registry-update`。
- PR 內容限制：不得跨 Gate 擴張（若需跨 Gate，拆 PR）；涉及 Carbon override 必須附理由。
- PR 描述需含：目標、受影響區、Import Boundary 檢查、Registry 是否更新、測試方式。
- **shared/ui PR 必須包含**：對應的 `.stories.tsx` 檔案更新、registry 註冊確認。
- Code Review 著重：邊界違規、Carbon 覆蓋、Gate 範圍、重複輪子、**Story 是否同步更新**。

## Component Registry（可複製範本）
- 新增/調整 shared 元件必須更新 Registry 條目。
- 範本：
```
- Name: <元件名稱>
  Path: src/shared/ui/<or layout>/<name>.tsx
  Story: src/shared/ui/<or layout>/<name>.stories.tsx
  Purpose: <用途>
  When to use: <適用情境>
  When NOT to use: <不適用情境>
  Props (required/common): <列出必填與常用>
  Do: <Carbon-first 行為>
  Don't: <禁止事項>
  Usage References (示例，後續可更新): <1~3 條目，含預期 screens/pages 路徑>
```

## Storybook Story 檔案規範
- 檔案位置：與組件同目錄，命名為 `<ComponentName>.stories.tsx`
- 必須包含：
  - `meta.argTypes`：定義所有可調整的 Props（control type、label、description、options）
  - `Playground` story：第一個 story，使用 Controls 面板動態調整
  - 其他 stories：展示各種變體與使用情境
- 註冊位置：`src/features/storybook/registry/index.ts`
- 訪問路徑：`/dev/storybook/<category>/<component-path>`（僅開發環境）

## Registry 示例條目（可替換為真實路徑）
- Name: ConfirmModal  
  Path: src/shared/ui/confirm-modal/ConfirmModal.tsx  
  Story: src/shared/ui/confirm-modal/ConfirmModal.stories.tsx  
  Purpose: 標準確認對話框，統一 CTA/secondary 樣式。  
  When to use: 危險操作或不可逆動作前。  
  When NOT to use: 資訊提醒請用通知/inline 提示。  
  Props: `open`(required), `title`(required), `body`, `primaryLabel`, `secondaryLabel`, `onConfirm`, `onCancel`.  
  Do: 使用 Carbon `Modal` + token；按鈕用 Carbon `Button kind="danger"/"secondary"`。  
  Don't: 客製寬度/陰影；不得覆蓋 `.cds--modal`。  
  Usage References (示例): src/features/contest/screens/DeleteContestScreen.tsx, src/features/problem/screens/ArchiveProblemScreen.tsx.

- Name: StatusBadge  
  Path: src/shared/ui/status-badge/StatusBadge.tsx  
  Story: src/shared/ui/status-badge/StatusBadge.stories.tsx  
  Purpose: 顯示狀態（成功/警告/錯誤/進行中）。  
  When to use: 列表或細節頁的狀態展示。  
  When NOT to use: 大型提示區塊（應用 inline notification）。  
  Props: `status`(required: success|warning|error|info|draft), `label`, `size`(sm|md).  
  Do: 使用 Carbon `Tag`/`StatusIcon`; 顏色對應 Carbon tokens。  
  Don't: 自定義背景顏色；不得直接覆蓋 `.cds--tag`。  
  Usage References (示例): src/features/submission/screens/SubmissionListScreen.tsx, src/features/problem/screens/ProblemDetailScreen.tsx.

- Name: StickyTabs  
  Path: src/shared/ui/sticky-tabs/StickyTabs.tsx  
  Story: src/shared/ui/sticky-tabs/StickyTabs.stories.tsx  
  Purpose: 頁內固定位置的分頁導航。  
  When to use: 同頁多 section 內容切換且需保持可見。  
  When NOT to use: 全頁路由切換；需要路由請用 page tabs + router。  
  Props: `tabs`(required: {id,label}[]), `activeId`, `onChange`, `offset`。  
  Do: 使用 Carbon `Tabs` + `Layer`；滾動邏輯放 hook，避免直接操作 DOM。  
  Don't: 使用 `position:fixed` 覆蓋 Carbon class；不得注入 `!important`。  
  Usage References (示例): src/features/docs/screens/DocsDetailScreen.tsx, src/features/lab/screens/LabPlaygroundScreen.tsx.
