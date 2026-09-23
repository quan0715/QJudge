# 部署與設定管理重構設計

日期：2026-09-23
狀態：設計定案，待實作計畫

## 1. 目標與範圍

### 要解決的問題

- 同一條設定規則分散在 bash（`setup-env.sh`、`deploy-prod.sh`）、Python（`qjudge-deploy.py`、`prepare-prod-release-env.py`）、compose 內插與 Django settings。新增一個 key 最多要改 9 個檔案。
- compose 的 52 個 `:-default` 中有 29 個與 app 預設重複，部分不一致（例如 `OBJECT_STORAGE_OBJECT_TAGGING_ENABLED` 的 compose 預設讓 settings 的供應商判斷在 prod 失效）。
- prod 在主機上 build 並覆蓋 `oj-backend:prod`，失敗時無法 rollback。
- dev／test／prod 三份 compose 各自維護服務定義與 env 清單；test 服務改名並與 dev 共用 project name。
- E2E 使用 Vite dev server 與 `runserver`，沒有驗證 gateway 路由與 prod 啟動方式。

### 定案決定

| 項目 | 決定 |
|---|---|
| 部署對象 | 自己的 prod 與外部自架者走同一套安裝／升級流程；prod 只多一個 GitHub CD 觸發 |
| 機密 | 保留主機 `.env` 與 `secrets/`，由 schema 驗證，每次升級備份 |
| 設定管理 | 精簡版：schema 只存在 CLI、只描述客戶會碰的 key；app settings 持有行為預設值；compose 只傳遞 |
| 入口 | 前端容器改為 `gateway` 單一入口（含 `/mcp`），支援反向代理在另一台機器 |
| Storage | 只使用 S3 核心 API，合併為單一 bucket 以 prefix 區分 |
| 基礎依賴 | MinIO 與 LiveKit／coturn 各自支援 `bundled`／`external`；bundled 以獨立 addon（獨立 compose project 與生命週期）提供，`qjudge upgrade` 不碰 addon |
| 環境 | 只保留 prod 形狀（`deploy/compose.yml`）與 dev overlay；刪除 test compose；E2E 只在 CI 做全新安裝驗收 |
| Image | 本次維持主機 build，但以 git SHA 標記並保留最近 3 版以支援 rollback |
| 升級 | `qjudge upgrade`：build 先於停機、備份、身分比對、獨立 migrate、smoke、失敗自動退回程式碼 |

### 不在本次範圍（後續 image 階段）

- CI build 並推送 GHCR、部署改為 pull。
- semver release 與 GitHub Release。
- 輕量 bundle（主機不需 git）。
- judge image 版本化（本次維持 GHCR `:latest` pull 與本機 fallback）。

本次設計必須讓後續切換只需修改 image 前綴並停用 `compose.build.yml`。

### 不可破壞的限制

- prod 為 dcslab（`/mnt/data/qjudge-app`），原地轉換，不做主機搬遷。
- compose project `qjudge-app`、volume key 與外部 network `online_judge_oj_network` 不變，資料 volume 必須沿用；每次升級都做身分比對。
- dcslab 上的 MinIO 資料目錄 `/mnt/data/qjudge-data/minio` 與 LiveKit／coturn 的網域、port、secret 必須沿用；兩者改由 addon 管理時只允許在維護時段短暫重啟。
- 不自動刪除舊 bucket、舊備份或 volume。

## 2. 目錄結構

```
deploy/                         部署所需全部檔案；未來 bundle 即此目錄
  compose.yml                   唯一服務定義（prod 形狀），只有 image:
  compose.build.yml             6 個自建 image 的 build context（本次 prod／自架／CI 皆疊加）
  addons/
    storage/compose.yml         MinIO（取代 docker-compose.migration.yml）
    media/                      LiveKit + coturn + TLS／SNI 設定（取代 scripts/livekit/vps 與主 compose 的 livekit／coturn）
  gateway/                      gateway nginx 樣板
  qjudge                        CLI 入口
  qjudge_cli/                   schema.py、指令實作、ingress nginx 範本
  .env.example                  由 schema 產生
  .env  secrets/  backups/  state.json   主機專屬，gitignore
compose.dev.yml                 dev overlay（repo 根目錄）
ci/compose.fakes.yml            只新增 fake-ai-adapters，供 CI E2E 使用
```

