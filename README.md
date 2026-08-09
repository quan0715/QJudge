# QJudge（線上程式評測平台）

QJudge 是一個整合競賽、教學、評測與 AI 助教流程的線上評測系統。

## 專案現況

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
printf '\n'
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

## 架設與部署

正式的最小部署流程、外部服務選擇與驗收方式，請參考
[QJudge 架設與部署指南](frontend/public/docs/zh-TW/deployment.md)。`frontend/public/docs` 是對外文件的正式來源；論文附錄會從完成實機驗證的 release tag 擷取。

## 文件導覽

- [公開使用說明](frontend/public/docs/zh-TW/overview.md)：學生、教師、管理者與部署者的正式文件入口。
- [QJudge 架設與部署指南](frontend/public/docs/zh-TW/deployment.md)：從一台主機開始的最小部署、選用服務與驗收流程。
- [內部技術文件索引](docs/README.md)：API、Exam Integrity、語系、壓測與營運文件。
- 後端測試指南：`backend/RUN_TESTS.md`
- 壓力測試說明：`docs/loadtest.md`
- 多國語系指南：`docs/i18n.md`

## 授權

MIT License
