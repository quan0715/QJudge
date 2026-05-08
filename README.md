# QJudge（線上程式評測平台）

QJudge 是一個整合競賽、教學、評測與 AI 助教流程的線上評測系統。

## 目前專案現狀（2026-05-04）

- Production domain：`q-judge.com`
- AI 助教：已導入 DeepAgent（LangGraph）流程，並完成前後端 SSE 事件串流對接
- 考試系統：Exam V2 已有資料模型、API 與前端流程骨架（註冊/前檢/作答/檢查/評分/結果）
- CI/CD：GitHub Actions CI（Unit Tests + Judge Tests）通過後，透過 Tailscale SSH 自動部署
- 本地容器化開發：`docker-compose.dev.yml` 可直接拉起 frontend/backend/ai-service/postgres/redis/celery/storybook

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
cp .env.example .env
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh
```

啟動後預設入口：

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- AI Service: `http://localhost:8001`
- Storybook: `http://localhost:6006`
- MCP Server: `http://localhost:9002/mcp`

## 目前已知狀態

- `ai-service` 健康檢查可通過（`/health`）
- 前端/後端仍有部分既有型別與測試環境問題（非單一功能可一次清除）
- compose 矩陣固定為 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.test.yml`
- 若要跑 backend 測試，使用 `docker-compose.test.yml` 或顯式指定 `config.settings.test`，避免誤連 dev/prod DB

## 部署架構

```
GitHub (push to main)
  → CI: Unit Tests + Judge System Tests
  → CD: Tailscale SSH → remote server
    → git fetch + checkout
    → docker compose build + up
    → smoke checks (web + monitoring)
```

- 生產環境：`~/deploy/QJudge`（Ubuntu 22.04 + Docker Compose）
- 網路：Cloudflare Tunnel → `q-judge.com`
- CD workflow：`.github/workflows/cd-prod.yml`
- Deploy script：`scripts/deploy-prod.sh`

### 環境變數

根目錄 `.env` 不進 git。從範本開始：

```bash
cp .env.example .env
```

生產環境 `.env` 由 `scripts/deploy-prod.sh` 做 fail-fast 檢查，至少需包含：

| 變數 | 說明 |
| --- | --- |
| `SECRET_KEY` | Django secret key |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE` | PostgreSQL / PgBouncer 設定 |
| `FRONTEND_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | public URL 與 browser security |
| `REDIS_URL` | Redis 連線位址，production compose 會覆蓋為 `redis://redis:6379/0` |
| `AI_SERVICE_INTERNAL_TOKEN` | Backend 與 AI service 內部 token |
| `OBJECT_STORAGE_*`, `ANTICHEAT_RAW_BUCKET`, `MARKDOWN_IMAGE_S3_BUCKET`, `AI_ARTIFACT_S3_BUCKET` | R2 object storage |
| `TUNNEL_TOKEN`, `MCP_PUBLIC_URL`, `OAUTH_ISSUER_URL` | Cloudflare Tunnel 與 MCP OAuth |
| `GLITCHTIP_SECRET_KEY`, `GRAFANA_PASSWORD` | production operations |

完整清單與 production/dev/test compose 掃描見 [`docs/deployment.md`](docs/deployment.md) 與 `.env.example`。

### GitHub Secrets（CD Pipeline）

| Secret | 說明 |
| --- | --- |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| `TS_OAUTH_SECRET` | Tailscale OAuth secret |
| `PROD_SSH_HOST` | 遠端機器 Tailscale hostname |
| `PROD_SSH_USER` | SSH 使用者 |
| `PROD_DEPLOY_PATH` | 部署路徑（絕對路徑） |

## 文件導覽

- [使用者與教師手冊](docs/user-guide.md)：教室、題庫、競賽功能說明。
- [開發者指南](docs/developer-guide.md)：系統架構、環境設定、開發規範。
- [部署與 Docker Compose 手冊](docs/deployment.md)：production/dev/test compose 矩陣、環境變數、部署與驗證流程。
- 後端測試指南：`backend/RUN_TESTS.md`
- 壓力測試說明：`docs/loadtest.md`
- 監控部署說明：`docs/monitoring.md`
- 多國語系指南：`docs/i18n.md`

## 授權

MIT License
