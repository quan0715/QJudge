# Gated Workflow（Gate 0~4）

- Gate 僅能在對應範圍作業；缺依賴時回前一 Gate 補齊。
- 任何跨 Gate 前，必須取得使用者明確同意。

## Gate 0：Spec & States
- Inputs：需求、業務流程、資料欄位、狀態定義（loading/empty/error/permission/normal）。
- Outputs：Spec、狀態圖、欄位 keys、API 合約草稿。
- Rules：不寫程式，只產出文檔或 task。
- DoD：
  - [ ] 狀態列表完整（含空/錯/權限）
  - [ ] 欄位 keys 與 core entity 對齊
  - [ ] API 介面草稿完成
  - [ ] Gate 1/2 元件清單完成

## Gate 1：shared/ui
- Outputs：`src/shared/ui/*` 可重用元件。
- Rules：不得呼叫 infrastructure/repository；不得依賴 feature context；不得改 layout。
- DoD：
  - [ ] `.stories.tsx` 已建立/更新
  - [ ] `features/storybook/registry/index.ts` 已註冊
  - [ ] props 與 core types 對齊
  - [ ] 無 Carbon override / `!important`

## Gate 2：shared/layout
- Outputs：`src/shared/layout/*` 骨架（Grid/Row/Column/FlexGrid）。
- Rules：不得串資料；不得放業務邏輯；只做 layout composition。
- DoD：
  - [ ] 支援 loading/empty/error slots
  - [ ] 無固定尺寸覆蓋 Carbon
  - [ ] 至少一個 shared/ui 組裝示例

## Gate 3：features/*/screens
- Outputs：`src/features/<domain>/screens/*`（mock/fixtures）。
- Rules：不得呼叫真實 API（僅 mock/fixtures）；不得改 shared 結構；遵守邊界。
- DoD：
  - [ ] 狀態完整（loading/empty/error/permission）
  - [ ] 使用 shared/layout + shared/ui
  - [ ] import 邊界通過

## Gate 4：features/*/hooks + infrastructure 接線
- Outputs：hooks、data mapping、repository 呼叫接到 screen。
- Rules：不改 shared/ui|layout 結構；不新增 CSS；API 呼叫透過 `infrastructure/api/repositories`。
- DoD：
  - [ ] 無直呼 `fetch/axios` 於 screen
  - [ ] side-effect 置於 hook/usecase
  - [ ] 狀態處理對齊 Gate 0
  - [ ] architecture / naming lint 通過