於第 12 節第 8 階段刪除：`docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.test.yml`、`docker-compose.migration.yml`（內容移入 storage addon）、`docker-compose.monitoring.yml` 與 `monitoring/`（不再提供）、`loadtest/docker-compose.loadtest.yml`、`scripts/livekit/`（內容移入 media addon）、`frontend/Dockerfile.e2e`、`scripts/deploy-prod.sh`、`scripts/setup-env.sh`、`scripts/prepare-prod-release-env.py`、`scripts/qjudge-deploy.py`、`scripts/check-compose-config.sh`、`scripts/bootstrap_ai_oauth_keys.py`、`scripts/bootstrap_integrity_secrets.py`（功能併入 CLI）。

壓測保留 `loadtest/` 的 Locust 腳本；壓測環境以 CI E2E 相同的全新安裝腳本建立，settings 改為 `config.settings.loadtest`，Locust 只需目標網址。`Makefile` 的 monitor／loadtest target、`scripts/check-compose-config.sh`、`ci.yml` 路徑、`ai-service/tests/contract/test_compose_boundaries.py` 與 `docs/loadtest.md` 同步更新。

## 3. 設定 schema（`deploy/qjudge_cli/schema.py`）

Python 標準函式庫實作，主機只需 `python3`。

### 每個 key 的欄位

- `name`、`type`（str／bool／int／url／origin／ip-list／enum）
- `required`：`True`、`False` 或條件函式（例如 `MEDIA_MODE == "bundled"`）
- `secret`：遮蔽輸出、由 `init` 產生或提示輸入
- `generated`：`init` 自動產生，客戶只需備份
- `managed`：由 CLI 偵測並寫入（例如 Docker socket GID），客戶不應手改
- `feature`：所屬功能（core、storage、media、ai、oauth、smtp、mcp、tunnel）
- `consumers`：傳遞給哪些服務群組（django、ai、gateway、mcp、integrity，以及 addon 的 storage、media）
- `renamed_from`：舊 key 名稱，升級時自動改寫
- `removed`：已廢除的 key，升級時移除並提示
- `advanced`：不出現在 `.env.example`，只出現在參考文件
- `ingress`：此功能需要的對外入口描述（供 `qjudge ingress` 使用）
- `validator`：格式驗證（origin 不含路徑、public storage 在 HTTPS origin 下必須 HTTPS、拒絕 placeholder 等）

schema 不寫 app 行為預設值。拓撲值（port、bind address、project name）例外，由 schema 與 compose 共同持有並由 lint 檢查一致。

### 客戶面的 key

最小部署：

- `QJUDGE_PUBLIC_ORIGIN`
- `STORAGE_MODE=bundled|external`
  - external：`OBJECT_STORAGE_ENDPOINT_URL`、`OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`、`OBJECT_STORAGE_ACCESS_KEY`、`OBJECT_STORAGE_SECRET_KEY`、`OBJECT_STORAGE_BUCKET`（預設 `qjudge`）
  - bundled：只需 `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`（瀏覽器可達的 HTTPS 網域）；endpoint、application key、bucket 由 storage addon 產生
- 反向代理在另一台機器時必填：`GATEWAY_BIND_ADDRESS`（VPS 內網 IP）、`QJUDGE_TRUSTED_PROXIES`（代理機器 IP）；同機時預設 `127.0.0.1`

拓撲：`COMPOSE_PROJECT_NAME`、`COMPOSE_PROFILES`、`GATEWAY_PORT`、`QJUDGE_NETWORK_NAME`／`QJUDGE_NETWORK_EXTERNAL`（advanced）

產生：`SECRET_KEY`、`POSTGRES_ADMIN_PASSWORD`、`DB_PASSWORD`、`AI_DB_PASSWORD`、`CREDENTIAL_LEASE_SECRET`，以及 `secrets/` 內的 AI OAuth 金鑰與 Integrity 機密；bundled addon 另產生 MinIO root 與 application credential、LiveKit API key／secret 與 TURN secret。

選用功能：

