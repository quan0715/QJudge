---
name: qjudge-ui-carbon-owner
description: Use when implementing or reviewing QJudge frontend components, Carbon React usage, styling, layout, Storybook stories, accessibility, or overflow behavior.
---

# QJudge UI Carbon Owner

## Quick start
- 先確認需求屬於：元件/UI 行為、樣式、版面或 Storybook。
- 先讀：`references/carbon-policy.md`。
- Carbon component、icon、Charts 或 Labs API 不確定時，套用 `carbon-builder` 的 MCP Discover → Canonicalize → Target 流程；QJudge 專案規則仍以本 skill 為準。
- 若是捲動/裁切問題，再讀：`references/overflow-layout-playbook.md`。
- 共用元件的變更若適合獨立展示，再更新 colocated stories；`.storybook/main.ts` 會自動探索，沒有 manual registry。
- API 有疑問時先查已安裝版本的型別與原始碼，再按需查 Carbon MCP 或官方文件。MCP 不可用不應阻擋已有本地依據的工作。

## 責任邊界（Owner Scope）
- ✅ Carbon-first 樣式規範與 UI 實作落地。
- ✅ Storybook 撰寫規範與自動探索契約。
- ✅ overflow / split pane / full-bleed 版面修復。
- ❌ 不定義 git/PR 流程（交給 `qjudge-github-workflow-owner`）。
- ❌ 不定義 layer/import rule（交給 `qjudge-architecture-owner`）。
- ❌ 不定義 compose 執行命令（交給 `qjudge-env-compose-owner`）。

## 核心規則
- 禁止新增或依賴 `.cds--*` / `.bx--*` internal selector；只使用 Carbon public API、app-owned class 與 token。
- 禁止 `!important`。
- React SCSS 禁止 `var(--cds-spacing-*)`：Carbon React 不會輸出這組 runtime custom properties，瀏覽器會直接丟棄整條 spacing declaration。使用 `@use "@carbon/layout";` 與 `layout.$spacing-*`；plain CSS 則使用 canonical rem value 或遷移成 SCSS。
- Layout 優先 Carbon `Grid` / `Column` 與 2x Grid 節奏。
- 避免同一內容出現多餘的父子捲軸；split pane、編輯器與長列表可各自捲動，重點是內容可達與焦點不被裁切。
- 操作回饋（成功/失敗）優先使用 `useToast`；避免在內容區堆疊 `InlineNotification`。
- 原生 `<button>` / `<input>` / `<select>` / `<textarea>` 原則上改用 Carbon；`shared/copilot` package boundary、file input、editor/canvas 等例外仍須具備完整 HTML semantics 與 accessible name。

## Toolbar / Navbar
- 延續所在頁面的密度與視覺層級。按鈕大小、內距與背景依用途選擇，不以檔名或固定高度限制所有 toolbar。
- 操作目標應容易點選、鍵盤可達；狀態提示依嚴重程度使用適當語意與顏色。

## 檢查命令
- 全量稽核（列出 blocker、review、exception-review）：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/audit-carbon-practices.js --root frontend/src`
- staged hard gate：
  - `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --staged`
- 全量 strict gate：
  - `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all`
- spacing token 自動修復（先 dry-run，再寫入）：
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/fix-carbon-spacing-tokens.js --root frontend/src`
  - `node .codex/skills/qjudge-quality-gates-owner/scripts/fix-carbon-spacing-tokens.js --root frontend/src --write`

## 參考文件
- Carbon 規範：`references/carbon-policy.md`
- Storybook：`references/storybook.md`
- Overflow 修復：`references/overflow-layout-playbook.md`

## Cross-skill handoff
- 若 UI 任務牽涉路徑歸屬/層級邊界，先走 `qjudge-architecture-owner`。
- 若需要 PR/release 決策，轉交 `qjudge-github-workflow-owner`。

## Portable notes
- 可移植核心：Design-system-first、單 scroll owner、stories 與元件同演進。
- 若換 design system，只替換 token/class 禁止策略與 Storybook discovery 設定。
