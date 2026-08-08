# QJudge 部署環境變數清理設計

日期：2026-08-08
狀態：待使用者審閱
目標分支：`dev`

## 1. 目標

目前根目錄的 `.env.example` 有 94 個啟用中的變數。Production Compose
實際引用 71 個，其中 20 個被 Compose 宣告為必填；`scripts/deploy-prod.sh`
另外把有預設值、已硬編碼或只屬於特定功能的項目也列為必填，最後要求 32
個值。部署者因此必須分辨應用設定、容器內部連線、外部服務憑證與真正的部署輸入。

本階段要把使用者維護的環境契約縮成三類：

1. 部署位置，例如使用者實際開啟的 public origin。
2. 無法由系統產生的外部服務 endpoint 與憑證。
3. 必須持久保存、但可由初始化程序產生的 secrets。

資源限制、TTL、queue 名稱、bucket 預設名稱、容器 DNS、檔案路徑與開發測試設定
回到版本控制內的 Django settings、service settings 或 Compose。這些值仍可在容器內以
environment variable 傳遞，但不再是部署者必須填寫的 `.env` 介面。

## 2. 範圍

### 2.1 本階段包含

- 保留一份最小的根 `.env.example`。
- 每台機器只維護一份不進 Git 的 active `.env`。
- 加入初始化與驗證入口，自動產生內部 secrets。
- 以單一 public origin 推導 frontend、OAuth、CORS、CSRF 與 allowed host。
- 移除 production deploy script 對固定值和選用功能的無條件要求。
- 讓 Tunnel、第三方 OAuth、Email、Cloudflare Realtime 與雲端 AI provider
  只在啟用時驗證。
- 以契約測試保護三份 Compose 與最小 env 介面。

### 2.2 本階段不包含

- MinIO Compose overlay 與 R2 live smoke test。
- AWS EC2 操作文件或實際 EC2 部署。
- HTTPS、Cloudflare Tunnel 或 OAuth 的完整部署章節。
- 刪除仍在使用的 application feature。
- 導入 Vault、AWS Secrets Manager、SOPS 或 Kubernetes Secrets。

上述項目會沿用本階段建立的環境契約，在後續部署附錄中補上。

## 3. 使用方式

Repository 只保留一份 `.env.example`。不同部署方式不是不同 env schema，而是初始化
時的兩個正交選項：

```bash
./scripts/setup-env.sh --target self-hosted --storage r2
./scripts/setup-env.sh --target self-hosted --storage minio
./scripts/setup-env.sh --target cloud-vm --storage r2
./scripts/setup-env.sh --target cloud-vm --storage minio
```

第一階段先完成通用介面與現有 R2 路徑。`minio` 選項等 MinIO overlay 實作時才開放，
不能先接受參數再產生無法啟動的設定。

`setup-env.sh` 負責：

- 驗證 target、storage 與 public origin；
- 在 `.env` 不存在時由 `.env.example` 建立；
- 以密碼學安全亂數產生 Django、PostgreSQL 與 credential lease secrets；
- 產生只含 URL-safe 字元的資料庫密碼；
- 不把 secret 印到終端；
- 不覆寫既有 `.env`，除非使用者明確傳入 `--force`；
- 完成後執行 `docker compose config --quiet`。

`scripts/deploy-prod.sh` 保留給 CD，但縮成部署包裝：檢查 active `.env`、準備 OAuth
signing key、render Compose、啟動服務與執行 smoke check。手動部署文件不要求使用者透過
這支 script 才能啟動系統。

## 4. 最小環境契約

根 `.env.example` 的啟用項目預計縮成下列結構：

```dotenv
# 使用者輸入
QJUDGE_PUBLIC_ORIGIN=http://judge.example.test

# setup-env.sh 產生
SECRET_KEY=
POSTGRES_ADMIN_PASSWORD=
DB_PASSWORD=
AI_DB_PASSWORD=
CREDENTIAL_LEASE_SECRET=

# 外部 S3-compatible storage；MinIO 實作後可由初始化程序產生
OBJECT_STORAGE_ENDPOINT_URL=
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
```

AI provider、Tunnel、第三方 OAuth、Email 與 Cloudflare Realtime 使用註解範例呈現，
不形成最小部署的必填欄位。啟用功能後，驗證器才要求該組欄位完整。

### 4.1 Public origin 推導

`QJUDGE_PUBLIC_ORIGIN` 必須是完整 origin，不得包含 path、query 或 fragment。系統由它
推導：

- `FRONTEND_URL`；
- `OAUTH_ISSUER_URL`；
- `ALLOWED_HOSTS` 的 hostname；
- `CORS_ALLOWED_ORIGINS`；
- `CSRF_TRUSTED_ORIGINS`；
- `MARKDOWN_IMAGE_PUBLIC_BASE_URL`。

