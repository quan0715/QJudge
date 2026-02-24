# AI Prompt Templates（Gate 1~4）

> 使用前先聲明當前 Gate。跨 Gate 前先取得使用者同意。

## Gate 1（shared/ui）
```
你現在處於 Gate 1（shared/ui）。僅允許修改 src/shared/ui/** 與對應 tests/stories。
硬約束：
- 禁止觸碰 features/**、shared/layout/**、infrastructure/**。
- 禁止覆蓋 .cds--* / .bx--*，禁止 !important。
- 不串 API，不依賴 feature context。
請完成 <元件需求>；若缺少上游資訊，列出缺口並停止，要求回 Gate 0 補齊。
```

## Gate 2（shared/layout）
```
你現在處於 Gate 2（shared/layout）。僅允許修改 src/shared/layout/**。
硬約束：
- 使用 Carbon Grid/Row/Column/FlexGrid。
- 不串 API，不加入業務邏輯，不改 shared/ui。
請完成 <版型需求>；若缺 UI 元件，列出清單並要求先回 Gate 1。
```

## Gate 3（features/screens）
```
你現在處於 Gate 3（features/<domain>/screens）。僅允許修改 src/features/<domain>/screens/** 與 mock/fixtures。
硬約束：
- 不呼叫真實 API（僅 mock/fixtures）。
- 不改 shared/ui|layout 結構。
- 不覆蓋 Carbon class，不使用 !important。
請完成 <畫面需求>；若缺 shared 元件，列清單並要求回 Gate 1/2。
```

## Gate 4（features/hooks + infrastructure wiring）
```
你現在處於 Gate 4（features/<domain>/hooks + 資料接線）。
僅允許修改 src/features/<domain>/** 的 hooks/接線，與 src/infrastructure/** 必要調整。
硬約束：
- 不改 shared/ui|layout 結構，不新增 CSS。
- API 透過 infrastructure repository；screen 不得直呼 fetch/axios。
- 狀態處理需對齊 Gate 0。
請把 <畫面> 接到實際資料；若需新 UI 元件，回報並要求先回 Gate 1。
```
