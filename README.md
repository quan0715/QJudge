# QJudge（線上程式評測平台）

QJudge 是一個整合競賽、教學、評測與 AI 助教流程的線上評測系統。

## 目前專案現狀（2026-02-25）

- Production domain：`q-judge.com`
- AI 助教：已導入 DeepAgent（LangGraph）流程，並完成前後端 SSE 事件串流對接
- 考試系統：Exam V2 已有資料模型、API 與前端流程骨架（註冊/前檢/作答/檢查/評分/結果）
- CI/CD：GitHub Actions CI（Unit Tests + Judge Tests）通過後，透過 Tailscale SSH 自動部署
- 本地容器化開發：`docker-compose.dev.yml` 可直接拉起 frontend/backend/ai-service/postgres/redis/celery

## 技術棧

| 層級 | 技術 |
| --- | --- |
| Frontend | React 19、TypeScript、Carbon Design System、Vite |
| Backend | Django 4.2、Django REST Framework、Daphne、Celery |
| AI Service | FastAPI、LangGraph DeepAgent、SSE |
| Database/Queue | PostgreSQL 15、Redis 7 |
| Judge | Docker 容器隔離執行 |
| 部署 | Docker Compose、GitHub Actions CI/CD、Tailscale SSH |

## 快速啟動（建議）

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

啟動後預設入口：

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- AI Service: `http://localhost:8001`

## 目前已知狀態

- `ai-service` 健康檢查可通過（`/health`）
- 前端/後端仍有部分既有型別與測試環境問題（非單一功能可一次清除）
- 若要跑 backend 測試，建議顯式指定 `config.settings.test` 與本機 `DATABASE_URL`，避免誤連雲端 DB

## 部署架構

```
GitHub (push to main)
  → CI: Unit Tests + Judge System Tests
  → CD: Tailscale SSH → remote server
    → git fetch + checkout
    → docker compose build + up
    → smoke check (curl localhost:80)
```

- 生產環境：`~/deploy/QJudge`（Ubuntu 22.04 + Docker Compose）
- 網路：Cloudflare Tunnel → `q-judge.com`
- CD workflow：`.github/workflows/cd-prod.yml`
- Deploy script：`scripts/deploy-prod.sh`

### 環境變數

生產環境 `.env` 需包含：

| 變數 | 說明 |
| --- | --- |
| `SECRET_KEY` | Django secret key |
| `DB_PASSWORD` | PostgreSQL 密碼 |
| `DB_SSLMODE` | 本地 Docker postgres 設 `disable` |
| `HMAC_SECRET` | AI service 內部 HMAC 驗證 |
| `AI_SERVICE_INTERNAL_TOKEN` | Backend ↔ AI service 內部 token |
| `TUNNEL_TOKEN` | Cloudflare Tunnel token |
| `NYCU_OAUTH_CLIENT_ID/SECRET` | NYCU OAuth |

完整範例見 `example.env`。

### GitHub Secrets（CD Pipeline）

| Secret | 說明 |
| --- | --- |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| `TS_OAUTH_SECRET` | Tailscale OAuth secret |
| `PROD_SSH_HOST` | 遠端機器 Tailscale hostname |
| `PROD_SSH_USER` | SSH 使用者 |
| `PROD_DEPLOY_PATH` | 部署路徑（絕對路徑） |

## 文件導覽

- 整體實作摘要：`IMPLEMENTATION_SUMMARY.md`
- SSE 設計與現況：`SSE_IMPLEMENTATION_NOTES.md`
- 驗證清單：`VERIFICATION_CHECKLIST.md`
- 後端測試指南：`backend/RUN_TESTS.md`

## 授權

MIT License
