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
- DB 連線設定重複（每個服務 7 個 `DB_*`），AI 直連 postgres 使總連線數沒有上限。

### 決定

| 項目 | 決定 |
|---|---|
| 部署對象 | 自己的 prod（dcslab）與外部自架者用同一套流程 |
| 機密 | 放在主機 `deploy/.env` 與 `deploy/secrets/` |
| 預設值 | 由 app 持有；app 讀 env 時空字串視為未設定；compose 只傳遞，不替使用者 key 提供預設值 |
| schema | CLI 內一份 key 清單，用來驗證 `.env` 與產生 `.env.example` |
| 入口 | `frontend` 容器是唯一 HTTP 入口，所有路徑（含 `/mcp`）由它分流 |
| DB | 所有長駐 process 經 pgbouncer；每個 app 只讀一個連線 URL；`.env` 只放密碼 |
| Storage | 只用 S3 核心 API，單一 bucket 以 prefix 區分 |
| MinIO／LiveKit | `bundled` 或 `external` 兩種模式；bundled 為獨立 addon |
| 環境 | 只保留 prod 形狀與 dev overlay；DB 測試與 E2E 只在 CI 執行 |
| Image | 維持主機 build，以 git SHA 當 tag，保留最近 3 版供 rollback |

### 不做

- CI 推送 image 到 GHCR、semver release、輕量 bundle（之後再做）。
- `.env` 自動遷移、版本歷史、舊版安裝轉換工具。
- 主機搬遷流程。
- 本地測試 DB：本機只執行不需要 DB 的測試（vitest、純 unit），DB 測試只在 CI 執行。

### 限制

- dcslab（`140.113.207.46`，`/mnt/data/qjudge-app`）已是 prod（2026-09-23 確認），原地升級。`docs/operations/dcslab-predeployment.md` 為歷史紀錄。
- compose project `qjudge-app`、資料 volume（含 `integrity_resident_data`）、MinIO 資料目錄 `/mnt/data/qjudge-data/minio` 必須沿用；轉換過程不刪除或修改這些資料。

## 2. 目錄結構

```
deploy/
  compose.yml              QJudge 應用（prod 形狀），只有 image:
  compose.build.yml        6 個自建 image 的 build 設定
  postgres/
    initdb.d/              第一次初始化時建立 DB 與 role 的腳本
  pgbouncer/
    pgbouncer.ini          兩個 DB 的 pool 設定
  addons/
    storage/compose.yml    MinIO
    media/                 LiveKit（內建 TURN）
  qjudge                   CLI（Python 標準函式庫）
  qjudge_cli/              schema.py 與指令實作
  .env.example             由 schema 產生
  .env  secrets/  backups/ 主機專屬，gitignore
compose.dev.yml            dev overlay
ci/compose.fakes.yml       CI E2E 用的 fake-ai-adapters
```

最後清理階段刪除：`docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.test.yml`、`docker-compose.migration.yml`、`docker-compose.monitoring.yml` 與 `monitoring/`、`loadtest/docker-compose.loadtest.yml`、`scripts/livekit/`、`scripts/db/bootstrap-ai-database.sh`、`frontend/Dockerfile.e2e`、`scripts/deploy-prod.sh`、`scripts/setup-env.sh`、`scripts/prepare-prod-release-env.py`、`scripts/qjudge-deploy.py`、`scripts/check-compose-config.sh`、`scripts/bootstrap_ai_oauth_keys.py`、`scripts/bootstrap_integrity_secrets.py`，並同步更新引用它們的 `Makefile`、`ci.yml`、測試與文件。Locust 腳本保留。

## 3. 設定

### schema（`deploy/qjudge_cli/schema.py`）

每個 key 只有：`name`、`required`（`True`／`False`／簡單條件）、`secret`、`feature`、`help`。

用途：`qjudge check` 驗證 `.env`（缺漏、條件必填、URL 格式），以及產生 `.env.example`。schema 不存預設值與推導邏輯。