| 功能 | key |
|---|---|
| AI | `OPENAI_API_KEY`／`OPENAI_BASE_URL`、`DEEPSEEK_API_KEY`／`DEEPSEEK_BASE_URL`、`VLLM_API_KEY`／`VLLM_BASE_URL` |
| OAuth 登入 | `<PROVIDER>_OAUTH_CLIENT_ID`／`_CLIENT_SECRET` 成對、`QAUTH_PROVIDER_CONNECTIONS_JSON`（advanced） |
| SMTP | `EMAIL_HOST_USER`、`EMAIL_HOST_PASSWORD`；host／port advanced |
| Remote MCP | `QJUDGE_REMOTE_MCP_ENABLED` |
| Cloudflare Tunnel | `TUNNEL_TOKEN`（對應 profile `tunnel`） |
| 監考 | `MEDIA_MODE=disabled|bundled|external`；external：`LIVEKIT_PUBLIC_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`；bundled：`LIVEKIT_PUBLIC_URL`、`LIVEKIT_NODE_IP`、`LIVEKIT_TURN_HOST` |

### 改名與廢除（由 `renamed_from`／`removed` 處理）

| 舊 | 新 |
|---|---|
| `FRONTEND_PORT` | `GATEWAY_PORT` |
| `FRONTEND_BIND_ADDRESS` | `GATEWAY_BIND_ADDRESS` |
| `LIVE_MONITORING_ENABLED` + `LIVEKIT_DEPLOYMENT` | `MEDIA_MODE`（`local` 對應 `bundled`） |
| `OBJECT_STORAGE_REGION`、`OBJECT_STORAGE_AUTO_CREATE_BUCKETS`、`OBJECT_STORAGE_OBJECT_TAGGING_ENABLED` | 廢除 |
| `ANTICHEAT_RAW_BUCKET`、`INTEGRITY_ARCHIVE_BUCKET`、`MARKDOWN_IMAGE_S3_BUCKET`、`AI_ARTIFACT_S3_BUCKET` | 廢除，改用 `OBJECT_STORAGE_BUCKET` + 固定 prefix |
| `MCP_PUBLIC_URL` | 廢除，由 origin + `/mcp` 推導 |
| `LIVEKIT_INTERNAL_URL`（bundled 模式） | 廢除，由 addon 位址推導；external 模式仍可設定（advanced） |

### 推導規則的歸屬

各 app 自行由 `QJUDGE_PUBLIC_ORIGIN` 推導 issuer、CORS、CSRF、`ALLOWED_HOSTS`、MCP URL、OAuth redirect URI。compose 不再把 origin 複製成多個變數。`qjudge ingress` 與 app 使用同一組固定路徑常數；以測試確認兩者輸出一致。

### env 瘦身

盤點 backend 約 74 個、ai-service 43 個 env 讀取。沒有部署者需要設定的調校值（TTL、內部 bucket 名稱、room prefix 等）改為程式常數；仍需覆寫的保留為 advanced key。

## 4. Compose

### 疊加方式

- prod／自架：`deploy/compose.yml` + `deploy/compose.build.yml`（image 階段後移除後者）。
- dev：`deploy/compose.yml` + `deploy/compose.build.yml` + `compose.dev.yml`，project `qjudge-dev`。
- CI E2E：`deploy/compose.yml` + `deploy/compose.build.yml` + `ci/compose.fakes.yml`，每次獨立 project。

`qjudge-dc.sh` 改為 `dev` 與 `main` 兩個入口，自動帶入 `-p` 與 `-f`；dev 固定匯出 `QJUDGE_VERSION=dev`。

### base 規則

- 所有自建服務 `image: ${QJUDGE_IMAGE_PREFIX:-qjudge}/<name>:${QJUDGE_VERSION:?}`。
- 檔案開頭 `name: ${COMPOSE_PROJECT_NAME:-qjudge}`，避免目錄變更改變 project name。
- env 以 `x-*-environment` anchor 依服務群組定義一次；值一律 `${VAR}` 或 `${VAR:-}`。
- 移除所有 `container_name`。
- `frontend` 服務改名為 `gateway`。
- `migrate`（backend）與 `ai-migrate` 為一次性服務，backend 啟動指令不再執行 migrate。
- base 只包含 QJudge 應用；MinIO、LiveKit、coturn 不在 base。唯一 profile 為 `tunnel`，由 `.env` 的 `COMPOSE_PROFILES` 控制，直接 `docker compose up` 即可得到正確服務集合。
- 移除 prod ai-service 的 `./ai-service:/app` 原始碼掛載。

