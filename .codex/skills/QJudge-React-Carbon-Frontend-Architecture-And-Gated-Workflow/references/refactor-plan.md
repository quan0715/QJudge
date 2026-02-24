# 現況導向重構計畫（建議 6 PR）

> 這份計畫已從舊的 `domains/pages -> features/screens` 搬移方案改為「維護期」版本。

1. PR: `[Gate0] Feature Spec Baseline`
   - 目標：先補齊各 feature 的狀態矩陣與欄位契約。
   - 驗收：[ ] 每個目標 screen 有 loading/empty/error/permission 定義。

2. PR: `[Gate1] Shared UI Debt Cleanup`
   - 目標：收斂重複 UI（badge/modal/empty-state）。
   - 驗收：[ ] shared/ui 組件有 stories + registry；[ ] 無 Carbon override。

3. PR: `[Gate2] Shared Layout Consistency`
   - 目標：統一 shared/layout slots 與 spacing tokens。
   - 驗收：[ ] layout 提供 loading/empty/error slots；[ ] Grid-first。

4. PR: `[Gate3] Long Screen Split`
   - 目標：拆分過長 screen（>300~400 行）為 section/components/hooks。
   - 驗收：[ ] screen 保留組裝責任；[ ] 邏輯移至 hooks/usecases。

5. PR: `[Gate4] Data Wiring Hardening`
   - 目標：整理資料接線到 `infrastructure/api/repositories`，移除 screen 內直呼 I/O。
   - 驗收：[ ] 無 screen 直呼 fetch/axios；[ ] error/loading handling 一致。

6. PR: `[Gate4] Boundary & CI Enforcement`
   - 目標：把 naming/architecture lint 納入 PR gate。
   - 驗收：[ ] lint-naming / lint-architecture 在 CI 必跑；[ ] 失敗即阻擋合併。
