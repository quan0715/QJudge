---
name: qjudge-env-compose-owner
description: QJudge 環境全責技能（main/dev/test Docker Compose）。當任務涉及 migrate、pytest、npm、manage.py、celery、容器除錯時使用。強制 exec-first。
---

# QJudge Env Compose Owner

## Quick start
- 先選環境：`main | dev | test`。
- 一律用：`.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh <env> ...`（容器內執行優先）。
- 先 `up -d --build`，再 `exec -T <service> <cmd...>`。

## 責任邊界（Owner Scope）
- ✅ compose file 選擇、service 名稱、exec-first 命令標準。
- ✅ backend/frontend 測試與 migrate 的容器內執行流程。
- ✅ logs/ps/health 檢查與容器除錯。
- ❌ 不定義 architecture 規則（交給 `qjudge-architecture-owner`）。
- ❌ 不定義 PR 策略（交給 `qjudge-github-workflow-owner`）。

## 核心規則
- backend 命令（`manage.py`/`pytest`）在 backend 容器執行。
- frontend 命令（`npm run`）優先在 frontend 容器執行。
- 非使用者明確要求，不在 host 直接跑專案腳本。

## 參考文件
- 環境矩陣：`references/environment-matrix.md`
- 腳本：`.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh`

## Portable notes
- 可移植核心：env selector + compose wrapper + exec-first discipline。
- 換專案時僅需更新 compose file 對照與 service map。
