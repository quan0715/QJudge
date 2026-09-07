# QJudge 專案代理指引

本文件只提供穩定的入口與責任分工。分支、PR、部署與服務狀態會變動，執行前必須讀取目前 Git／Compose 狀態，不以本文件保存歷史快照。

## Canonical skills

QJudge 維護中的技能位於 `.codex/skills/`：

- 架構、分層、import 與檔案歸屬：`qjudge-architecture-owner`
- main／dev／test Compose、migrate、測試與服務診斷：`qjudge-env-compose-owner`
- branch、commit、PR 與 dev-to-main release：`qjudge-github-workflow-owner`
- naming、architecture、exports 與 Carbon gates：`qjudge-quality-gates-owner`
- Carbon 元件、版面、Storybook 與 accessibility：`qjudge-ui-carbon-owner`
- AI model catalog：`qjudge-ai-model-registry`

`.claude/skills/` 只保留舊工具相容入口；規則若有差異，以對應的 `.codex/skills/qjudge-*-owner` 為準。`.agents/skills/` 目前沒有 QJudge 專用政策。

## 執行環境

先讀 `qjudge-env-compose-owner/references/environment-matrix.md`，並一律從 repository wrapper 選擇環境：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh <main|dev|test> <compose arguments>
```

- `dev`：互動式開發、Storybook、實際畫面檢查。
- `test`：backend、frontend、AI service 與隔離式 E2E 測試。
- `main`：只有任務明確要求 production-shaped 操作時使用。

Django、pytest、npm、Celery 等命令應以 `exec -T` 在所屬服務內執行；除非使用者明確要求 host-only 診斷，不直接在 host 執行。

## 最低 quality gates

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-repository-exports.js
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all
```

`--staged` 是本機快速檢查；CI hard gate 是 `--all`。視覺修改還要做實際 desktop／mobile rendered QA，不能只以 lint 判定完成。

## AI 助教

`ai-service/.deepagents/AGENTS.md` 定義老師端助教的角色與回覆範圍；評分、MCP 操作、CSV 與 scratch/artifact 規則由同目錄下的對應 skills 負責。

## 協作原則

- 保留使用者與其他工作中的未提交變更，不替未完成的重構更新 policy baseline。
- 先確認當前 source、runtime 與 Git 狀態，再宣稱功能、部署或 release 已完成。
- 需要跨責任域時載入多個 owner skill，不把 UI、架構、環境或 PR 規則混寫進單一相容文件。
