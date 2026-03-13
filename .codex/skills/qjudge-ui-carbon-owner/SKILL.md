---
name: qjudge-ui-carbon-owner
description: QJudge 前端 UI 全責技能（Carbon-first、Storybook/Registry、overflow 版面穩定性）。當任務涉及畫面元件、樣式、layout、stories、雙捲軸修復時使用。
---

# QJudge UI Carbon Owner

## Quick start
- 先確認需求屬於：元件/UI 行為、樣式、版面或 Storybook。
- 先讀：`references/carbon-policy.md`。
- 若是捲動/裁切問題，再讀：`references/overflow-layout-playbook.md`。
- 變更 shared/component 時同步更新 stories 與 registry。

## 責任邊界（Owner Scope）
- ✅ Carbon-first 樣式規範與 UI 實作落地。
- ✅ Storybook 撰寫規範、registry 同步策略。
- ✅ overflow / split pane / full-bleed 版面修復。
- ❌ 不定義 git/PR 流程（交給 `qjudge-github-workflow-owner`）。
- ❌ 不定義 layer/import rule（交給 `qjudge-architecture-owner`）。
- ❌ 不定義 compose 執行命令（交給 `qjudge-env-compose-owner`）。

## 核心規則
- 禁止覆蓋 `.cds--*` / `.bx--*`（除 allowlist）。
- 禁止 `!important`。
- Layout 優先 Carbon Grid/FlexGrid/Row/Column。
- 單視圖只保留一個主垂直捲動容器。

## Toolbar / Navbar 設計偏好（QJudge 預設）
- Answering toolbar 視覺語言對齊 Global Nav bar（高度、按鈕尺寸、密度一致）。
- Toolbar 背景使用 `var(--cds-background)`，避免做出明顯色塊分層；優先淡化 chrome，讓使用者聚焦題目內容。
- Action Button 預設使用 Carbon `medium`，高度與 navbar 一致（`3rem`）。
- Answering toolbar 預設不保留左右內距（移除常見 `16px` side padding），避免內容區視覺被擠壓。
- Demo 模式不顯示 toolbar 返回上一頁按鈕，只保留必要資訊（標題、狀態）。
- 監考提示採低干擾呈現：使用中性色 tag（如 `cool-gray`）與簡短文案（例如「監控中」），避免高警示色造成多餘壓力。

## 檢查命令
- 檢查樣式違規：
  - `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh`

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