公開 Remote MCP 是選用能力。未啟用時，AI Service 繼續透過 Docker network 使用
`http://qjudge-mcp:9000/mcp`；啟用時才要求獨立的 `MCP_PUBLIC_URL`，且正式公開部署必須
使用 HTTPS。

### 4.2 資料庫設定

資料庫名稱與角色固定為版本控制內的安全預設：

- PostgreSQL bootstrap role：`qjudge_admin`；
- Django database／role：`online_judge`／`qjudge_web`；
- AI database／role：`qjudge_ai`／`qjudge_ai`。

三個密碼由初始化程序產生。`AI_DATABASE_URL` 由 Compose 使用固定 host、database、role
與 URL-safe password 組成，不再要求部署者手動同步 URL 和四個欄位。

## 5. 現有 94 個變數的處置

下列五組涵蓋目前 `.env.example` 的全部 94 個啟用項目。

### 5.1 保留並由初始化程序產生（5）

`SECRET_KEY`、`POSTGRES_ADMIN_PASSWORD`、`DB_PASSWORD`、`AI_DB_PASSWORD`、
`CREDENTIAL_LEASE_SECRET`。

它們留在 active `.env`，但部署者不需要手動編寫。

### 5.2 由單一 public origin 取代或推導（6）

`FRONTEND_URL`、`OAUTH_ISSUER_URL`、`MCP_PUBLIC_URL`、`ALLOWED_HOSTS`、
`CORS_ALLOWED_ORIGINS`、`CSRF_TRUSTED_ORIGINS`。

除 `MCP_PUBLIC_URL` 外，其餘五項由 `QJUDGE_PUBLIC_ORIGIN` 推導；
`MCP_PUBLIC_URL` 只有公開 Remote MCP 啟用時才保留為額外輸入。

### 5.3 外部服務輸入，依功能條件式保留（19）

| 功能 | 變數 | 規則 |
| --- | --- | --- |
| 第三方登入 | `NYCU_OAUTH_CLIENT_ID`、`NYCU_OAUTH_CLIENT_SECRET`、`GITHUB_OAUTH_CLIENT_ID`、`GITHUB_OAUTH_CLIENT_SECRET`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET` | 選用 provider 啟用時成對要求 |
| AI provider | `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`DEEPSEEK_BASE_URL`、`OPENAI_BASE_URL` | AI 未啟用時不要求；本地 OpenAI-compatible gateway 可只設定 base URL 與其需要的 token |
| Object storage | `OBJECT_STORAGE_ENDPOINT_URL`、`OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`、`OBJECT_STORAGE_ACCESS_KEY`、`OBJECT_STORAGE_SECRET_KEY` | 現階段 R2 路徑必填；MinIO 路徑後續自動產生 |
| Tunnel | `TUNNEL_TOKEN` | 只有 tunnel profile 啟用時要求 |
| Cloudflare Realtime | `CLOUDFLARE_REALTIME_APP_ID`、`CLOUDFLARE_REALTIME_APP_SECRET` | live monitoring 功能啟用時成對要求 |
| SMTP | `EMAIL_HOST_USER`、`EMAIL_HOST_PASSWORD` | SMTP 寄信啟用時成對要求 |

### 5.4 移出根環境契約（58）

| 去向 | 變數 |
| --- | --- |
| Compose／settings 固定 runtime | `DJANGO_ENV`、`DJANGO_SETTINGS_MODULE`、`DEBUG`、`DB_HOST`、`DB_PORT`、`REDIS_URL`、`AI_SERVICE_URL`、`AI_REDIS_URL`、`AI_QUEUE_NAME`、`AI_QUEUE_KEY_PREFIX`、`AI_OAUTH_SIGNING_PRIVATE_KEY_FILE`、`INTEGRITY_CONTROLLER_URL`、`INTEGRITY_CONTROLLER_TOKEN_FILE`、`INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE` |
| 固定 database identity 或推導值 | `POSTGRES_ADMIN_USER`、`DB_NAME`、`DB_USER`、`DB_SSLMODE`、`DB_CONN_MAX_AGE`、`AI_DB_NAME`、`AI_DB_USER`、`AI_DATABASE_URL` |
| Host／Compose 自動偵測 | `HOST_PROJECT_ROOT`、`INTEGRITY_WORKER_NETWORK`、`INTEGRITY_WORKER_NETWORK_DEV`、`INTEGRITY_WORKER_NETWORK_TEST`、`DOCKER_GID`、`DOCKER_SOCKET_UID` |
| Judge／Integrity 版本控制設定 | `JUDGE_ENGINE_ENABLED`、`JUDGE_MAX_CPU_TIME`、`JUDGE_MAX_MEMORY`、`DOCKER_IMAGE_JUDGE`、`DOCKER_JUDGE_PIDS_LIMIT`、`DOCKER_JUDGE_TMPFS_SIZE`、`DOCKER_JUDGE_TIMEOUT`、`INTEGRITY_WORKER_IMAGE` |
| Object storage 供應商預設或應用設定 | `OBJECT_STORAGE_REGION`、`OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS`、`OBJECT_STORAGE_OBJECT_TAGGING_ENABLED`、`OBJECT_STORAGE_AUTO_CREATE_BUCKETS`、`ANTICHEAT_RAW_BUCKET`、`ANTICHEAT_CAPTURE_INTERVAL_SECONDS`、`INTEGRITY_ARCHIVE_MAX_BYTES`、`MARKDOWN_IMAGE_S3_BUCKET`、`MARKDOWN_IMAGE_MAX_BYTES`、`MARKDOWN_IMAGE_PUBLIC_BASE_URL`、`AI_ARTIFACT_S3_BUCKET`、`AI_ARTIFACT_MAX_BYTES` |
| 選用功能的非秘密設定 | `AUTH_EMAIL_PASSWORD_ENABLED`、`LIVE_MONITORING_ENABLED`、`LIVE_MONITORING_ROOM_PREFIX`、`CLOUDFLARE_REALTIME_API_BASE_URL`、`LIVE_MONITORING_PUBLISHER_TTL_SECONDS`、`DEFAULT_FROM_EMAIL`、`EMAIL_HOST`、`EMAIL_PORT` |
| Development override | `MCP_WIDGET_CLASSROOM_LIST_JS`、`MCP_WIDGET_EXAM_PROBLEM_PREVIEW_JS` |

