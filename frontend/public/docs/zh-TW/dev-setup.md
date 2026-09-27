# 建立本機開發環境

開發環境是在正式部署用的 `deploy/compose.yml` 上疊加 `compose.dev.yml`：掛載原始碼、熱重載、開放 localhost port，並在同一個 Compose project 內執行 MinIO。設定檔與正式部署相同，都是 `deploy/.env`。要架設正式站台，請改看[架設與部署](#/docs/deployment)。

本機只有這一套環境。需要資料庫的後端測試與 E2E 在 CI 執行，見第 6 節。

## 1. 準備工具

需要 Git、Docker（含 Compose v2）與 Python 3（執行 `deploy/qjudge check`）。Node.js 與各服務的 Python 套件都在 container 內。

## 2. 取得程式碼

```bash
git clone https://github.com/quan0715/QJudge.git
cd QJudge
```

## 3. 建立 `deploy/.env`

```bash
cp deploy/.env.example deploy/.env
```

填入以下值，其餘保持空白：

```text
QJUDGE_PUBLIC_ORIGIN=http://localhost:5173
COMPOSE_PROJECT_NAME=qjudge-dev
SECRET_KEY=<隨機字串>
POSTGRES_ADMIN_PASSWORD=<隨機字串>
DB_PASSWORD=<隨機字串>
AI_DB_PASSWORD=<隨機字串>
CREDENTIAL_LEASE_SECRET=<隨機字串>
HOST_PROJECT_ROOT=<這個 checkout 的絕對路徑>
STORAGE_MODE=bundled
OBJECT_STORAGE_ENDPOINT_URL=http://minio:9000
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://localhost:9000
OBJECT_STORAGE_ACCESS_KEY=qjudge
OBJECT_STORAGE_SECRET_KEY=<至少 8 字元的隨機字串>
OBJECT_STORAGE_BUCKET=qjudge
```

隨機字串可以用 `python3 -c 'import secrets; print(secrets.token_urlsafe(24))'` 產生；DB 密碼只能包含英數字與 `-._~`。`COMPOSE_PROJECT_NAME` 決定 container 與 volume 的名稱，同一台電腦上的每個 checkout 要用不同名稱。

檢查設定：

```bash
deploy/qjudge check
```

顯示 `…/deploy/.env: OK` 即可繼續。

## 4. 啟動開發服務

所有 Compose 指令都經由 wrapper 執行，它會選擇正確的 compose 檔案。第一次啟動：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev build
docker pull --platform linux/amd64 ghcr.io/quan0715/qjudge/judge:latest
deploy/qjudge secrets --image qjudge/backend:dev
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm storage-init
```

`deploy/qjudge secrets` 在 `deploy/secrets/` 產生服務要掛載的 AI OAuth 與 Integrity 金鑰，必須在第一次 `up` 之前存在；已有的金鑰會保留。Judge worker 以拉下來的 judge image 執行提交。`storage-init` 在 MinIO 建立 `OBJECT_STORAGE_BUCKET`。`backend` 與 `ai-service` 啟動時會先套用 migration。

需要測試帳號與範例題目時：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py seed_e2e_data
```

確認狀態：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh
```

常用入口：

| 服務 | 網址 |
| --- | --- |
| QJudge 網頁（Vite） | `http://localhost:5173` |
| Backend API | `http://localhost:8000` |
| AI Service | `http://localhost:8001`（`/health/live`、`/health/ready`） |
| Storybook | `http://localhost:6006`，或 `http://localhost:5173/dev/storybook/` |
| MCP Server | `http://localhost:9002/mcp` |
| MinIO | API `http://localhost:9000`，管理介面 `http://localhost:9001` |

PostgreSQL、PgBouncer 與 Redis 分別開在 `127.0.0.1` 的 `5432`、`6432`、`6379`。Port 衝突時，可以在執行 wrapper 的 shell 設定 `DEV_FRONTEND_PORT` 等變數，名稱見 `compose.dev.yml`；這些變數不要寫進 `deploy/.env`，`check` 會把它們視為未知的 key。

`COMPOSE_PROFILES` 可以加入 `tunnel`（需要 `TUNNEL_TOKEN`）或 `live-monitoring`（開發用 LiveKit，讀取不進 Git 的 `.tmp/livekit/dev.json`）。

## 5. 修改程式與查看日誌

frontend、backend 與 ai-service 的原始碼掛載在 container 內，大多數修改存檔後會自動重新載入。修改依賴或 Dockerfile 後，執行 `dev up -d --build`。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f frontend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f backend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f ai-service
```

按 `Ctrl+C` 只會離開日誌，不會停止服務。

## 6. 執行測試

Frontend：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test
```

AI Service：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m pytest -q tests/unit
```

Backend 中不使用資料庫的測試可以在 dev 執行；pytest-django 會阻止未標記的測試存取資料庫：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q --ds=config.settings.test apps/ai/tests/test_start_run_serializer.py
```

本機不提供測試資料庫。需要資料庫的後端測試由 CI 的 Backend Unit Tests 與 Judge Tests 執行；整合測試與 E2E 在 CI 以全新安裝的 stack 執行，見[E2E 測試](#/docs/e2e-testing)。

## 7. 停止與再次開始

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev down
```

這會移除 container，但保留資料 volume；再次執行 `dev up -d` 即可繼續。不要使用 `down -v`，它會刪除本機的資料庫與 MinIO 資料。

完成環境後，可以閱讀[貢獻指南](#/docs/contributing)了解分支、測試與文件的規則。
