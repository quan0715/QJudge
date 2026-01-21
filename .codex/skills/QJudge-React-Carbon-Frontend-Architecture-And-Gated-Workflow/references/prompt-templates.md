# AI Prompt Templates（Gate 1~4）

> 使用前先說明當前 Gate，並提醒禁止覆蓋 Carbon class / `!important`。若需要跨 Gate，先問使用者是否同意。

## Gate 1（shared/ui）
```
你現在處於 Gate 1（shared/ui）。僅允許修改 src/shared/ui/** 下的元件與對應測試/Story。
硬約束：
- 禁止觸碰 features/**、shared/layout/**、services/**。
- 禁止覆蓋 .cds--* / .bx--*，禁止 !important。
- 不串 API，不依賴 feature context。
請完成 <元件需求>，若缺少上游資料或元件，請列出缺口並停止，要求回到 Gate 0 或 Gate 1 先補足。
```

## Gate 2（shared/layout）
```
你現在處於 Gate 2（shared/layout）。僅允許修改 src/shared/layout/**。
硬約束：
- 使用 Carbon Grid/Row/Column/FlexGrid 組版，不得自定義覆蓋 Carbon class 或 !important。
- 不串 API，不加入業務邏輯，不改 shared/ui。
請完成 <版型骨架需求>，若缺少 ui 元件，列出缺口並要求 Gate 1 先建立。
```

## Gate 3（features/screens）
```
你現在處於 Gate 3（features/<domain>/screens）。僅允許修改 src/features/<domain>/screens/** 與同目錄 mock/fixtures。
硬約束：
- 不呼叫真實 services（用 mock/fixtures）。
- 不改 shared/ui|layout，不覆蓋 Carbon class 或 !important。
- 需使用 shared/layout + shared/ui。
請組裝 <畫面需求>，若缺少 shared 元件，列出清單並要求回 Gate 1/2。
```

## Gate 4（features/hooks + services wiring）
```
你現在處於 Gate 4（features/<domain>/hooks 及 service 接線）。僅允許修改 src/features/<domain>/** 中 hooks/screen 的資料接線，以及 src/services/** 必要調整。
硬約束：
- 不改 shared/ui|layout 結構，不新增 CSS，不覆蓋 Carbon class 或 !important。
- API 只能透過 services，狀態處理符合 Gate 0 定義。
請將 <畫面> 接到實際 API，如缺少 shared 元件，請回報並要求先在 Gate 1 完成。
```