### 設定值放哪裡

| 性質 | 位置 | 例子 |
|---|---|---|
| 使用者設定 | `deploy/.env` | origin、密碼、storage／media 模式 |
| 容器間連線 | compose | 服務名稱、內部 port、DB 名稱、由密碼組成的連線 URL |
| 基礎服務調校 | postgres：compose command 的 `-c` 參數；pgbouncer：`deploy/pgbouncer/pgbouncer.ini` | `max_connections`、pool 大小 |
| app 行為 | app 程式常數 | `sslmode`、`CONN_MAX_AGE`、app 端 pool 大小、TTL |

compose 可以寫死容器間連線值，但不替使用者 key 提供預設值。

### `.env` 的 key

核心：

- `QJUDGE_PUBLIC_ORIGIN`
- `FRONTEND_BIND_ADDRESS`（預設 `127.0.0.1`；反向代理在另一台機器時填 VPS 內網 IP）、`FRONTEND_PORT`
- `QJUDGE_TRUSTED_PROXIES`（反向代理的 IP）
- `COMPOSE_PROJECT_NAME`、`COMPOSE_PROFILES`
- 由 `init` 產生：`SECRET_KEY`、`POSTGRES_ADMIN_PASSWORD`、`DB_PASSWORD`、`AI_DB_PASSWORD`、`CREDENTIAL_LEASE_SECRET`，以及 `secrets/` 內的 AI OAuth 與 Integrity 金鑰。三組 DB 密碼只能含 URL 不需編碼的字元（英數字與 `-._~`，會直接放進連線 URL），`check` 驗證此規則

Storage：

- `STORAGE_MODE=bundled|external`
- `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`（瀏覽器可達的 HTTPS 網址）
- `OBJECT_STORAGE_ENDPOINT_URL`、`OBJECT_STORAGE_ACCESS_KEY`、`OBJECT_STORAGE_SECRET_KEY`、`OBJECT_STORAGE_BUCKET`（bundled 時 endpoint 為 `http://minio:9000`，access／secret key 同時是 MinIO root 帳密）
- `MINIO_DATA_DIR`（選用，bundled MinIO 的主機資料目錄；未設定時用 Docker volume）

選用功能：

| 功能 | key |
|---|---|
| 監考 | `MEDIA_MODE=disabled|bundled|external`；`LIVEKIT_PUBLIC_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`；bundled 另需 `LIVEKIT_NODE_IP`、`LIVEKIT_TURN_HOST` |
| AI | `OPENAI_API_KEY`／`OPENAI_BASE_URL`、`DEEPSEEK_API_KEY`／`DEEPSEEK_BASE_URL`、`VLLM_API_KEY`／`VLLM_BASE_URL` |
| OAuth 登入 | `<PROVIDER>_OAUTH_CLIENT_ID`／`_CLIENT_SECRET` |
| SMTP | `EMAIL_HOST_USER`、`EMAIL_HOST_PASSWORD` |
| Remote MCP | `QJUDGE_REMOTE_MCP_ENABLED` |
| Cloudflare Tunnel | `TUNNEL_TOKEN`（profile `tunnel`） |
| 本地開發 | `HOST_PROJECT_ROOT`、`DOCKER_JUDGE_PLATFORM`（只有 dev 使用） |

### 移除的 key

- `LIVE_MONITORING_ENABLED`、`LIVEKIT_DEPLOYMENT` → `MEDIA_MODE`
- `OBJECT_STORAGE_REGION`、`OBJECT_STORAGE_AUTO_CREATE_BUCKETS`、`OBJECT_STORAGE_OBJECT_TAGGING_ENABLED`
- `ANTICHEAT_RAW_BUCKET`、`INTEGRITY_ARCHIVE_BUCKET`、`MARKDOWN_IMAGE_S3_BUCKET`、`AI_ARTIFACT_S3_BUCKET`
- `MCP_PUBLIC_URL`、`LIVEKIT_INTERNAL_URL`
- `QJUDGE_NETWORK_NAME`、`QJUDGE_NETWORK_EXTERNAL`（network 固定，見第 4 節）
- `DB_NAME`、`DB_USER`、`DB_HOST`、`DB_PORT`、`DB_SSLMODE`、`DB_CONN_MAX_AGE`、`AI_DB_USER`、`AI_DB_NAME`

