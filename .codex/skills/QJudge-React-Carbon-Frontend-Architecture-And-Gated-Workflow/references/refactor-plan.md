# 漸進式重構計畫（8~12 PR）

1. PR: `[Gate1][shared-ui] Consolidate Badges & StatusBadge`
   - 目標：止血，統一狀態標籤。
   - 搬移：`ui/components/badges/*` ➜ `src/shared/ui/status-badge/`;移除重複色碼，改用 Carbon tokens。
   - 驗收：[ ] Registry 登記 StatusBadge；[ ] 不覆蓋 Carbon；[ ] 列表頁示例接線 mock。
   - 風險/回退：若顏色不符可回退到原 badges，保留舊檔 1 版 tag。
2. PR: `[Gate1][shared-ui] ConfirmModal Standardization`
   - 目標：止血，統一確認對話框。
   - 搬移：`ui/components/ConfirmModal.tsx` ➜ `src/shared/ui/confirm-modal/`;抽出按鈕配置。
   - 驗收：[ ] Registry 更新；[ ] props 與 core types 對齊；[ ] Story 覆蓋三態。
   - 風險/回退：保留舊 modal 一版以路由 flag 切換。
3. PR: `[Gate1][shared-ui] StickyTabs Extraction`
   - 目標：收斂滾動分頁。
   - 搬移：`ui/components/StickyTabs.tsx` ➜ `src/shared/ui/sticky-tabs/`，滾動邏輯改 hook。
   - 驗收：[ ] Registry 更新；[ ] 無 `position:fixed` 覆蓋；[ ] 示範頁面用 mock。
   - 風險/回退：若滾動抖動，可 fallback 原實作保留。
4. PR: `[Gate2][shared-layout] MainLayout / ContentPage / PageHeader`
   - 目標：收斂版型骨架。
   - 搬移：`ui/layout/*`、`layouts/*`、`ui/components/layout/*` ➜ `src/shared/layout/`，改 Carbon Grid。
   - 驗收：[ ] Loading/Empty/Error slot；[ ] 無自定義 spacing；[ ] sample page 使用新 layout。
   - 風險/回退：保留舊 layout 1 版，以環境變數切換。
5. PR: `[Gate0] Page Spec Normalization`
   - 目標：列出現有 pages 狀態/欄位/路由。
   - 搬移：整理 `app/pages/*` 與 `domains/*/pages/*` Spec 文檔。
   - 驗收：[ ] 每頁有 loading/empty/error/permission 定義；[ ] 對應 feature 目錄規劃。
   - 風險/回退：純文檔，無回退風險。
6. PR: `[Gate3] Contest Screens to features/contest`
   - 目標：搬位址，保持行為，使用 shared layout/ui。
   - 搬移：`domains/contest/pages/*` ➜ `src/features/contest/screens/*`；components/hooks 同步搬。
   - 驗收：[ ] 路由 entry 指向新 screen；[ ] 使用 shared layout/ui；[ ] import 邊界過關。
   - 風險/回退：保留舊路由 alias，快速回退。
7. PR: `[Gate3] Problem Screens to features/problem`
   - 目標：同上，專注 problem domain。
   - 搬移：`domains/problem/pages/*` ➜ `src/features/problem/screens/*`；相關 components。
   - 驗收：[ ] 狀態齊全；[ ] 無 CSS override；[ ] mock data 驗證。
   - 風險/回退：路由 alias。
8. PR: `[Gate3] Submission Screens to features/submission`
   - 目標：搬位址並使用 StatusBadge。
   - 搬移：`domains/submission/pages/*` ➜ `src/features/submission/screens/*`；替換 badges 為 shared。
   - 驗收：[ ] import 邊界符合；[ ] Registry references 更新；[ ] 測試 mock 走通。
   - 風險/回退：保留舊頁面以 feature flag 切換。
9. PR: `[Gate4] Contest Hooks & Services Wiring`
   - 目標：把 contest screen 接 services。
   - 搬移：`domains/contest/*` 服務呼叫整理到 `src/features/contest/hooks/`，改用 `src/services/contest`.
   - 驗收：[ ] API 僅透過 services；[ ] 狀態管理符合 Gate0；[ ] 無新增 CSS。
   - 風險/回退：保留 mock toggle。
10. PR: `[Gate4] Problem/Submission Hooks & Services Wiring`
    - 目標：完成剩餘 domain API 接線。
    - 搬移：`domains/problem|submission` hooks 進 `src/features/.../hooks`，對應 services。
    - 驗收：[ ] 無直呼 axios；[ ] 錯誤處理一致；[ ] 無 layout 改動。
    - 風險/回退：mock toggle。
11. PR: `[Gate2] Shared Layout Polish`
    - 目標：針對尚未涵蓋的 layout（例如 Dashboard skeleton）。
    - 搬移：`app/pages/DashboardPage` 相關骨架抽為 shared layout。
    - 驗收：[ ] Grid-first；[ ] Registry 可選更新；[ ] 無 Carbon override。
    - 風險/回退：保留舊骨架。
12. PR: `[Gate1] Error/Empty Skeleton Kit`
    - 目標：收斂空/錯狀態展示。
    - 搬移：從各頁抽出空/錯狀態成 `src/shared/ui/empty-state`、`error-state`。
    - 驗收：[ ] Registry 更新；[ ] Carbon Notification/Illustration 統一；[ ] 無 !important。
    - 風險/回退：保留舊空狀態資產。