### dev overlay 只覆寫

程式碼來源（bind mount）、熱重載指令、對 localhost 開放的 port、`DJANGO_SETTINGS_MODULE=config.settings.dev`、Storybook 服務、前端改用 Vite dev server。

### lint（CI）

- compose 內不得出現 `:-<非空值>`，拓撲 key 例外清單由 schema 提供。
- compose 引用的變數必須全部在 schema 內。
- `.env.example` 必須與 schema 產生結果一致。

## 5. Gateway

nginx 容器負責所有 HTTP 路徑：SPA、`/api`、`/o`、`/.well-known`、`/admin`、`/django-admin`、`/static`、`/media`、`/mcp`。

- 只接受 `QJUDGE_TRUSTED_PROXIES` 來源連線（`allow`／`deny`）。
- `set_real_ip_from` 設為 trusted proxies，轉發真實 IP；`X-Forwarded-Proto` 只信任代理傳入值，移除寫死的 `https`。
- 設定以 nginx 官方 image 的 envsubst template 機制產生，不需要自訂 entrypoint。
- 客戶反向代理只需一條 `proxy_pass` 到 `GATEWAY_BIND_ADDRESS:GATEWAY_PORT`，並關閉 SSE 路徑 buffering。

### `qjudge ingress`

依 `.env` 啟用的功能輸出：

- HTTP 單一路由：主網域 → gateway。
- 需要獨立 hostname：MinIO 公開端點（保留 `Host`、上傳大小、關閉 request buffering）、bundled LiveKit 信令（WebSocket）與 TURN TLS。
- 非 HTTP：LiveKit UDP `50000-50099`、TCP `7881`、TURN `3478` 與 relay 範圍；說明 VPS 有公網 IP 時直接開放，否則由客戶路由器 DNAT，`LIVEKIT_NODE_IP` 填對外公網 IP；TURN DNS 不可經 proxy。
- 在代理機器上執行的驗證指令，例如 `curl -H 'Host: judge.example.edu' http://10.0.0.5:8080/api/health/`。
- `--nginx`：輸出客戶反向代理可參考的 server block。

## 6. Object storage

- 只使用 Get／Put／Head／Delete／List／presigned URL／checksum。
- region 固定 `us-east-1`（R2 視為 `auto` 的別名）。
- 執行期不建立 bucket；刪除 `markdown_image_storage.py` 與 ai-service `s3_artifact_store.py` 的建 bucket 邏輯。
- 單一 bucket，固定 prefix：`markdown/`、`integrity/`、`ai-artifacts/`（實作時盤點其他使用者並補齊）。DB 內保存的 `object_key` 不含 prefix，由 storage 存取層加上，不改寫資料。
- 監考證據改用 app 端清理：移除 upload `cleanup=true` 與 `retain=true` tagging；Celery beat 定期刪除未被保留且超過保存期限的物件，保留判斷以 DB 為準。R2 與 MinIO 行為一致。
- `qjudge storage check`：HeadBucket；external 模式下不存在時嘗試 CreateBucket，無權限則提示客戶手動建立；bundled 模式由 storage addon init 建立 bucket、application key 與 CORS；兩者都以測試物件驗證 Put／Get／Delete 與 presigned URL。
- `qjudge storage migrate`：伺服器端 CopyObject 將舊 bucket 物件複製到新 bucket 對應 prefix，比對數量與大小；增量執行，已存在且大小相同的物件跳過，因此可先做一次完整複製、升級前再補齊差異；不刪除舊 bucket。

## 6.1 基礎依賴 addon

### 模式

| 依賴 | `.env` | 模式 |
|---|---|---|
| Object storage | `STORAGE_MODE` | `bundled`：storage addon 的 MinIO；`external`：R2、學校 MinIO 等任何 S3 相容服務 |
| 監考 media | `MEDIA_MODE` | `disabled`；`bundled`：media addon 的 LiveKit + coturn；`external`：既有 LiveKit |

