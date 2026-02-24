---
name: qjudge-env-docker-compose-workflow
description: QJudge 專案的 Docker Compose 環境工作流（main/dev/test）。當任務涉及環境啟動、migrate、pytest、npm、manage.py、celery、或容器除錯時使用。強制採用 compose exec-first，優先在容器內執行命令，避免直接在 host 端跑腳本造成環境偏差。
---

# QJudge Env Docker Compose Workflow

## Quick start
- 先確認環境：`main | dev | test`。
- 使用 `scripts/qjudge-dc.sh` 執行 compose 指令，不直接在 host 執行 backend/frontend 命令。
- 先 `up -d --build`，再 `exec` 進容器跑管理命令。

## 必守規則（exec-first）
- backend 操作（`python manage.py ...`、`pytest`）一律在 backend 容器內執行。
- frontend 操作（`npm run ...`）優先在 frontend 容器內執行。
- 非使用者明確要求時，不在 host 端直接跑專案腳本。
- 使用 `docker compose -f ... exec -T ...` 做非互動命令，避免 TTY 問題。

## 標準流程
1) 選擇 compose file（main/dev/test）。
2) 啟動：`scripts/qjudge-dc.sh <env> up -d --build`。
3) 檢查：`scripts/qjudge-dc.sh <env> ps`。
4) 執行命令：`scripts/qjudge-dc.sh <env> exec -T <service> <cmd...>`。
5) 需要除錯時看 logs：`scripts/qjudge-dc.sh <env> logs -f <service>`。

## 環境對照與常用命令
- 讀 `references/environment-matrix.md` 取得 main/dev/test 的 compose file、service 名稱與常用 exec 指令。

## 腳本
- `scripts/qjudge-dc.sh`：`main/dev/test` 到 compose file 的單一入口。
  - 範例：
    - `scripts/qjudge-dc.sh dev up -d --build`
    - `scripts/qjudge-dc.sh dev exec -T backend python manage.py migrate`
    - `scripts/qjudge-dc.sh test exec -T backend-test pytest -q`

## 若任務不明確
- 先詢問使用者目標環境（main/dev/test）。
- 若未指定且是日常開發，預設用 `dev`。
