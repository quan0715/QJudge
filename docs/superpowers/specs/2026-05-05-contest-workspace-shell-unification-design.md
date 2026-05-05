# 競賽 Layout 統一在 WorkspaceShell 之下 設計

- 日期：2026-05-05
- 分支：dev
- 狀態：Draft（待 writing-plans）

## 目標

把目前 contest runtime 自帶的 505 行 `ContestLayout` 砍掉，所有 contest 頁面（含 runtime / 非 runtime）統一走 `MainLayout` + `WorkspaceShell`。客製化由 SideMenu / WorkspaceTopNav / UserMenu 各自的 mode-aware 邏輯處理。視覺一致、main content 為重心。

## 範圍與非範圍

**範圍**

- 移除 `ContestLayout.tsx`（與其 SCSS）
- runtime 路由（`/solve`、paper exam 答題畫面）改掛在 `MainLayout` / `WorkspaceShell` / `ContestWorkspaceLayout` 之下
- `SideMenu` 加 contest mode 分支：非 runtime 顯示「返回教室」單條目；runtime 顯示「Solve/Dashboard tabs + problem list」
- `WorkspaceTopNav` 加 runtime 鎖定：logo / 麵包屑 `pointer-events: none`，視覺保留
- `UserMenu` 在 runtime 期間 `settingsOnly={true}`
- runtime 期間透過 `useDisablePanel('right')` 關閉右側 AI chat panel
- `ExamModeWrapper` 等 runtime 限定邏輯從 `ContestLayout` 拆出，搬到一個 `RuntimeRouteWrapper`

**非範圍**

- `WorkspaceShell` 本體不動（不引入 slot system、不換位置）
- AppSidebar 不動
- precheck / admin / preview / practice / classroom 既有 layout 不動
- 不新建 `ContestShell` 元件
- 不重做右側 aside panel（先前提的「dashboard 左欄資訊塞右欄」**取消**，重心放在 main content）
- 不動 contest 路由的 URL 結構

## 現況差距

| 既有 | 缺陷 |
|---|---|
| `ContestLayout.tsx`（505 行） | 自帶 Header + sidebar + 麵包屑 + Modal，跟 WorkspaceShell 平行宇宙；視覺與行為要靠人為紀律才能跟 app 一致 |
| `routes.tsx` 雙條路由 | runtime 用 `ContestLayout`，非 runtime 用 `ContestWorkspaceLayout`；多軌維護 |
| `SideMenu` | 沒有 runtime mode 概念；無法在 contest 答題期間顯示「Solve/Dashboard tabs + problem list」 |
| `WorkspaceTopNav` | 沒有 runtime 鎖定機制 |
| 答題期間 AI chat panel | 沒有自動關閉 |

## 設計

### A. 架構：所有 contest 頁面共用 ContestWorkspaceLayout

`ContestWorkspaceLayout` 已存在且只是個透明 wrapper（提供 `ContestProvider` + outletContext）。讓 runtime 與非 runtime 共用這同一個 layout：

```
<Route element={<MainLayout />}>          // 提供 WorkspaceShell + AppSidebar + WorkspaceTopNav
  <Route element={<ContestWorkspaceLayout />}>   // 提供 ContestProvider + exam handlers
    <Route index element={<ContestDashboardScreen />} />
    <Route path="solve" element={<RuntimeRouteWrapper><ContestSolveScreen /></RuntimeRouteWrapper>} />
    <Route path="solve/:problemId" element={<RuntimeRouteWrapper><ContestSolveScreen /></RuntimeRouteWrapper>} />
    {/* 其他子頁同樣留在這裡 */}
  </Route>
</Route>
```

`ContestLayout.tsx` 整檔刪除。其內既有功能拆解到：
- 權限 / refresh / score / 麵包屑顯示 → 已存在於 `WorkspaceTopNav` / `useContestLayoutState`
- ExamModeWrapper / ExamSubmissionProgressModal / ExamModeMonitorModal / 計時 / handleStartExam 等 → 搬到下方 §B 的 `RuntimeRouteWrapper`
- contestShell sidebar（既有的 Solve/Dashboard nav + Home/List icon）→ 搬到 SideMenu 的 runtime mode（§C）
- ExamStatusBadge / 計時顯示 → 搬到 WorkspaceTopNav 的 runtime extension（§D）