### addon 規則

- 每個 addon 為 `deploy/addons/<name>/`，有獨立 compose project（`qjudge-storage`、`qjudge-media`）與固定 image 版本；image 以 release tag 加 digest 固定，不使用 `latest`。
- `qjudge upgrade` 只處理應用 project，不 recreate、不重啟 addon。addon 以 `qjudge addon <name> init|up|status|upgrade|backup` 管理，升級時段由管理者決定。
- addon 設定寫在同一份 `deploy/.env` 與同一份 schema；`check`、`doctor`、`ingress` 涵蓋 addon。
- bundled 模式自動對接：
  - storage：MinIO 以應用 network 別名 `minio` 提供 `http://minio:9000`；init 建立 root credential（只供 addon 使用）、QJudge 專用 application key（只允許該 bucket）、bucket 與 CORS（origin 取自 `QJUDGE_PUBLIC_ORIGIN`）。
  - media：init 產生 LiveKit API key／secret 與 TURN secret，同時供 addon 與應用使用；LiveKit 與 coturn 使用 host networking；TLS 與 SNI 分流（HAProxy／nginx／certbot）的設定由 addon 提供範本，實際 ingress 由 `qjudge ingress` 列出。
- addon 可部署在另一台主機：在該主機 clone repo，只執行 `qjudge addon <name>`；應用端改用 external 模式並填入 addon 輸出的連線資訊。
- 備份：`qjudge backup` 只含 DB、`.env`、`secrets/`；storage addon 提供 `qjudge addon storage backup`（mirror 到管理者指定位置）；`doctor` 在 bundled storage 未設定 mirror 時警告。
- MinIO 社群版的 image 發布與授權狀態需在實作時確認；app 只依賴 S3 核心 API，必要時可替換為其他 S3 相容實作而不影響應用。

## 7. CLI（`deploy/qjudge`）

| 指令 | 行為 |
|---|---|
| `init` | 新安裝；詢問反向代理是否同機、storage、公開 origin；產生機密與金鑰；寫出 `.env`；已有 `.env` 則拒絕 |
| `check` | 依 schema 靜態驗證 `.env`，一次列出所有錯誤；exit code 0／1；`--json` |
| `doctor` | 執行期檢查：容器狀態、一次性服務結果、內部健康、入口可達性、DB role 權限；不輸出機密 |
| `ingress [--nginx]` | 見第 5 節 |
| `config show <service>` | 顯示服務實際收到的 env，機密遮蔽 |
| `upgrade <ref> [--yes]` | 見第 8 節 |
| `rollback [--to <sha>]` | 見第 8 節 |
| `backup` / `backup restore <id>` | 手動備份與還原；還原必須互動確認或 `--yes` |
| `storage check` / `storage migrate` | 見第 6 節 |
| `addon <storage|media> init|up|status|upgrade|backup` | 見第 6.1 節 |

`.env` 的讀寫只由 CLI 的單一 parser 處理，改寫時保留註解與順序，並先備份。

## 8. 升級與回退

### `upgrade <ref>`

1. 取得 `deploy/.upgrade.lock`；檢查 git 工作區乾淨、ref 存在、Docker 可用、磁碟空間。
2. checkout 目標 ref，re-exec 目標版本的 CLI 繼續執行。
3. 以目標版本 schema 套用 `renamed_from`／`removed`，顯示 diff；驗證失敗則 checkout 回原版並中止，服務未變動。
4. 以 `sha-<12>` 為 tag build 6 個 image；舊服務持續運作。
5. 備份：`pg_dump`（custom format、`pg_restore --list` 驗證）、`.env`、`secrets/` → `backups/<UTC 時間>_<舊 sha>/`，附 sha256；保留最近 N 份（預設 10）；提示異地保存。
6. 身分比對：解析出的 project、volume 完整名稱、network 必須與執行中服務相同，否則中止。
7. 執行 `migrate` 與 `ai-migrate`；失敗則中止並列出已套用 migration，舊服務仍在運作。
8. `up -d` 切換到新版。
9. smoke：必過項目為 VPS 端經 gateway 內網位址帶 `Host` 的 `/api/health/`、AI ready、Integrity ready；公開網域檢查失敗只警告。
10. smoke 失敗：以上一版 SHA 的本機 image 自動 `up`，checkout 回上一版；DB 不自動還原，輸出手動還原指令。
11. 寫入 `deploy/state.json`（current、previous、history、本次套用 migration）；清理自建 image，只保留最近 3 版。