dcslab 的 `.env` 依此清單手動改寫一次。

### 推導與瘦身

- app 共用一個讀 env 的 helper，空字串視為未設定，避免 compose 傳入的空值蓋掉 app 預設。
- 各 app 自行由 `QJUDGE_PUBLIC_ORIGIN` 推導 issuer、CORS、CSRF、`ALLOWED_HOSTS`、MCP URL、OAuth redirect URI；compose 不再把 origin 複製成多個變數。MCP URL 的推導與 `/mcp` 路由一起在入口計畫處理。
- 不保留舊 key fallback：app 只讀新 key。dev 在 dcslab 轉換（第 8 階段）前不 release 到 main。
- `LIVEKIT_INTERNAL_URL` 預設由 `LIVEKIT_PUBLIC_URL` 推導（`ws`/`wss` 換成 `http`/`https`）；dev overlay 以容器位址覆寫。
- 盤點 backend 與 ai-service 的 env 讀取，部署者不需要設定的值（TTL、內部 bucket 名稱、room prefix 等）改為程式常數。

## 4. Compose

- prod：`deploy/compose.yml` + `deploy/compose.build.yml`。
- dev：再疊 `compose.dev.yml`；project 名稱沿用 checkout 目錄名稱（主目錄為 `online_judge`，worktree 各自不同），以沿用既有 dev volume；network 為 project 內建 network；只覆寫程式碼 bind mount、熱重載指令、localhost port、`settings.dev`、Storybook、Vite dev server、dev 專用連線值。dev 的設定檔同樣是 `deploy/.env`。
- CI E2E：prod 形狀 + `ci/compose.fakes.yml`，每次獨立 project。
- `qjudge-dc.sh` 只保留 `main` 與 `dev`。

base 規則：

- 檔案開頭 `name: ${COMPOSE_PROJECT_NAME:-qjudge}`。
- 共用 network 固定名稱 `qjudge`，宣告為 `external: true`；app 與 addon 都掛在這個 network。`init`、`upgrade`、`addon up` 執行前若不存在就建立。dev overlay 改回 project 內建 network，避免多個 worktree 共用同一個 network。
- 自建服務使用 `image: qjudge/<name>:${QJUDGE_VERSION}`。
- env 以 anchor 依服務群組定義一次；使用者 key 一律 `${VAR}` 或 `${VAR:-}`；CI lint 禁止 compose 為使用者 key 寫非空的 `:-default`（port、bind address 除外）。
- 移除所有 `container_name`。
- `migrate` 與 `ai-migrate` 為一次性服務，backend 啟動不再跑 migrate。
- 移除 prod ai-service 的 `./ai-service:/app` 原始碼掛載。
- MinIO、LiveKit 不在 base。

## 5. DB

```
所有長駐 app process ──▶ pgbouncer（session mode，online_judge + qjudge_ai）──▶ postgres
pg_dump 與 initdb ─────────────────────────────────────────────────────────▶ postgres（admin）
```

- AI 改經 pgbouncer，總連線數由 pgbouncer 控制；超過 pool 的請求排隊，不會被 postgres 拒絕。維持 session mode（已通過 200 人壓測，AI checkpointer 與 prepared statement 可正常運作）。
- 連線預算：postgres `-c max_connections=400`（不改用 `config_file`，因為它會忽略既有資料目錄的設定）；`pgbouncer.ini` 中 `online_judge` pool 300、`qjudge_ai` pool 60，各保留 10 條 reserve，剩餘 20 條給 admin 與備份；`max_client_conn=2000`。以 dcslab 記憶體確認 `shared_buffers` 與 `work_mem`。
- 連線 URL（compose anchor 各一行）：
  - backend 群組：`DATABASE_URL=postgresql://qjudge_web:${DB_PASSWORD}@pgbouncer:5432/online_judge`
  - AI 群組：`AI_DATABASE_URL=postgresql://qjudge_ai:${AI_DB_PASSWORD}@pgbouncer:5432/qjudge_ai`
