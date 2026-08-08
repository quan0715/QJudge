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
export OBJECT_STORAGE_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
read -r -p "R2 access key: " OBJECT_STORAGE_ACCESS_KEY
read -r -s -p "R2 secret key: " OBJECT_STORAGE_SECRET_KEY
export OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://localhost:5173
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
    → web smoke check
```

- 生產環境：`~/deploy/QJudge`（Ubuntu 22.04 + Docker Compose）
- 網路：Cloudflare Tunnel → `q-judge.com`
- CD workflow：`.github/workflows/cd-prod.yml`
- Deploy script：`scripts/deploy-prod.sh`

### 環境變數

根目錄 `.env` 不進 git，也不需要手動填寫內部 URL、queue、bucket 名稱或
資料庫帳號。初始化工具會產生 Django、PostgreSQL 與 credential lease secrets：

```bash
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://HOST_OR_IP
```

執行前先將四個 `OBJECT_STORAGE_*` 值放入目前的 shell；缺少時，互動模式會提示輸入。
生產環境 `.env` 由 `scripts/deploy-prod.sh` 做 fail-fast 檢查，最小契約如下：

| 變數 | 說明 |
| --- | --- |
| `QJUDGE_PUBLIC_ORIGIN` | 使用者實際開啟的完整 origin |
| `SECRET_KEY`, `POSTGRES_ADMIN_PASSWORD`, `DB_PASSWORD`, `AI_DB_PASSWORD`, `CREDENTIAL_LEASE_SECRET` | 初始化工具產生的 secrets |
| 四個 `OBJECT_STORAGE_*` | S3-compatible endpoint 與憑證 |

AI provider、第三方 OAuth、SMTP、Remote MCP 與 Tunnel 都是條件式設定，不屬於最小部署。
完整規則見 [`docs/deployment.md`](docs/deployment.md) 與 `.env.example`。

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