整個流程輸出同時寫入 `backups/<id>/upgrade.log`。

### `rollback`

- 預設退回 `state.json` 的 previous；`--to` 指定其他仍存在於本機的版本。
- checkout 對應 ref 後以本機 image `up`，不 build。
- 若目標版本早於已套用的 migration，警告並要求確認。

### expand／contract 規範

- 刪欄位、改名、刪 model 必須分兩個版本：先停止使用，再移除。
- CI lint：migration 含 `RemoveField`、`RenameField`、`DeleteModel`、`RenameModel` 時，PR 需帶 `destructive-migration` label。
- 規範寫入 `qjudge-github-workflow-owner` skill。

### DB bootstrap

`deploy-prod.sh` 內建立 `qjudge_admin` 與驗證應用 role 權限的 SQL 改為一次性 `db-bootstrap` 服務，於 migrate 前執行；`doctor` 檢查應用 role 不具 superuser／createdb／createrole。

## 9. CI 與 CD

### CI

- 保留現有 static checks 與各服務 unit job。
- 單元測試在本機改於 dev 容器內執行。`settings.test` 使用獨立 Redis DB index 與 eager Celery；確認 ai-service pytest 使用獨立測試資料庫。
- 新增 lint：compose／schema 一致性、`.env.example` 產生結果、destructive migration label。
- E2E（取代 `docker-compose.test.yml` 相關 workflow）：
  1. 產生 CI 用 `.env`（`settings.test`、fake 外部服務、隨機機密）。
  2. `qjudge init --non-interactive` → `qjudge upgrade <sha> --yes`，疊加 `ci/compose.fakes.yml`。
  3. seed E2E 資料。
  4. 在 runner 上執行 Playwright，目標為 gateway。
- 本機重現 E2E：執行與 CI 相同的腳本，建立臨時 project 並於結束時刪除。

### CD（`cd-prod.yml`）

確認 SHA 的 main CI（含 E2E）成功 → 以 OAuth client 加入 tailnet（`tag:ci`）→ 以 OpenSSH 經 tailnet 連線 → 執行 `deploy/qjudge upgrade <sha> --yes`。不再上傳腳本，不再使用 `tailscale ssh`。

- 主機加入 tailnet 並標記 `tag:qjudge-prod`；Tailscale ACL 只允許 `tag:ci` 連到 `tag:qjudge-prod` 的 TCP 22。
- 主機建立專用 `deploy` 帳號（屬於 docker group），部署 key 在 `authorized_keys` 設定 forced command 與 `restrict`，只能執行 `qjudge upgrade`，SHA 由 `SSH_ORIGINAL_COMMAND` 解析並驗證為 40 碼 hex。
- known_hosts 以 GitHub environment secret 固定。
- GitHub environment `production` secrets：`TS_OAUTH_CLIENT_ID`、`TS_OAUTH_SECRET`、`PROD_SSH_HOST`、`PROD_SSH_KNOWN_HOSTS`、`PROD_DEPLOY_SSH_KEY`、`PROD_DEPLOY_PATH`。
- 連線方式與部署邏輯分離；若未來改為直接 SSH 或單位 VPN，只替換連線步驟。

## 10. dcslab 一次性轉換

不提供 adopt／import 類指令；轉換只在 dcslab 手動執行一次，外部既有安裝依 release notes 做相同步驟。

