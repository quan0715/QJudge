# 部署與設定管理重構設計

日期：2026-09-23
狀態：設計定案，待實作計畫

## 1. 目標

### 要解決的問題

- 同一條設定規則分散在 bash、Python 腳本、compose 內插與 Django settings，新增一個 key 要改很多檔案。
- compose 的 `:-default` 與 app 預設重複且部分不一致。
- 主機 build 會覆蓋 `oj-backend:prod`，失敗時無法回到上一版。
- dev／test／prod 三份 compose 各自維護服務定義與 env 清單。
- MinIO 與 LiveKit 散落在 `docker-compose.migration.yml`、`scripts/livekit/` 與主 compose，連線設定要手動兩邊對齊。

### 決定

| 項目 | 決定 |
|---|---|
| 部署對象 | 自己的 prod（dcslab）與外部自架者用同一套流程 |
| 機密 | 放在主機 `deploy/.env` 與 `deploy/secrets/` |
| 預設值 | 由 app settings 持有；compose 只傳遞，不寫預設值 |
| schema | CLI 內一份 key 清單，用來驗證 `.env` 與產生 `.env.example` |
| 入口 | 前端容器改為 `gateway`，所有 HTTP 路徑（含 `/mcp`）由它分流 |
| Storage | 只用 S3 核心 API，單一 bucket 以 prefix 區分 |
| MinIO／LiveKit | `bundled` 或 `external` 兩種模式；bundled 為獨立 addon |
| 環境 | 只保留 prod 形狀與 dev overlay；E2E 在 CI 以全新安裝執行 |
| Image | 維持主機 build，以 git SHA 當 tag，保留最近 3 版供 rollback |

### 不做

- CI 推送 image 到 GHCR、semver release、輕量 bundle（之後再做）。
- `.env` 自動遷移、版本歷史、舊版安裝轉換工具。
- 主機搬遷流程。

### 限制

- dcslab（`/mnt/data/qjudge-app`）原地升級；compose project `qjudge-app`、資料 volume、外部 network `online_judge_oj_network`、MinIO 資料目錄 `/mnt/data/qjudge-data/minio` 必須沿用。

## 2. 目錄結構

```
deploy/
  compose.yml              QJudge 應用（prod 形狀），只有 image:
  compose.build.yml        6 個自建 image 的 build 設定
  addons/
    storage/compose.yml    MinIO
    media/                 LiveKit + coturn
  gateway/                 gateway nginx 樣板
  qjudge                   CLI（Python 標準函式庫）
  qjudge_cli/              schema.py 與指令實作
  .env.example             由 schema 產生
  .env  secrets/  backups/ 主機專屬，gitignore
compose.dev.yml            dev overlay
ci/compose.fakes.yml       CI E2E 用的 fake-ai-adapters
```

最後清理階段刪除：`docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.test.yml`、`docker-compose.migration.yml`、`docker-compose.monitoring.yml` 與 `monitoring/`、`loadtest/docker-compose.loadtest.yml`、`scripts/livekit/`、`frontend/Dockerfile.e2e`、`scripts/deploy-prod.sh`、`scripts/setup-env.sh`、`scripts/prepare-prod-release-env.py`、`scripts/qjudge-deploy.py`、`scripts/check-compose-config.sh`、`scripts/bootstrap_ai_oauth_keys.py`、`scripts/bootstrap_integrity_secrets.py`，並同步更新引用它們的 `Makefile`、`ci.yml`、測試與文件。Locust 腳本保留。

## 3. 設定

### schema（`deploy/qjudge_cli/schema.py`）

每個 key 只有：`name`、`required`（`True`／`False`／簡單條件）、`secret`、`feature`、`help`。

用途：`qjudge check` 驗證 `.env`（缺漏、條件必填、URL 格式），以及產生 `.env.example`。schema 不存預設值與推導邏輯。

### `.env` 的 key

核心：

- `QJUDGE_PUBLIC_ORIGIN`
- `GATEWAY_BIND_ADDRESS`（預設 `127.0.0.1`；反向代理在另一台機器時填 VPS 內網 IP）、`GATEWAY_PORT`
- `QJUDGE_TRUSTED_PROXIES`（反向代理的 IP）
- `COMPOSE_PROJECT_NAME`、`COMPOSE_PROFILES`
- 由 `init` 產生：`SECRET_KEY`、`POSTGRES_ADMIN_PASSWORD`、`DB_PASSWORD`、`AI_DB_PASSWORD`、`CREDENTIAL_LEASE_SECRET`，以及 `secrets/` 內的 AI OAuth 與 Integrity 金鑰

Storage：

- `STORAGE_MODE=bundled|external`
- `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`（瀏覽器可達的 HTTPS 網址）
- external 另需：`OBJECT_STORAGE_ENDPOINT_URL`、`OBJECT_STORAGE_ACCESS_KEY`、`OBJECT_STORAGE_SECRET_KEY`、`OBJECT_STORAGE_BUCKET`