- pgbouncer 由 image 內建 entrypoint 依 `DATABASE_URLS`（兩組連線）產生 `userlist.txt`；其餘設定在掛載的 `pgbouncer.ini`。
- Django：只從 `DATABASE_URL` 建立設定；`sslmode=disable`、`CONN_MAX_AGE=0`、`CONN_HEALTH_CHECKS=True` 為程式常數；`prod.py` 不再另建 DATABASES。
- AI：SQLAlchemy engine pool 5 + overflow 5；checkpointer pool 上限 5，`search_path` 改在連線建立後以 `SET` 設定（pgbouncer 不接受 `options` 啟動參數）；ai-worker 設定 `--concurrency=2`。worker 任務每次以 `asyncio.run` 建立並 dispose engine 是正確做法（async engine 不能跨 event loop），維持不變。
- 初始化：`deploy/postgres/initdb.d/` 的 SQL 在資料目錄為空時建立 `online_judge`／`qjudge_web`、`qjudge_ai`／`qjudge_ai`（NOSUPERUSER、NOCREATEDB、NOCREATEROLE）。移除 `ai-db-bootstrap` 服務與 `deploy-prod.sh` 的 role SQL。既有安裝不需執行；改密碼時以 `ALTER ROLE` 手動更新並同步 `.env`。
- dev 使用相同拓撲與連線 URL，overlay 只開放 port。
- 測試：不提供本地測試 DB。CI 的 backend 測試使用 GitHub service postgres，`settings.test` 同樣只讀 `DATABASE_URL`。

## 6. 入口（frontend）

- 分流所有 HTTP 路徑：SPA、`/api`、`/o`、`/.well-known`、`/admin`、`/django-admin`、`/static`、`/media`、`/mcp`。
- `set_real_ip_from` 設為 `QJUDGE_TRUSTED_PROXIES`；`X-Forwarded-Proto` 使用代理傳入值，移除寫死的 `https`。
- 信任邊界：frontend 預設只綁 `127.0.0.1`；反向代理在另一台機器時，以主機防火牆限制只有該機器能連 `FRONTEND_PORT`。上游代理必須以 `proxy_set_header` 附加或覆寫 `X-Forwarded-For` 並設定 `X-Forwarded-Proto`（`ingress` 輸出的範本會採附加）。
- real IP 設定由 nginx 官方 image 的 `/docker-entrypoint.d` 腳本依 `QJUDGE_TRUSTED_PROXIES` 產生；未設定時信任所有來源但只取最後一個 `X-Forwarded-For`；frontend 轉給 app 的 `X-Forwarded-For` 只含解析後的來源 IP。

`qjudge ingress` 依 `.env` 列出需要設定的入口：主網域 → frontend；MinIO 公開網域；bundled LiveKit 的 WebSocket 網域；LiveKit UDP `50000-50099`、TCP `7881`、TURN UDP `3478` 與 relay UDP `50300-50399` 需在 `LIVEKIT_NODE_IP` 直接開放或由路由器轉發。TURN/TLS：LiveKit 固定廣告 `turns:<LIVEKIT_TURN_HOST>:443`，由主機反向代理在 443 終止 TLS（憑證由主機管理，續期後 reload 代理），以純 TCP 轉到 LiveKit TURN `5349`（綁 `FRONTEND_BIND_ADDRESS`，不直接對外）。`ingress --nginx` 附 nginx `stream` 範例，假設 TURN 網域解析到只給 TURN 用的位址。

## 7. Storage

