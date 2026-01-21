# Gated Workflow（Gate 0~4）

- Gate 僅能在對應資料夾內作業；若缺依賴，須回前一 Gate 完成。
- 跨 Gate 前需請使用者確認（例：從 Gate 1 進 Gate 2，先詢問並等待同意）。

## Gate 0：Spec & States
- Inputs：需求、業務流程、資料欄位、狀態定義（loading/empty/error/permission/normal）。
- Outputs：文字版 Spec、狀態圖、欄位 keys、API 合約草稿。
- Rules：不寫程式、不建構 UI；只產出文檔或 issue。
- DoD：
  - [ ] 狀態列表含空/錯/權限
  - [ ] 欄位 keys 與 core entity 對齊
  - [ ] API 介面草稿完成
  - [ ] Gate 1 需要的元件清單

## Gate 1：shared/ui
- Inputs：Gate 0 的元件清單。
- Outputs：`src/shared/ui/*` 無資料依賴的可重用元件；Story/示例使用 core 假資料。
- Rules：不得呼叫 services；不得讀取 feature context；不得改 layout 結構；禁止覆蓋 Carbon class / `!important`。
- DoD：
  - [ ] Component Registry 新增/更新
  - [ ] Prop 型別與 core entity 對齊
  - [ ] 至少一個使用示例
  - [ ] 單元測試或 Story 覆蓋狀態
  - [ ] 沒有 Carbon override
  - [ ] **`.stories.tsx` 已建立**，包含：
    - [ ] `meta.argTypes` 定義所有可調整的 Props
    - [ ] Playground story（使用 Controls 面板）
    - [ ] 已在 `features/storybook/registry/index.ts` 註冊

## Gate 2：shared/layout
- Inputs：Gate 0 的頁面骨架、Grid 排版需求。
- Outputs：`src/shared/layout/*` skeleton（Grid/Row/Column/FlexGrid），可插槽 children。
- Rules：不得直接串資料；不得定義業務邏輯；僅組合 Carbon Layout；禁止覆蓋 Carbon class / `!important`。
- DoD：
  - [ ] Layout 支援 loading/empty/error slot
  - [ ] 沒有固定寬度/高度覆蓋 Carbon
  - [ ] 實際使用 shared/ui 作為子元件示例
  - [ ] Registry 不需更新（可鏈到說明）

## Gate 3：features/*/screens
- Inputs：Gate 0 Spec、Gate 1/2 可用元件。
- Outputs：`src/features/<domain>/screens/*` 組裝頁面，使用 mock data 或 fixtures。
- Rules：不得呼叫真實 services（用 mock）；不得改 shared；不得新增樣式覆蓋 Carbon；遵守 Import Boundaries。
- DoD：
  - [ ] Screen 支援 loading/empty/error/permission
  - [ ] 使用 shared/layout + shared/ui
  - [ ] 所有 import 符合邊界
  - [ ] 測試用 mock/fixtures
  - [ ] 未動到 styles/carbon-overrides.scss

## Gate 4：features/*/hooks + services 整合
- Inputs：Gate 3 screen、services/core types。
- Outputs：hooks、data mapping、service 呼叫接到 screen；僅 mapping，不改 layout 結構。
- Rules：不得改動 shared/ui|layout 結構；不得新增 CSS；若需要新增 UI，回 Gate 1；所有 API 呼叫透過 services；error/loading 狀態需對齊 Gate 0 定義。
- DoD：
  - [ ] API 呼叫經 services，無直呼 fetch/axios
  - [ ] 狀態管理符合 Spec
  - [ ] side-effect 置於 hook
  - [ ] 無新增 Carbon override
  - [ ] 端到端功能可跑（mock 或 dev API）