選用功能：

| 功能 | key |
|---|---|
| 監考 | `MEDIA_MODE=disabled|bundled|external`；`LIVEKIT_PUBLIC_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`；bundled 另需 `LIVEKIT_NODE_IP`、`LIVEKIT_TURN_HOST`、`LIVEKIT_TURN_SECRET` |
| AI | `OPENAI_API_KEY`／`OPENAI_BASE_URL`、`DEEPSEEK_API_KEY`／`DEEPSEEK_BASE_URL`、`VLLM_API_KEY`／`VLLM_BASE_URL` |
| OAuth 登入 | `<PROVIDER>_OAUTH_CLIENT_ID`／`_CLIENT_SECRET` |
| SMTP | `EMAIL_HOST_USER`、`EMAIL_HOST_PASSWORD` |
| Remote MCP | `QJUDGE_REMOTE_MCP_ENABLED` |
| Cloudflare Tunnel | `TUNNEL_TOKEN`（profile `tunnel`） |

### 移除的 key

- `FRONTEND_PORT`／`FRONTEND_BIND_ADDRESS` → `GATEWAY_PORT`／`GATEWAY_BIND_ADDRESS`
- `LIVE_MONITORING_ENABLED`、`LIVEKIT_DEPLOYMENT` → `MEDIA_MODE`
- `OBJECT_STORAGE_REGION`、`OBJECT_STORAGE_AUTO_CREATE_BUCKETS`、`OBJECT_STORAGE_OBJECT_TAGGING_ENABLED`
- `ANTICHEAT_RAW_BUCKET`、`INTEGRITY_ARCHIVE_BUCKET`、`MARKDOWN_IMAGE_S3_BUCKET`、`AI_ARTIFACT_S3_BUCKET`
- `MCP_PUBLIC_URL`、`LIVEKIT_INTERNAL_URL`

dcslab 的 `.env` 依此清單手動改寫一次。

### 推導與瘦身

- 各 app 自行由 `QJUDGE_PUBLIC_ORIGIN` 推導 issuer、CORS、CSRF、`ALLOWED_HOSTS`、MCP URL、OAuth redirect URI；compose 不再把 origin 複製成多個變數。
- 盤點 backend 與 ai-service 的 env 讀取，部署者不需要設定的值（TTL、內部 bucket 名稱、room prefix 等）改為程式常數。

## 4. Compose

- prod：`deploy/compose.yml` + `deploy/compose.build.yml`。
- dev：再疊 `compose.dev.yml`，project `qjudge-dev`；只覆寫程式碼 bind mount、熱重載指令、localhost port、`settings.dev`、Storybook、Vite dev server。
- CI E2E：prod 形狀 + `ci/compose.fakes.yml`，每次獨立 project。
- `qjudge-dc.sh` 只保留 `main` 與 `dev`。

base 規則：

- 檔案開頭 `name: ${COMPOSE_PROJECT_NAME:-qjudge}`。
- 自建服務使用 `image: qjudge/<name>:${QJUDGE_VERSION}`。
- env 以 anchor 依服務群組定義一次，值一律 `${VAR}` 或 `${VAR:-}`；CI lint 禁止 compose 出現非空的 `:-default`（port、bind address 除外）。
- 移除所有 `container_name`；`frontend` 改名 `gateway`。
- `migrate` 與 `ai-migrate` 為一次性服務，backend 啟動不再跑 migrate。
- 移除 prod ai-service 的 `./ai-service:/app` 原始碼掛載。
- MinIO、LiveKit、coturn 不在 base。

單元測試改在 dev 容器內執行；`settings.test` 使用獨立 Redis DB index 與 eager Celery。

## 5. Gateway

- 分流所有 HTTP 路徑：SPA、`/api`、`/o`、`/.well-known`、`/admin`、`/django-admin`、`/static`、`/media`、`/mcp`。
- `set_real_ip_from` 設為 `QJUDGE_TRUSTED_PROXIES`；`X-Forwarded-Proto` 使用代理傳入值，移除寫死的 `https`。
- 使用 nginx 官方 image 的 envsubst template。
- 客戶反向代理只需一條 `proxy_pass` 到 `GATEWAY_BIND_ADDRESS:GATEWAY_PORT`。

`qjudge ingress` 依 `.env` 列出需要設定的入口：主網域 → gateway；MinIO 公開網域；bundled LiveKit 的 WebSocket 網域；LiveKit UDP `50000-50099`、TCP `7881`、TURN `3478` 需直接開放或由路由器轉發。

## 6. Storage

