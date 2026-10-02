# QJudge（線上程式評測平台）

QJudge 是一個整合競賽、教學、評測與 AI 助教流程的線上評測系統。

## 專案現況

- Production domain：`q-judge.com`
- AI 助教：已導入 DeepAgent（LangGraph）流程，並完成前後端 SSE 事件串流對接
- 考試系統：支援註冊、前檢、作答、檢查、評分與結果流程
- CI/CD：dev → main 的 release PR 須通過必要檢查（CI 與 E2E）才能合併；合併後手動觸發 CD，經 Tailscale SSH 部署到正式機
- 本地容器化開發：`qjudge-dc.sh dev`（`deploy/compose.yml` + `compose.dev.yml`）可直接拉起 frontend/backend/ai-service/postgres/redis/celery/storybook

## 技術棧

| 層級 | 技術 |
| --- | --- |
| Frontend | React 19、TypeScript、Carbon Design System、Vite |
| Backend | Django 4.2、Django REST Framework、Daphne、Celery |
| AI Service | FastAPI、LangGraph DeepAgent、SSE |
| Database/Queue | PostgreSQL 15、Redis 7 |
| Judge | Docker 容器隔離執行 |
| 部署 | Docker Compose、GitHub Actions CI/CD、Tailscale SSH |

## 本機開發

本機只有 dev 環境：`qjudge-dc.sh dev`，設定檔為 `deploy/.env`。

```bash
cp deploy/.env.example deploy/.env   # 填入必要值
deploy/qjudge check
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev build
docker pull --platform linux/amd64 ghcr.io/quan0715/qjudge/judge:latest
deploy/qjudge secrets --image qjudge/backend:dev
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm storage-init
```

要填的值、預設入口與測試方式見[建立本機開發環境](frontend/public/docs/zh-TW/dev-setup.md)。需要資料庫的後端測試、整合測試與 E2E 在 CI 執行，E2E 以 `ci/e2e-stack.sh` 全新安裝後測試，見 [E2E 測試](frontend/public/docs/zh-TW/e2e-testing.md)。

## 架設與部署

正式站台以 `deploy/qjudge` 安裝與維護：`init` 建立設定、`addon` 啟動自帶的 MinIO／LiveKit、`ingress` 列出反向代理或 Tunnel 的設定、`upgrade <ref>` 安裝或升級、`rollback` 回到上一版。完整流程見
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