「移出根環境契約」不等於刪除 application feature。一般部署者不再看到這些欄位；需要
調整的進階部署可修改版本控制內設定，或在對應的選用 profile 明確覆寫。

### 5.5 移至專用 loadtest 設定（6）

`LOADTEST_OBJECT_STORAGE_ENDPOINT_URL`、`LOADTEST_OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`、
`LOADTEST_OBJECT_STORAGE_REGION`、`LOADTEST_OBJECT_STORAGE_ACCESS_KEY`、
`LOADTEST_OBJECT_STORAGE_SECRET_KEY`、`LOADTEST_ANTICHEAT_RAW_BUCKET`。

它們移至 loadtest 文件旁的獨立範例，不再污染一般 deployment env。

## 6. 驗證與錯誤處理

初始化與部署驗證必須符合以下規則：

- 缺少真正必要的外部欄位時列出名稱，不輸出任何 secret value。
- public origin 格式錯誤、包含 path 或正式模式使用不允許的 scheme 時立即停止。
- OAuth、SMTP、Realtime 等成對憑證只填一半時立即停止。
- 沒啟用 Tunnel 時不得要求 `TUNNEL_TOKEN`。
- R2 使用 HTTPS；MinIO 後續允許 Docker internal HTTP，但 public endpoint 的安全要求由
  部署模式決定。
- 三個 PostgreSQL role 必須不同，application role 不得是 superuser 保留名稱。
- 初始化失敗不得留下看似可用的半成品 `.env`。
- 既有 `.env` 預設不可覆寫。

## 7. 測試策略

實作採 test-first，至少加入以下契約：

1. `.env.example` 不再包含 internal、dev、loadtest 與固定 config 項目。
2. 初始化可在 temporary directory 產生非 placeholder、彼此獨立的 secrets。
3. 初始化不覆寫既有 `.env`，也不在 stdout／stderr 洩漏 secrets。
4. 一個 public origin 能產生一致的 frontend、issuer、CORS、CSRF 與 allowed host。
5. 不設定 Tunnel、OAuth、Email、Realtime 或 AI key 時，最小設定仍可通過驗證。
6. 啟用選用功能但缺少相依欄位時，驗證會以穩定錯誤訊息失敗。
7. `AI_DATABASE_URL` 與固定 AI role／database 一致，且不需要使用者手動設定。
8. Main、dev、test Compose 均可 render；production service list 不含已移除的
   Recur、Grafana、GlitchTip。
9. PostgreSQL bootstrap 實際建立兩個隔離的 application database／role。
10. 後續 MinIO 與 R2 使用同一套 object-storage smoke contract。

## 8. 完成條件

- 根 `.env.example` 只留下最小部署輸入、generated secrets 與註解形式的選用項目。
- `scripts/deploy-prod.sh` 不再要求固定值、預設值或未啟用功能的憑證。
- 部署者不需要手動同步 public URL 衍生值或 `AI_DATABASE_URL`。
- 沒有 Tunnel、第三方 OAuth、Email、Realtime 與雲端 AI key 時，可以完成最小
  Compose validation。
- 所有新增契約測試先失敗、再由最小修改使其通過。
- 文件清楚區分使用者輸入、generated secret、版本控制設定與容器內部 wiring。