- 只使用 Get／Put／Head／Delete／List／presigned URL／checksum；region 固定 `us-east-1`。
- 執行期不建立 bucket，刪除 backend 與 ai-service 的建 bucket 程式碼。
- 單一 bucket（`OBJECT_STORAGE_BUCKET`）。現有 object key 已各自帶開頭（`markdown/`、`integrity/`、`ai-artifacts/`、`contest_*/`、`runs/`），彼此不重疊，因此不另加 prefix，DB 內的 key 不變。
- 移除 object tagging：目前沒有任何 lifecycle 規則使用這些 tag。證據刪除維持管理介面的 purge，不新增自動清理。
- dcslab 轉換：在 app 停止時以 `mc mirror` 把舊 bucket（`markdown-images`、`anticheat-raw`、`ai-artifacts`，以及另外設定過的 integrity archive bucket）複製到新 bucket，key 不變；完成後比對物件數量與總大小；舊 bucket 保留不刪。
- 本地 dev 同樣使用 bundled MinIO。

## 8. Addon

- `deploy/addons/storage`（MinIO）與 `deploy/addons/media`（LiveKit）各自是獨立 compose project，image 固定版本。
- media 使用 LiveKit 內建 TURN（`turn.external_tls`），不另跑 coturn：relay 直接進 SFU，TURN 帳密由 LiveKit API key 推導，不需要 TURN secret 與憑證；LiveKit 預設拒絕 relay 到 loopback、私有、link-local 與 multicast 位址。coturn 在 Docker bridge 上會把等於 `external-ip` 的 peer 改寫成自己，無法 relay 到 LiveKit，因此不採用。
- `qjudge upgrade` 不會重啟 addon；addon 用 `qjudge addon <name> up` 啟動或套用新版（image 版本寫在 addon compose）。
- `qjudge addon storage init`：建立 bucket。MinIO root 帳密就是 `OBJECT_STORAGE_ACCESS_KEY`／`OBJECT_STORAGE_SECRET_KEY`；CORS 以 MinIO 的 `MINIO_API_CORS_ALLOW_ORIGIN` 設為 origin。`.env` 的值由 `qjudge init`（第 5 階段）產生。
- 本地 dev 的 overlay 以 `extends` 引用 storage addon 的服務定義，MinIO 跑在 dev project 內。
- `qjudge addon media init`：產生 LiveKit API key／secret，並寫入 `.env`。
- `qjudge addon media up`：產生 `secrets/livekit.json`，只在內容變動時重建 LiveKit。
- `external` 模式不啟動 addon，只使用 `.env` 的連線設定。

## 9. CLI

| 指令 | 行為 |
|---|---|
| `init` | 新安裝：詢問 origin、反向代理位置、storage／media 模式，產生機密，寫出 `.env` |
| `check` | 驗證 `.env`，一次列出所有錯誤 |
| `ingress` | 列出需要設定的入口 |
| `upgrade <ref>` | 升級 |
| `rollback` | 回到上一版 |
| `addon <name> init|up` | 初始化或啟動 addon（見第 8 節） |

### `upgrade <ref>`

1. `git checkout <ref>`，`qjudge check`。
2. 以 `sha-<12>` 為 tag build image（舊服務持續運作）。
3. `pg_dump` 備份 `online_judge` 與 `qjudge_ai` 到 `deploy/backups/`，保留最近 10 份。
4. 執行 `migrate`、`ai-migrate`。
5. `up -d`。
6. 健康檢查：經 frontend 內網位址帶 `Host` 打 `/api/health/`，AI 與 Integrity ready。
7. 把目前與上一版 SHA 寫入 `deploy/.version`；清理 image 只保留最近 3 版。

失敗處理：第 5 步之前任一步失敗，checkout 回上一版後結束（服務未變動）；第 5 步之後失敗，checkout 回上一版並以上一版 image 重新 `up`。DB 不自動還原。

