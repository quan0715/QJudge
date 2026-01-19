# 架構與 Import Boundaries

## Canonical 目錄責任（目標結構）
- `src/app/`：應用啟動、Provider、ErrorBoundary、主題設定。（路由定義已移至 `App.tsx` + feature routes）
- `src/features/<feature>/`：以 domain 為單位；包含：
  - `routes.tsx`：**路由定義**，匯出給 `App.tsx` 使用
  - `index.ts`：統一匯出 routes、screens、components、hooks
  - `screens/`：畫面元件（取代舊版 pages）
  - `components/`：feature 專屬元件
  - `hooks/`、`contexts/`：feature 專屬邏輯
- `src/shared/ui/`：跨域的純 UI 小元件，無資料存取，無路由，Gate 1。
- `src/shared/layout/`：跨域的版型骨架（Grid/Row/Column/FlexGrid），Gate 2。
- `src/services/`：API client、SDK wrapper、HTTP 層，不依賴 React，允許用 core types。
- `src/core/`：entities/mappers/config/constants，不依賴 React/shared/features。
- `src/styles/`：全域樣式；唯一允許的 Carbon override 檔案 `styles/carbon-overrides.scss`，需註記原因。
- `public/`：靜態資產。

## Feature 路由模組化規範

### 目錄結構範例
```
src/features/problem/
├── index.ts           # 統一匯出
├── routes.tsx         # 路由定義
├── screens/
│   ├── ProblemListScreen.tsx
│   └── ProblemDetailScreen.tsx
├── components/
└── hooks/
```

### 命名規範
| 類型 | 命名 | 範例 |
|------|------|------|
| 路由檔案 | `routes.tsx` | `features/problem/routes.tsx` |
| 單一路由匯出 | `xxxRoute` | `dashboardRoute`, `oauthCallbackRoute` |
| 多路由群組匯出 | `xxxRoutes` | `guestRoutes`, `problemRoutes` |
| 畫面元件 | `XxxScreen.tsx` | `ProblemListScreen.tsx`（非 Page） |

### routes.tsx 範例
```tsx
import { Route } from "react-router-dom";
import ProblemListScreen from "./screens/ProblemListScreen";
import ProblemDetailScreen from "./screens/ProblemDetailScreen";
import ProblemLayout from "@/domains/problem/components/layout/ProblemLayout";

export const problemRoutes = (
  <Route path="/problems" element={<ProblemListScreen />} />
);

export const problemDetailRoutes = (
  <Route path="/problems/:id" element={<ProblemLayout />}>
    <Route index element={<ProblemDetailScreen />} />
  </Route>
);
```

### index.ts 範例
```tsx
// Routes
export { problemRoutes, problemDetailRoutes } from "./routes";

// Screens
export { default as ProblemListScreen } from "./screens/ProblemListScreen";
export { default as ProblemDetailScreen } from "./screens/ProblemDetailScreen";

// Components & Hooks
export * from "./components";
export * from "./hooks";
```

### App.tsx 使用方式
```tsx
import { problemRoutes, problemDetailRoutes } from "@/features/problem";

// 在 Routes 內使用
<Route element={<RequireAuth />}>
  <Route element={<MainLayout />}>
    {problemRoutes}
  </Route>
  {problemDetailRoutes}
</Route>
```

### Screen vs Page 規範
- **Screen**：使用 `XxxScreen.tsx` 命名，置於 `features/<domain>/screens/`
- **Page**：已棄用，不再新建 `pages/` 目錄
- **理由**：Screen 直接對應路由，減少不必要的 wrapper 層

## 現況 ➜ 目標對照與搬移策略
- **Pages ➜ Screens**：
  - `domains/*/pages/*Page.tsx` ➜ `src/features/<domain>/screens/*Screen.tsx`（重新命名）
  - `app/pages/*` ➜ `src/features/app/screens/`
  - 不再使用獨立的 `src/pages/` 目錄
- **Routes**：
  - 從 `App.tsx` 內嵌定義 ➜ 各 feature 的 `routes.tsx` 匯出
  - `App.tsx` 只負責組合各 feature 的路由
- Feature 資產：`domains/*/components|modals|layout` ➜ `src/features/<domain>/components|screens|hooks|contexts`。
- Shared UI：`ui/components/*`（ConfirmModal/StatusBadge/StickyTabs/GlobalHeader/UserMenu/badges/editor/...） ➜ `src/shared/ui/`；僅保留無資料依賴的可重用元件。
- Shared Layout：`ui/layout/*`、根目錄 `layouts/*`、`ui/components/layout/*` ➜ `src/shared/layout/`（MainLayout/ContentPage/PageHeader 等）。
- Services：`services/*` 已 OK，對應搬到 `src/services/`，import 改用 core types。
- Core：`core/entities|mappers|config` 已 OK，搬到 `src/core/`，保持無 React 依賴。
- Styles：`styles/*` ➜ `src/styles/`；`carbon-overrides.scss` 僅保留經過 allowlist 與註記原因的條目。

## Import Boundaries（依賴方向）
- 允許：pages ➜ features/shared/app/core/services/styles。
- 允許：features ➜ shared/core/services/styles。
- 允許：shared/ui|layout ➜ core（types/常數），可引用 styles，但不得依賴 features。
- 禁止：shared ➜ features；shared ➜ services（除純 type）。
- 禁止：core ➜ React/shared/features/services；core 僅純 TS。
- 禁止：services ➜ React/shared/features；允許用 core types。
- 任何違反邊界的 import 必須在 PR 說明並拆解。