### B. `RuntimeRouteWrapper`

新增一個 wrapper，包住每個 runtime route element，負責：

- 渲染 `<ExamModeWrapper>`（既有，保留 cheat detection / fullscreen / 監考行為）
- 把 `ExamSubmissionProgressModal` / `ExamModeMonitorModal` mount 在這裡
- 透過 `useDisablePanel('right')` 關閉右側 AI chat panel
- 提供 runtime context（見 §F）讓 SideMenu / TopNav 知道「現在是 runtime」

```tsx
// frontend/src/features/contest/components/layout/RuntimeRouteWrapper.tsx
export const RuntimeRouteWrapper = ({ children }: { children: ReactNode }) => {
  const { contest, contestId, hasEnded, isAdmin, refreshContest } = useContestLayoutState();
  // useDisablePanel('right') already exists; 這個 hook 確保 runtime 期間右側 chat 關閉
  useDisablePanel('right');

  const examActions = useContestExamActions({ /* ... */ });
  const submissionProgress = examActions.submissionProgress;

  return (
    <ContestRuntimeProvider value={{ isRuntime: true, ...examActions }}>
      <ExamModeWrapper {...examModeProps}>
        {children}
      </ExamModeWrapper>
      <ExamSubmissionProgressModal state={submissionProgress.state} onRequestClose={submissionProgress.close} />
      <ExamModeMonitorModal /* ... */ />
    </ContestRuntimeProvider>
  );
};
```

### C. `SideMenu` 加 contest mode 分支

`SideMenu` 已是 561 行 context-aware menu，依 URL 與角色決定顯示什麼。新增兩個 contest mode：

```ts
// 偵測階段（在既有 contest path 判定下加細分）
const inContestPath = /^\/classrooms\/[^/]+\/contest\/[^/]+/.test(pathname);
const inAdminPath = /^\/classrooms\/[^/]+\/contest\/[^/]+\/admin/.test(pathname);
const { isRuntime } = useContestRuntimeMode();
const inContestIdle = inContestPath && !inAdminPath && !isRuntime;
```

**非 runtime contest mode**（`inContestPath && !isRuntime && 不在 admin path`）

```
返回教室                    → /classrooms/:classroomId
競賽主頁（current page）
```

不顯示 dashboard / 教室列表 / 提交 / chat 等其他 app-level 條目（聚焦 contest）。

**Runtime contest mode**（`isRuntime`）

```
┌──────────────────┐
│ [Solve|Dashboard]│   tab toggle（Carbon ContentSwitcher 樣式）
├──────────────────┤
│ 題目列表：        │
│  P1 ✓ Hello      │
│  P2 ● A+B   ← active │
│  P3 ○ Factorial  │
└──────────────────┘
```

- Solve tab active：當前在 `/solve`；點 Dashboard tab → navigate 到 contest dashboard URL，SideMenu 自動切回「非 runtime contest mode」
- 題目列表來自 `useContest()`（既有 ContestProvider）；每題 status icon：
  - ✓ = 已完整作答（依現有 status 判斷邏輯）
  - ● = 部分作答 / 進行中
  - ○ = 未作答

不顯示「返回教室」（runtime 不允許離開）。

> 抽出 `<SideMenuContestRuntimeSection />` 與 `<SideMenuContestIdleSection />` 作為 SideMenu 內部子元件，避免 SideMenu 主檔再膨脹。

### D. `WorkspaceTopNav` 加 runtime 鎖定

加入一個 prop 或 context 偵測：

```tsx
const { isRuntime } = useContestRuntimeMode();
```

當 `isRuntime` 為 true：

- Logo / 麵包屑 hyperlink 加 `aria-disabled` + `pointer-events: none`，視覺保留但不可點擊
- 顯示新增資訊：ExamStatusBadge（從 ContestLayout 搬出）+ 倒數計時 TimeDisplay（既有）
- 既有的「avatar / 教室 / contest」麵包屑邏輯不變（已支援）

