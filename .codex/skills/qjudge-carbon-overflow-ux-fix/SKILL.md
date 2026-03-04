---
name: qjudge-carbon-overflow-ux-fix
description: 修復 QJudge（Carbon React）頁面雙捲軸與 overflow 破版的實作技能。當頁面出現兩條垂直捲軸、內容被裁切、split pane 高度鏈斷裂、header/sidenav 與內容區互相擠壓時使用。適用 admin 全頁面、editor 類三欄/雙欄布局與任何需要「單一捲動容器」的畫面。
---

# QJudge Carbon Overflow UX Fix

## Quick start
- 先讀 `references/overflow-layout-playbook.md`。
- 目標是「每個視圖只保留一個主垂直捲動容器」。
- 在 full-bleed 管理頁，優先用固定殼層（`position: fixed; inset: 0`）而不是讓 `body` 捲動。

## 必守規則
- 同一視圖不要同時讓「外層 page」與「內層 panel」都 `overflow-y: auto`。
- 所有 flex/grid 高度鏈節點都要補 `min-height: 0`（必要時 `min-width: 0`）。
- `height: 100%` 只能用在有明確高度參考的父層；否則改 `flex: 1` + `min-height: 0`。
- header/sidenav 固定時，內容區需用明確幾何（`top/left/right/bottom`）或等價 grid，避免隱性超出。
- Carbon 元件可覆寫容器 class，但不要直接覆蓋 `.cds--*` 內部行為來硬解。

## 標準流程
1. 盤點 scroll owner
- 搜尋：`rg -n "overflow-y|overflow|height:\\s*100%|min-height:\\s*0|100vh|100dvh|position:\\s*fixed" frontend/src/features/...`
- 找出哪個容器應是唯一 scroll owner（通常是 pane/list/content 之一）。

2. 建立高度鏈
- 從最外層到 scroll owner，逐層確保：
  - `display: flex | grid`
  - `min-height: 0`
  - 非 scroll owner 一律 `overflow: hidden`

3. 套用布局模式
- Full-bleed admin：固定殼層 + 內容 viewport（見 reference Pattern A）
- Split pane：左樹右內容或三欄時，只有指定 pane 可捲（見 Pattern B）

4. 收斂 panel 契約
- 每個 panel 僅二擇一：
  - 自己 `overflow-y: auto`
  - 交給下一層子容器捲
- 不接受父子都可捲。

5. 驗證
- 桌機尺寸至少驗證 `1366x768` 與 `1920x1080`。
- 檢查只有一條主捲軸、header/footer 固定可見、列表區單獨捲動。
- Light/Dark 都要看對比與裁切。
- 跑最小測試 + `npm run build`。

## 回歸檢查清單
- 視圖沒有雙垂直捲軸。
- 不會出現水平捲軸閃現。
- 切換 panel 不會殘留上一個 panel 的滾動行為。
- 手機尺寸下不破版（必要時改單欄）。

## If blocked
- 若第三方元件（圖表/編輯器）強制內部捲動，先鎖定外層不捲，僅保留其內層捲動，再依需求包一層 viewport 做裁切。
- 若需求要求「header/footer 固定 + 中段捲動」，優先拆成 `header + body + footer` 三段式，不要用單一大容器混排。