migration 必須能與上一版程式碼共存；不能共存的變更，rollback 時需手動還原 DB：`pg_restore --clean --dbname <db> deploy/backups/<id>/<db>.dump`。

### `rollback`

checkout `deploy/.version` 記錄的上一版，以本機 image `up`。

## 10. CI 與 CD

- CI 保留現有 static checks 與 unit job；新增 compose 預設值 lint 與 `.env.example` 一致性檢查。
- E2E：`qjudge init --non-interactive` → `qjudge upgrade <sha>`（疊加 `ci/compose.fakes.yml`）→ seed → 在 runner 上執行 Playwright，目標為 frontend。
- CD：確認 SHA 的 CI 成功 → Tailscale 加入 tailnet → SSH 到 dcslab → `deploy/qjudge upgrade <sha>`。

## 11. dcslab 轉換

1. 備份 `online_judge`、`qjudge_ai`、`.env`、`secrets/`。
2. checkout 新版，`.env` 與 `secrets/` 移到 `deploy/`，依第 3 節改寫 `.env`（`COMPOSE_PROJECT_NAME=qjudge-app`、`STORAGE_MODE=bundled`、`MEDIA_MODE=bundled`，沿用現有 DB 密碼、MinIO 與 LiveKit 的 credential 與網域；DB 密碼若含非英數字需先以 `ALTER ROLE` 更換）。
3. 轉換前：`.env` 移除 `LIVEKIT_TURN_SECRET`；準備 TURN 網域的代理設定，把現行 coturn + HAProxy SNI passthrough 改為在 443 終止 TLS（憑證沿用主機 lineage `qjudge-media`，續期後 reload 代理），以純 TCP 轉到 LiveKit TURN `5349`，於維護時段套用。
4. 維護時段：停止 QJudge app 服務；停掉舊的 MinIO、LiveKit 與 coturn compose，改以 addon 啟動（沿用資料目錄、網域、port、API key／secret），addon 掛到新的 `qjudge` network，並套用第 3 步的 TURN 代理設定。確認固定版本 MinIO image 能以既有資料 `/mnt/data/qjudge-data/minio` 正常啟動；恢復服務前，對 bundled media addon 做 relay-only TURN 測試（瀏覽器 `iceTransportPolicy: "relay"`，UDP 3478 與 TLS 443 各一次）。
5. 建立新 bucket，執行一次性複製腳本並比對數量與總大小。
6. `qjudge check` → `qjudge upgrade <sha>`。
7. 驗收登入、評測、Integrity、監考、AI、MCP、圖片與證據上傳下載。
8. 驗收後手動移除舊 network `online_judge_oj_network`，並刪除 plan 05 驗證時在正式 MinIO 建立的空 bucket `qjudge-dev`。

## 12. 文件

- 公開部署文件改寫為 `init`／`check`／`ingress`／`upgrade`，加入「反向代理在另一台機器」與 `STORAGE_MODE`／`MEDIA_MODE` 說明。
- 更新 `qjudge-env-compose-owner` skill、`environment-matrix.md`、`qjudge-dc.sh`、`CLAUDE.md`。

## 13. 實作階段

1. schema、`check`、`.env.example` 產生、env helper（空字串視為未設定）。
2. compose 與 DB：`deploy/`、base + build + dev overlay、migrate 服務、DB 連線（pgbouncer、URL、initdb、pool 常數）、app 由 origin 推導與 `MEDIA_MODE`、compose lint、本地 dev 切換。
2.5. app env 瘦身：沒有部署者設定的 env 改為程式常數。
3. frontend 與 `ingress`。
4. storage 簡化、單一 bucket、storage 與 media addon。
5. `init`、`upgrade`、`rollback`，CD 改寫。
6. CI E2E 全新安裝，刪除 test compose。
7. 文件與 skill。
8. dcslab 轉換，刪除舊檔案。

第 1 到 7 階段期間，dcslab 仍以舊流程部署從 main 分出的 hotfix；dev 不併入 main。