### E. `UserMenu` settingsOnly

`UserMenu` 已支援 `settingsOnly` prop（既有 `lockContestMenu` 邏輯透過 ContestLayout 傳入）。改為從 context 讀：

```tsx
const { isRuntime } = useContestRuntimeMode();
return <UserMenu settingsOnly={isRuntime} ... />;
```

讓任何掛在 WorkspaceShell 下的 page 都能正確啟用該行為。

### F. Runtime 偵測機制

新增 `useContestRuntimeMode` hook 與 context，集中判定：

```ts
// frontend/src/features/contest/hooks/useContestRuntimeMode.ts
import { useLocation } from 'react-router-dom';

export const useContestRuntimeMode = () => {
  const { pathname } = useLocation();
  const isRuntime = /^\/classrooms\/[^/]+\/contest\/[^/]+\/solve(?:\/|$)/.test(pathname);
  return { isRuntime };
};
```

> 既有 `useContestLayoutState` 的 `isSolvePage` / `isPaperExamPage` 判斷依賴 contest type，繼續供需要區分 coding vs paper 的場景使用；本 hook 只暴露 navbar / sidemenu 需要的單一 boolean。

`SideMenu` / `WorkspaceTopNav` / `UserMenu` 直接呼叫此 hook 即可，不依賴 prop 傳遞。

> 若有 cheat-detection-active 等更細的 runtime 子狀態（例：考試已開始但未進入 solve 路徑），由 `RuntimeRouteWrapper` 提供的 `ContestRuntimeContext` 補充表達；本次不擴張此狀態空間，先以 URL 為準。

### G. 路由調整（`routes.tsx`）

```diff
- export const classroomContestDetailRoutes = (
-   <Route path="/classrooms/:classroomId/contest/:contestId" element={<ContestWorkspaceLayout />}>
-     <Route index element={<ContestDashboardScreen />} />
-   </Route>
- );
- export const classroomContestRuntimeRoutes = (
-   <Route path="/classrooms/:classroomId/contest/:contestId" element={<ContestLayout />}>
-     <Route path="solve" element={<ContestSolveScreen />} />
-     <Route path="solve/:problemId" element={<ContestSolveScreen />} />
-   </Route>
- );

+ export const classroomContestRoutes = (
+   <Route path="/classrooms/:classroomId/contest/:contestId" element={<ContestWorkspaceLayout />}>
+     <Route index element={<ContestDashboardScreen />} />
+     <Route
+       path="solve"
+       element={<RuntimeRouteWrapper><ContestSolveScreen /></RuntimeRouteWrapper>}
+     />
+     <Route
+       path="solve/:problemId"
+       element={<RuntimeRouteWrapper><ContestSolveScreen /></RuntimeRouteWrapper>}
+     />
+   </Route>
+ );
```

`App.tsx` 對應：把 `classroomContestRoutes` 整段放進 `<Route element={<MainLayout />}>` 區塊；移除原先 `classroomContestRuntimeRoutes` 的 import 與使用。

precheck / admin / preview / practice 路由不動。

## 元件結構

```
frontend/src/features/contest/components/layout/
  ContestWorkspaceLayout.tsx         # 既有，保留作 ContestProvider wrapper
  RuntimeRouteWrapper.tsx            # NEW：runtime route 共用 wrapper
  ContestLayoutHeaderSlotContext.tsx # 既有，保留供 page 自行 inject header actions

frontend/src/features/contest/hooks/
  useContestRuntimeMode.ts           # NEW：URL-based runtime 偵測

frontend/src/features/contest/contexts/
  ContestRuntimeContext.tsx          # NEW：runtime route 提供 examActions / submissionProgress 等

frontend/src/features/app/components/
  SideMenu.tsx                       # 修改：加 contest idle / runtime branch
  workspace/WorkspaceTopNav.tsx      # 修改：runtime 鎖定 + ExamStatusBadge / 倒數
  GlobalHeader.tsx                   # 若 UserMenu 由此渲染，改為讀 useContestRuntimeMode
```

刪除：
- `frontend/src/features/contest/components/layout/ContestLayout.tsx`
- `frontend/src/features/contest/components/layout/ContestLayout.module.scss`

