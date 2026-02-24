# 架構與 Import Boundaries

## Canonical 目錄責任（現況對齊）
- `src/app/`：應用啟動、Provider、ErrorBoundary、路由組裝（composition root）。
- `src/features/<feature>/`：feature 專屬路由、screen、component、hook、context。
- `src/shared/ui/`：跨 feature 可重用 UI；不得存取 API。
- `src/shared/layout/`：跨 feature 版型骨架；只做布局與 slots。
- `src/core/`：entities、ports、types、usecases、config（純業務與型別）。
- `src/infrastructure/`：HTTP client、repository 實作、DTO mapper（I/O 出入口）。
- `src/styles/`：全域樣式（Carbon override 僅 allowlist 管理）。
- `src/services/`：**legacy 相容區**（目前主要測試）；新 runtime 代碼不要再新增到此層。

## Feature 路由規範

### 目錄結構
```
src/features/problems/
├── index.ts
├── routes.tsx
├── screens/
├── components/
├── hooks/
└── contexts/
```

### 命名規範
| 類型 | 命名 | 範例 |
|------|------|------|
| 路由檔案 | `routes.tsx` | `features/problems/routes.tsx` |
| 單一路由匯出 | `xxxRoute` | `dashboardRoute` |
| 多路由匯出 | `xxxRoutes` | `problemsRoutes` |
| 畫面元件 | `XxxScreen.tsx` | `ProblemListScreen.tsx` |

### routes.tsx 範例
```tsx
import { Route } from "react-router-dom";
import ProblemListScreen from "./screens/ProblemListScreen";
import ProblemEditScreen from "./screens/problemsIdEdit/ProblemEditScreen";

export const problemsRoutes = (
  <>
    <Route path="/problems" element={<ProblemListScreen />} />
    <Route path="/problems/:id/edit" element={<ProblemEditScreen />} />
  </>
);
```

### App.tsx 組裝方式
```tsx
import { problemsRoutes } from "@/features/problems";

<Route element={<RequireAuth />}>
  <Route element={<MainLayout />}>
    {problemsRoutes}
  </Route>
</Route>
```

## Screen vs Page
- 使用 `*Screen.tsx`，置於 `features/<domain>/screens/`。
- `pages/` 是歷史命名，不再新增。

## Import Boundaries（依賴方向）
- `app -> features/shared/core/infrastructure/styles`
- `features -> shared/core/infrastructure/styles`
- `shared -> core/styles/assets/i18n`（不得依賴 features / infrastructure runtime）
- `infrastructure -> core`
- `core -> core`（純 TS，不依賴 React/UI/I/O）
- `services (legacy) -> core/infrastructure/test helpers`（不得反向依賴 app/features/shared）

## 違規處理
- 若需要跨邊界例外，必須在 PR 說明理由、範圍與回收計畫。
- 以 architecture lint 結果為 gate；未通過視為未完成。
