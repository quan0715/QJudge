# Contest 頁面擴充架構指南（前端）

> 文件狀態：2026-03-04  
> 適用範圍：`frontend/src/features/contest`

## 目標

本文件整理目前 Contest 前端架構，並提供未來新增競賽類型（例如 `take_home`）時的最小改動路徑，避免把共用邏輯分散到多處。

## 目前架構（已落地）

### 1) 共用規則層（Domain Policy）

- `contestRuntimePolicy.ts`
  - 決定是否可看題目、是否顯示 submissions/standings、是否可從 dashboard 進入 paper answering。
- `contestRoutePolicy.ts`
  - 決定 precheck、answering 入口、submit review 返回路徑、路徑是否仍在 contest 範圍內。

這兩層應保持「競賽共用規則」為主，不放 UI 細節。

### 2) 競賽類型模組層（Contest Type Module）

- `modules/types.ts`
  - 定義 `ContestTypeModule` 契約（student/admin 兩側）。
- `modules/registry.ts`
  - `contestType -> module` 的唯一註冊點。
- `modules/coding.module.ts`
- `modules/paperExam.module.ts`

模組責任：

- Student：
  - 決定可用 tab（`getTabs`）
  - 決定作答入口（`getAnsweringEntryPath`）
- Admin：
  - 決定可用 panel（`getAvailablePanels`）
  - 決定編輯器種類（`editorKind`）
  - 決定匯出選項（`getExportTargets`）
  - 決定 JSON 匯入動作顯示時機（`shouldShowJsonActions`）

### 3) Student Tab 渲染層（同 tab key 可不同內容）

- `modules/types.ts`
  - `ContestStudentTabDefinition` 含 `contentKind`
- `modules/StudentTabRendererRegistry.tsx`
  - `contentKind -> renderer` 預設映射
  - 支援 module override（`getTabRenderers`）
- `screens/ContestDashboardScreen.tsx`
  - 只負責拿 module、拿 tab、呼叫 renderer，不再 hardcode 各 tab 內容 switch。

這是目前「同樣是 `problems` tab，coding/paper 顯示不同內容」的核心機制。

### 4) Admin Panel 分流層

- `screens/admin/AdminDashboardScreen.tsx`
  - 透過 `contestModule.admin.editorKind` 在 `problem_editor` panel 渲染：
    - `CodingTestEditorLayout`
    - `ExamEditorLayout`
  - panel 可見性與 full-bleed 行為也由 module 提供。

## 擴充原則（必須遵守）

### A. 應共用，不應按競賽類型重複實作

- Precheck gate 與作弊監控入口策略
- Contest 內路由白名單與返回路徑策略
- dashboard tab/panel 骨架容器

### B. 應由競賽模組決定（可因類型不同）

- 有哪些 tab / panel
- 同 tab key 的實際內容 renderer
- 題目編輯器 UI 與資料流
- 匯出格式選項
- 學生作答報告內容欄位

## 新增競賽類型實作清單（MVP）

以下以「新增 `take_home`」為例，僅示意流程，不代表已實作：

1. 新增 module
- 建立 `modules/takeHome.module.ts`
- 實作 `ContestTypeModule`（student/admin 全部回傳值）

2. 註冊 module
- 在 `modules/registry.ts` 加入 `take_home` 對應

3. Student tabs 定義
- 在 module 的 `getTabs` 回傳 `ContestStudentTabDefinition[]`
- 選擇要共用的 `contentKind`（例如 `overview`, `clarifications`）
- 若需要新內容型別，先擴充 `ContestStudentTabContentKind`

4. Student renderer 接線
- 若新 `contentKind` 可共用，補到 `StudentTabRendererRegistry.tsx` 預設映射
- 若僅特定類型客製，透過 module 的 `getTabRenderers` 覆寫

5. Admin 行為定義
- 決定 `editorKind`（沿用 coding/paper 或新增）
- 決定 `getAvailablePanels` 與 `getExportTargets`
- 若 panel 同 key 不同內容，維持在 `AdminDashboardScreen` 由 module 決策渲染

6. Route/Runtime policy 檢視
- 檢查 `contestRuntimePolicy.ts` 是否要加新類型規則
- 檢查 `contestRoutePolicy.ts` 的 precheck/answering flow 是否需分支

7. 測試補齊
- `modules/registry.test.ts`：新類型可解析、tabs/panels 正確
- `ContestDashboardScreen`：tab 渲染正確
- `contestRoutePolicy.test.ts`：路由策略與 gate 正確

## Admin 新增 panel（例如「解題分析」）建議

場景：`coding` 和 `paper_exam` 都有 `analytics` panel，但內容不同，第三類型不需要。

建議做法：

1. 先在 `AdminPanelId` 加入 `analytics`
2. 由各 module 的 `getAvailablePanels` 決定是否顯示
3. 在 `AdminDashboardScreen` 的 panel render 區，按 `contestType module` 決定內容元件
4. 若後續分支增多，再抽 `AdminPanelRendererRegistry`（與 Student tab renderer 同 pattern）

## 已知後續可再收斂項目

- 將 Admin panel 的渲染 switch 進一步 registry 化（減少集中式 switch 膨脹）
- Anti-cheat 與 precheck 狀態機明確抽成單一 source（避免平行實作）
- 針對大型面板做 lazy load，降低 dashboard 首屏 bundle

## 變更前自我檢查（每次擴充都跑）

- `node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-naming.js --root frontend/src`
- `node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-architecture.js --root frontend/src`
- `cd frontend && npm run build`
- contest 相關測試（至少 registry + route policy + tab/panel rendering）
