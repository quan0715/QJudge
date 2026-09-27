# E2E 測試

E2E 與 API 整合測試在 CI 執行，對象是一套以正式安裝流程從零建立的 QJudge。Playwright 與 Vitest 直接在 runner 上連到 frontend（`http://localhost:8080`）。

## CI 在哪裡執行

| Workflow | 何時執行 | 內容 |
| --- | --- | --- |
| `ci.yml` 的 Integration Tests | 每次 CI | `npm run test:api` 與 MCP Server 整合測試 |
| `e2e.yml` | 每個目標為 `main` 的 pull request，或手動觸發 | pull request 執行 auth 與 coding；手動觸發可指定任一群組（auth、exam、contest、coding、settings）與 grep |

每個 job 都先執行 `ci/e2e-stack.sh`：

1. `deploy/qjudge init --non-interactive`：origin `http://localhost:8080`、bundled storage，公開的 storage 網址為 `http://minio:9000`（runner 以 `/etc/hosts` 把 `minio` 指到 `127.0.0.1`）。
2. `deploy/qjudge addon storage up` 與 `init`，再以 `deploy/qjudge upgrade` 安裝目前的 commit。
3. 疊加 `ci/compose.e2e.yml` 重新啟動：Django 使用 `config.settings.test`、Celery 非同步執行、AI 服務改接 fake adapters。
4. 執行 `seed_e2e_data`，建立 `admin`、`teacher`、`student`、`student2` 帳號與範例題目、競賽；測試使用的帳密在 `frontend/tests/helpers/data.helper.ts`。

腳本會把之後使用的 compose 指令寫入 `$QJ_DC`，失敗時 CI 以它收集 service log 並上傳 artifact。

## 在本機執行

本機需要時，用同一個腳本在獨立的 git worktree 與 Compose project 安裝，避免覆蓋 checkout 的 `deploy/.env` 或 dev 的資料：

```bash
git worktree add --detach ../qjudge-e2e HEAD
../qjudge-e2e/ci/e2e-stack.sh --set COMPOSE_PROJECT_NAME=qjudge-e2e
```

- 附加的 `--set KEY=VALUE` 會傳給 `deploy/qjudge init`，覆蓋腳本的預設值。
- Bundled storage 使用 port `9000`／`9001`，與 dev 的 MinIO 衝突：先執行 `qjudge-dc.sh dev stop`，或以 `--set STORAGE_MODE=external` 與其他 `OBJECT_STORAGE_*` 改用另一個 S3-compatible 服務（bucket 需已存在，CORS 允許 `http://localhost:8080`）。
- 使用 bundled storage 時，瀏覽器要能解析 `minio`：在 `/etc/hosts` 加入 `127.0.0.1 minio`。

腳本最後印出這套 stack 的 compose 指令，可以用來查看 log。接著在 worktree 的 `frontend/` 執行測試：

```bash
cd ../qjudge-e2e/frontend
npm ci
npx playwright install chromium
npm run test:e2e -- tests/e2e/auth.e2e.spec.ts
npm run test:api
```

`npm run test:e2e:ui`、`test:e2e:debug` 與 `test:e2e:report` 可用於除錯。目標網址可用 `PLAYWRIGHT_BASE_URL` 與 `API_BASE_URL` 覆寫。

結束後只清除這個 project（不要對 dev 使用 `-v`）：

```bash
docker compose -p qjudge-e2e down -v
docker compose -p qjudge-e2e-storage down -v
git worktree remove --force ../qjudge-e2e
```

`upgrade` 建立的 `qjudge/*:sha-*` images 會留在本機，不需要時再以 `docker image rm` 刪除。

## 撰寫測試

測試放在 `frontend/tests/e2e/`，共用的登入、資料與考試流程放在 `frontend/tests/helpers/`。新的測試盡量自行建立需要的課程、題目與考試並在結束時清除，不依賴其他測試留下的資料。
