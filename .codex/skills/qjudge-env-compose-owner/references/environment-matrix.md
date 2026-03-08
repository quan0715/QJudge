# QJudge Environment Matrix (main / dev / test)

## Compose file 對照
- `main` -> `docker-compose.yml`
- `dev` -> `docker-compose.dev.yml`
- `test` -> `docker-compose.test.yml`

## 主要 service 對照

| env | backend | frontend | ai-service | postgres | redis | celery |
| --- | --- | --- | --- | --- | --- | --- |
| main | `backend` | `frontend` | `ai-service` | `postgres` | `redis` | `celery` / `celery-high` / `celery-beat` |
| dev | `backend` | `frontend` | `ai-service` | `postgres` | `redis` | `celery` / `celery-beat` |
| test | `backend-test` | `frontend-test` | N/A | `postgres-test` | `redis-test` | `celery-test` |

> 注意：compose `exec` 請用 **service 名稱**（例如 `backend-test`），不是 container name。

## 啟動

```bash
# main
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh main up -d --build

# dev
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build

# test
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d --build
```

## 常用 exec（exec-first）

### Backend / Django
```bash
# migrate
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py migrate
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh main exec -T backend python manage.py migrate
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py migrate

# backend tests
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q
```

### Frontend
```bash
# lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run lint

# unit tests
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test

# e2e (test env)
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test:e2e
```

### Logs / status
```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f backend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test logs -f backend-test
```

## 測試環境注意事項
- `test` 環境 backend service 是 `backend-test`，Django settings 由 compose 注入 `config.settings.test`。
- `backend-test` 啟動 command 內會做 `migrate` + `scripts/setup_e2e_env.sh`。
- test frontend 對 backend URL 使用 `backend-test:8000`。

## 何時可以不用 exec
- 只在使用者明確要求 host 執行、或操作本身是 compose 管理命令（`up/down/ps/logs/config`）時。
