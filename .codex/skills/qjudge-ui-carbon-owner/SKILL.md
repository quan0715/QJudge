---
name: qjudge-ui-carbon-owner
description: Use when implementing or reviewing QJudge frontend components, Carbon React usage, styling, layout, Storybook stories, accessibility, or overflow behavior.
metadata:
  version: "2026.08.12"
  carbon_mcp_verified: "2026-08-12"
  carbon_framework: "v11"
  carbon_reference_tag: "v11.113.0"
---

# QJudge UI Carbon Owner

## Quick start
- 先確認需求屬於：元件/UI 行為、樣式、版面或 Storybook。
- 先讀：`references/carbon-policy.md`。
- Carbon component、icon、Charts 或 Labs API 不確定時，套用 `carbon-builder` 的 MCP Discover → Canonicalize → Target 流程；QJudge 專案規則仍以本 skill 為準。
- 若是捲動/裁切問題，再讀：`references/overflow-layout-playbook.md`。
- 變更 shared/component 時同步更新 stories 與 registry。
- 若 Carbon API、variant 或 accessibility 規則可能變動，先用 IBM Carbon MCP 查 `docs_search`，再用 `code_search` 取得目前 React 範例；Carbon Charts 只用 `get_charts`。

## 責任邊界（Owner Scope）
- ✅ Carbon-first 樣式規範與 UI 實作落地。
- ✅ Storybook 撰寫規範、registry 同步策略。
- ✅ overflow / split pane / full-bleed 版面修復。
- ❌ 不定義 git/PR 流程（交給 `qjudge-github-workflow-owner`）。
- ❌ 不定義 layer/import rule（交給 `qjudge-architecture-owner`）。
- ❌ 不定義 compose 執行命令（交給 `qjudge-env-compose-owner`）。

## 核心規則
- 禁止新增或依賴 `.cds--*` / `.bx--*` internal selector；只使用 Carbon public API、app-owned class 與 token。
- 禁止 `!important`。
- Layout 優先 Carbon `Grid` / `Column` 與 2x Grid 節奏。
- 單視圖只保留一個主垂直捲動容器。
- 操作回饋（成功/失敗）優先使用 `useToast`；避免在內容區堆疊 `InlineNotification`。
- 原生 `<button>` / `<input>` / `<select>` / `<textarea>` 原則上改用 Carbon；`shared/copilot` package boundary、file input、editor/canvas 等例外仍須具備完整 HTML semantics 與 accessible name。

## Toolbar / Navbar 設計偏好（QJudge 預設）
- Answering toolbar 視覺語言對齊 Global Nav bar（高度、按鈕尺寸、密度一致）。
- Toolbar 背景使用 `var(--cds-background)`，避免做出明顯色塊分層；優先淡化 chrome，讓使用者聚焦題目內容。
- Action Button 預設使用 Carbon `medium`，高度與 navbar 一致（`3rem`）。
- Header / Navbar / Toolbar 的 action button 一律使用 default size（禁止 `size="sm"`），確保高度一致且對齊 `3rem` nav bar；若需緊湊只調整內文，不調整按鈕高度。
- Answering toolbar 預設不保留左右內距（移除常見 `16px` side padding），避免內容區視覺被擠壓。
- Demo 模式不顯示 toolbar 返回上一頁按鈕，只保留必要資訊（標題、狀態）。
- 監考提示採低干擾呈現：使用中性色 tag（如 `cool-gray`）與簡短文案（例如「監控中」），避免高警示色造成多餘壓力。

## 檢查命令
- 全量稽核（列出 blocker、review、exception-review）：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/audit-carbon-practices.js --root frontend/src`
- staged hard gate：
  - `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged`
- 全量 strict gate：
  - `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all`

## 參考文件
- Carbon 規範：`references/carbon-policy.md`
- Storybook：`references/storybook-registry.md`
- Overflow 修復：`references/overflow-layout-playbook.md`

## Cross-skill handoff
- 若 UI 任務牽涉路徑歸屬/層級邊界，先走 `qjudge-architecture-owner`。
- 若需要 PR/release 決策，轉交 `qjudge-github-workflow-owner`。

## Portable notes
- 可移植核心：Design-system-first、單 scroll owner、stories 與元件同演進。
- 若換 design system，只替換 token/class 禁止策略與 story registry 位置。
