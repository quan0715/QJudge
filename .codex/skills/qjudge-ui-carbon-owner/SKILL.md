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