1. 以舊流程做一次完整備份（DB dump、根目錄 `.env`、`secrets/`），另存主機外。
2. checkout 新版後，`mv .env deploy/.env`、`mv secrets deploy/secrets`（保留權限）。
3. 確認 `deploy/.env` 含 `COMPOSE_PROJECT_NAME=qjudge-app`、`QJUDGE_NETWORK_EXTERNAL=true`、`STORAGE_MODE=bundled`、`MEDIA_MODE=bundled`，並填入現有 MinIO 與 LiveKit／coturn 的 credential、網域與 secret（沿用，不重新產生）。
4. `qjudge check`：列出需要的改名與缺漏；改名由第一次 `upgrade` 自動套用。
5. 盤點 dcslab 上目前 MinIO（`docker-compose.migration.yml`）與 LiveKit／coturn 的實際部署：compose project、設定與 secret 路徑、port、TLS／SNI 設定。維護時段內以 addon 取代：`qjudge addon storage up`（資料目錄沿用 `/mnt/data/qjudge-data/minio`）、`qjudge addon media up`（網域、port、secret 沿用），確認後停止舊的 compose project。
6. `qjudge addon storage init` 只補建新 bucket 與 application key（已存在者不覆寫），`qjudge storage check`，`qjudge storage migrate` 完整複製。
7. 選定正式考試以外的時段執行 `qjudge upgrade <sha>`；第一次執行時若沒有 `state.json`，以目前 HEAD 建立，身分比對改以 compose project label 找出執行中的服務。`upgrade` 前再執行一次 `storage migrate` 補齊差異。
8. 驗收登入、評測、Integrity、監考、AI、MCP、圖片與證據上傳下載。

第一次升級前的舊 image 沒有 SHA tag，`qjudge rollback` 無法回到轉換前版本。轉換失敗時的回退方式：checkout 舊版、將 `.env` 與 `secrets/` 移回根目錄、以舊 `deploy-prod.sh` 流程啟動；DB 依需要以步驟 1 的備份還原。

## 11. 文件與 agent 指引

- 公開部署文件（`frontend/public/docs/zh-TW/deployment*.md`）改寫為 `init`／`check`／`ingress`／`upgrade` 流程，新增「反向代理在另一台機器」章節。
- `docs/operations/production-configuration.md` 改為由 schema 產生的設定參考。
- `frontend/public/docs/zh-TW/deployment-storage.md` 與監考部署文件改寫為 `STORAGE_MODE`／`MEDIA_MODE` 兩種模式；`scripts/livekit/vps/README.md` 的維運內容移入 media addon 文件。
- 更新 `qjudge-env-compose-owner` skill、`environment-matrix.md`、`qjudge-dc.sh`、repository `CLAUDE.md` 的 `main|dev|test` 說明。
- 更新 agent memory 中關於 test 環境與共用 project name 的紀錄。

## 12. 實作階段

各階段完成後系統可運作：

1. **Schema 與 CLI 基礎**：`schema.py`、`.env` parser、`check`、`config show`、`.env.example` 產生、compose lint。schema 先描述現有 key，後續階段每次改名或廢除 key 時同步加入 `renamed_from`／`removed`。
2. **Compose 重組**：`deploy/` 目錄、base + build + dev overlay、移除 `container_name`、獨立 migrate／db-bootstrap、profiles、移除 prod 原始碼掛載；app settings 改由 origin 推導、env 瘦身。
3. **Gateway**：改名、trusted proxies、`/mcp`、`ingress`。
4. **Storage 與 addon**：核心 API、單一 bucket prefix、app 端清理、`storage check`／`migrate`；storage 與 media addon、`STORAGE_MODE`／`MEDIA_MODE`；主 compose 移除 livekit／coturn。
5. **升級流程**：`init`、`upgrade`、`rollback`、`backup`、`doctor`；新版 CD workflow（Tailscale + OpenSSH forced command，目標為 dcslab）。
6. **測試與 CI**：刪除 test compose 與 `Dockerfile.e2e`、單元測試改在 dev 容器、CI E2E 全新安裝、migration lint。
7. **文件與指引**：公開部署文件、設定參考、skills、CLAUDE.md。
8. **dcslab 轉換與清理**：依第 10 節轉換；驗收後 CD 切換到新 workflow，刪除第 2 節列出的舊 compose 與腳本；舊 bucket 由管理者決定何時刪除。

第 2 到第 7 階段期間，舊的 `docker-compose.yml`、`deploy-prod.sh` 與 `cd-prod.yml` 保持可用，dcslab 仍以舊流程部署 hotfix。
