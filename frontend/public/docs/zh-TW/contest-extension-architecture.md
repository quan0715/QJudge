# Contest 頁面擴充架構指南（前端）

> 文件狀態：2026-03-04  
> 適用範圍：`frontend/src/features/contest`

## 目標

本文件整理目前 Contest 前端架構，並提供未來新增競賽類型（例如 `take_home`）時的最小改動路徑，確保系統具備高度的擴充性（符合開放封閉原則，OCP），避免將共用或特化的判斷邏輯散落在各處。

## 目前架構（已落地）

### 1) 競賽類型模組層（Contest Type Module）

這是前端路由與渲染決策的唯一來源 (Single Source of Truth)。所有專屬於特定競賽類型的邏輯，都應封裝在其對應的模組中，而非寫死在共用的組件或 Policy 裡。

- `modules/types.ts`
  - 定義 `ContestTypeModule` 契約（包含 `student` 與 `admin` 兩側的介面）。
- `modules/registry.ts`
  - `contestType -> module` 的註冊中心。
- `modules/CodingModule.tsx`
- `modules/PaperExamModule.tsx`

**模組責任：**

- **Student：**
  - 決定可用 tab（`getTabs`）。
  - 決定特化 tab 的渲染邏輯（`getTabRenderers`）。
  - 決定作答入口的動態路由（`getAnsweringEntryPath`）。
- **Admin：**
  - 決定可用 panel（`getAvailablePanels`）。
  - 決定特定 panel 的渲染元件（`getPanelRenderers`）。
  - 決定編輯器種類（`editorKind`）與匯出選項（`getExportTargets`）。
  - 決定 JSON 匯入動作顯示時機（`shouldShowJsonActions`）。

### 2) 渲染分發層 (Renderer Registries)

為了避免 Dashboard 容器變得過度龐大，我們採用 Registry 模式進行動態渲染分發。

- **Student Tab 渲染 (`StudentTabRendererRegistry.tsx`)**
  - 負責將 `contentKind` 映射到對應的 React 組件。
  - 支援由模組透過 `getTabRenderers` 覆寫預設元件。
- **Admin Panel 渲染 (`AdminPanelRendererRegistry.tsx`)**
  - 負責將 `AdminPanelId` 映射到對應的 React 組件（如 `logs`, `participants` 等共用面板）。
  - 針對差異化面板（如 `problem_editor`, `statistics`），由各模組透過 `getPanelRenderers` 動態提供。
  - `screens/admin/AdminDashboardScreen.tsx` 現已純粹化為外殼容器，不再包含 `switch(activePanel)` 寫死邏輯。

### 3) 共用規則層（Domain Policy）

這層嚴格**禁止**包含特定模組的型別判斷（如 `if (contestType === 'coding')`），其職責僅限於處理**跨模組的共通狀態**與**外掛行為（Plugin / Feature Flag）**。

- `contestRuntimePolicy.ts`
  - 判斷是否為參賽者（`isContestParticipant`）。
  - 判斷考試狀態與防作弊監控（`isExamMonitoringActive`, `shouldWarnOnExit`）。
  - *(註：像「是否顯示 Submissions Tab」這類領域邏輯，已下放至 `CodingModule.tsx`，不在共用 Policy 中。)*
- `contestRoutePolicy.ts`
  - 管理 Precheck Gate 攔截（`shouldRouteToPrecheck`）。
  - 計算通用的作答後返回路徑（`getSubmitReviewBackPath`），這依賴模組提供的 `getAnsweringEntryPath`，確保動態路由的正確性。

## 擴充原則（必須遵守）

### A. 應共用，不應按競賽類型重複實作
- **防作弊機制 (Anti-Cheat / Precheck)**: 其啟動與否應僅依賴 `contest.cheatDetectionEnabled` 這個 Feature Flag，**絕對不可**綁定於特定的 `contestType`。
- **Dashboard 容器骨架**: `StudentDashboardLayout` 與 `AdminDashboardLayout`。
- **作答路由計算**: 使用 `enterExamUseCase` 並傳入模組解析出的 `answeringEntryPath`，統一開始考試的流程。

### B. 應由競賽模組決定（可因類型不同）
- 要顯示哪些 Tab / Panel。
- 專屬面板的 React 組件（透過 `getPanelRenderers` 注入）。
- 進入作答區的路由路徑。

## 新增競賽類型實作清單（以 `take_home` 為例）

1. **建立模組**
   - 建立 `modules/TakeHomeModule.tsx`。
   - 實作 `ContestTypeModule` 介面，並在 `getTabs` / `getAvailablePanels` 中回傳該模式所需的清單。
2. **註冊模組**
   - 於 `modules/registry.ts` 加入 `take_home: takeHomeContestModule`。
3. **客製化介面 (若有)**
   - 實作專屬的 Admin 面板（如 `TaskEditorLayout`），並在模組的 `getPanelRenderers` 中回傳。
   - 實作專屬的作答入口路徑（如 `/take-home/upload`），並在 `getAnsweringEntryPath` 中回傳。
4. **檢查防作弊 Flag**
   - 確認前端不需要新增任何判斷，只要後端 `take_home` 模式不開啟 `cheatDetectionEnabled`，防作弊系統便會自動對其隱藏。
5. **測試補齊**
   - 在 `modules/registry.test.ts` 驗證新模組的載入與行為。
   - 在 `enterExam.usecase.test.ts` 與 `contestRoutePolicy.test.ts` 補齊動態路由驗證。

---
*附註：Admin panel 的進一步模組化（Phase 1）與 Policy/路由去耦合（Phase 2）皆已完成，系統不再需要集中式 Switch 來維護擴充。*