## 資料流

```
URL change
   │
   ▼
useContestRuntimeMode()  ──→  isRuntime
   │
   ├─→ SideMenu                 (idle: 返回教室 / runtime: tabs+題目)
   ├─→ WorkspaceTopNav          (runtime: logo/breadcrumb disabled, ExamStatus shown)
   ├─→ UserMenu                 (runtime: settingsOnly)
   └─→ RuntimeRouteWrapper      (掛在 runtime route 上，啟動 ExamModeWrapper / 關閉 chat panel / mount runtime modals)
```

## 錯誤處理

- runtime 期間使用者試圖直接 navigate 到 app-level URL（透過瀏覽器位址列等）：由 `ExamModeWrapper` 既有的 fullscreen lock / cheat detection 處理；不另外做 SPA 攔截
- `useDisablePanel('right')` 期間使用者試圖打開 chat：依現有 useDisablePanel 行為（按鈕 disable / FAB 隱藏）
- 路由切換到 runtime 時若使用者已開著 chat：依現有 `useDisablePanel` 自動關閉
- 取消遷移風險：保留 `ContestWorkspaceLayout` 的 outletContext 介面（refreshContest / onJoin / onStartExam / onEndExam / onGoToAnswering / onOpenAdminPanel / isAdmin），既有 children screens 不需大改

## 測試重點

**Frontend 單元 / 整合**

- `useContestRuntimeMode`：給 mock pathname，驗證 isRuntime / isSolve / isPaper 正確
- `SideMenu`：在 contest idle path 下渲染，DOM 上只有「返回教室」+「競賽主頁」；在 runtime path 下渲染，DOM 上有 Solve/Dashboard tab + problem list、無「返回教室」
- `WorkspaceTopNav`：runtime 時 logo / breadcrumb 有 `pointer-events: none`、ExamStatusBadge 顯示
- `UserMenu`：runtime 時菜單只剩設定 / 登出
- `RuntimeRouteWrapper`：render 時呼叫 `useDisablePanel('right')`、ExamModeWrapper 收到正確 props

**手動 E2E 驗收清單**

- [ ] 學生登入 → contest dashboard：左 sidebar 只有「返回教室 / 競賽主頁」
- [ ] 點「進入答題」進到 /solve：左 sidebar 切換為 Solve/Dashboard tabs + 題目清單
- [ ] runtime 期間點 logo / 麵包屑無反應
- [ ] runtime 期間點頭像 → menu 只有設定 / 登出
- [ ] runtime 期間 AI chat 右面板按鈕被 disable
- [ ] 點 sidebar Dashboard tab → 切回 contest dashboard URL，sidebar 自動回 idle 模式
- [ ] 答題流程結束、提交完畢 → 回到 dashboard，AI chat 右面板可開啟
- [ ] 視覺：navbar / sidebar 與其他 app 頁面視覺一致

## 影響的檔案（粗估）

**Frontend（新增）**
- `features/contest/components/layout/RuntimeRouteWrapper.tsx`
- `features/contest/hooks/useContestRuntimeMode.ts`
- `features/contest/contexts/ContestRuntimeContext.tsx`
- `features/app/components/SideMenuContestSection.tsx`（將 idle / runtime 子區塊抽出）

**Frontend（修改）**
- `features/contest/routes.tsx`（合併路由）
- `features/contest/index.ts`（exports）
- `App.tsx`（把 contest 路由放進 MainLayout）
- `features/app/components/SideMenu.tsx`（加 contest idle / runtime 分支）
- `features/app/components/workspace/WorkspaceTopNav.tsx`（runtime 鎖定 + ExamStatusBadge）
- `features/app/components/UserMenu.tsx`（settingsOnly 來源從 prop 改為直接呼叫 `useContestRuntimeMode`，移除外部傳入 prop 的 path）
- `features/contest/components/layout/ContestWorkspaceLayout.tsx`（補完 outletContext，補可能缺的 examActions）

**Frontend（刪除）**
- `features/contest/components/layout/ContestLayout.tsx`
- `features/contest/components/layout/ContestLayout.module.scss`

## 開放問題

無。