- 只使用 Get／Put／Head／Delete／List／presigned URL／checksum；region 固定 `us-east-1`。
- 執行期不建立 bucket，刪除 backend 與 ai-service 的建 bucket 程式碼。
- 單一 bucket，固定 prefix：`markdown/`、`integrity/`、`ai-artifacts/`。DB 的 `object_key` 不含 prefix，由存取層加上。
- 監考證據移除 object tagging，改由 Celery beat 刪除 DB 未保留且超過保存期限的物件。
- dcslab 轉換時以一次性腳本把舊 bucket 物件複製到新 bucket 的 prefix。

## 7. Addon

- `deploy/addons/storage`（MinIO）與 `deploy/addons/media`（LiveKit + coturn）各自是獨立 compose project，image 固定版本。
- `qjudge upgrade` 不會重啟 addon；addon 用 `qjudge addon <name> up|upgrade` 管理。
- `qjudge addon storage init`：建立 bucket、QJudge 用的 access key、CORS，並寫入 `.env`。
- `qjudge addon media init`：產生 LiveKit API key／secret 與 TURN secret，並寫入 `.env`。
- `external` 模式不啟動 addon，只使用 `.env` 的連線設定。

## 8. CLI

| 指令 | 行為 |
|---|---|
| `init` | 新安裝：詢問 origin、反向代理位置、storage／media 模式，產生機密，寫出 `.env` |
| `check` | 驗證 `.env`，一次列出所有錯誤 |
| `ingress` | 列出需要設定的入口 |
| `upgrade <ref>` | 升級 |
| `rollback` | 回到上一版 |
| `addon <name> init|up|upgrade` | 管理 addon |

### `upgrade <ref>`

1. `git checkout <ref>`，`qjudge check`。
2. 以 `sha-<12>` 為 tag build image（舊服務持續運作）。
3. `pg_dump` 備份到 `deploy/backups/`，保留最近 10 份。
4. 執行 `migrate`、`ai-migrate`。
5. `up -d`。
6. 健康檢查：經 gateway 內網位址帶 `Host` 打 `/api/health/`，AI 與 Integrity ready。
7. 失敗時用上一版 image 重新 `up`；DB 不自動還原。
8. 把目前與上一版 SHA 寫入 `deploy/.version`；清理 image 只保留最近 3 版。

### `rollback`

checkout `deploy/.version` 記錄的上一版，以本機 image `up`。

DB bootstrap（建立 `qjudge_admin`、驗證應用 role 權限）改為一次性 `db-bootstrap` 服務，於 migrate 前執行。

## 9. CI 與 CD

- CI 保留現有 static checks 與 unit job；新增 compose 預設值 lint 與 `.env.example` 一致性檢查。
- E2E：`qjudge init --non-interactive` → `qjudge upgrade <sha>`（疊加 `ci/compose.fakes.yml`）→ seed → 在 runner 上執行 Playwright，目標為 gateway。
- CD：確認 SHA 的 CI 成功 → Tailscale 加入 tailnet → SSH 到 dcslab → `deploy/qjudge upgrade <sha>`。

## 10. dcslab 轉換

1. 備份 DB、`.env`、`secrets/`。
2. checkout 新版，`.env` 與 `secrets/` 移到 `deploy/`，依第 3 節改寫 `.env`（`COMPOSE_PROJECT_NAME=qjudge-app`、`QJUDGE_NETWORK_EXTERNAL=true`、`STORAGE_MODE=bundled`、`MEDIA_MODE=bundled`，沿用現有 MinIO 與 LiveKit 的 credential 與網域）。
3. 維護時段：停掉舊的 MinIO 與 LiveKit compose，改以 addon 啟動（沿用資料目錄、網域、port、secret）。
4. 建立新 bucket，執行一次性複製腳本。
5. `qjudge check` → `qjudge upgrade <sha>`。
6. 驗收登入、評測、Integrity、監考、AI、MCP、圖片與證據上傳下載。

## 11. 文件

- 公開部署文件改寫為 `init`／`check`／`ingress`／`upgrade`，加入「反向代理在另一台機器」與 `STORAGE_MODE`／`MEDIA_MODE` 說明。
- 更新 `qjudge-env-compose-owner` skill、`environment-matrix.md`、`qjudge-dc.sh`、`CLAUDE.md`。

## 12. 實作階段

1. schema、`check`、`.env.example` 產生、compose lint。
2. compose 重組：`deploy/`、base + build + dev overlay、migrate／db-bootstrap 服務、app settings 推導與 env 瘦身。
3. gateway 與 `ingress`。
4. storage 簡化、單一 bucket、storage 與 media addon。
5. `init`、`upgrade`、`rollback`，CD 改寫。
6. CI E2E 全新安裝，刪除 test compose。
7. 文件與 skill。
8. dcslab 轉換，刪除舊檔案。

第 1 到 7 階段期間，dcslab 仍以舊流程部署 hotfix。
