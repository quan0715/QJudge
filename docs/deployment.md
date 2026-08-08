# QJudge 正式架設與部署指南

> 驗證狀態：環境變數契約、Docker Compose 設定與資料庫權限邊界已驗證；乾淨 Linux 主機的完整部署流程尚未驗證。

本文件是 QJudge 正式部署的主要入口。請依章節順序操作；物件儲存以外的外部服務都放在選用章節，不影響最小部署。

## 1. 適用範圍

這套流程支援兩種部署目標：

- `self-hosted`：學校、實驗室或個人管理的 Linux 主機。
- `cloud-vm`：雲端供應商提供的 Linux VM。

兩者使用同一份 QJudge 安裝流程。Cloud VM 只有建立主機、公開 IP、防火牆與磁碟等步驟不同；AWS EC2 的差異與實測狀態記錄在 [AWS EC2 部署差異](deployment/ec2.md)。

本指南不涵蓋開發環境與 CI。需要修改程式或執行測試時，請改讀 [Developer Guide](developer-guide.md)。

## 2. 最小部署架構

最小部署使用一台 Docker host。Docker Compose 會管理以下服務：

- PostgreSQL 與 PgBouncer
- Redis
- Django backend、frontend 與 Celery workers
- AI service、AI worker 與內部 MCP server
- Judge 與 exam integrity 相關服務

部署者另外提供一組 S3-compatible object storage。現階段 `setup-env.sh` 已支援並驗證 Cloudflare R2 的環境契約；其他方案的狀態請見 [S3-compatible Object Storage](deployment/object-storage.md)。

最小部署只需要 HTTP。公開網域、HTTPS、Tunnel、第三方 OAuth、外部 AI provider 與 Remote MCP 都是選用功能；未啟用時不應阻止核心服務啟動。

## 3. 部署前準備

主機需要 64-bit Linux、Git、Python 3、Python `cryptography`、Docker Engine、Docker Compose v2 與 curl。各服務的用途、自架／雲端選擇及主機資源檢查方式，請先閱讀 [部署前準備與服務選擇](deployment/prerequisites.md)。

先確認必要工具可用：

```bash
git --version
python3 --version
python3 -c 'import cryptography; print(cryptography.__version__)'
docker --version
docker compose version
curl --version
```

目前的登入帳號必須能操作 Docker。下列指令應正常回傳 server 資訊：

```bash
docker info
```

## 4. 取得 QJudge

在部署主機選擇專用目錄並 clone repository：

```bash
git clone https://github.com/quan0715/QJudge.git
cd QJudge
git rev-parse HEAD
```

正式部署應固定到 release tag 或明確的 commit SHA，不要直接依賴會持續變動的 branch。第一次驗證可先記錄目前 checkout 的 commit：

```bash
QJUDGE_REF="$(git rev-parse HEAD)"
printf '%s\n' "$QJUDGE_REF"
```

後續執行 `deploy-prod.sh` 時會強制切換到指定 ref。部署目錄只用來部署，不要在裡面保存未提交的修改。

## 5. 建立環境設定

根目錄的 `.env` 不進 Git，也不應由人工逐項複製範本。先準備 R2 的 S3 API endpoint 與最小權限 credential：

```bash
export OBJECT_STORAGE_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
read -r -p "R2 access key: " OBJECT_STORAGE_ACCESS_KEY
read -r -s -p "R2 secret key: " OBJECT_STORAGE_SECRET_KEY
printf '\n'
export OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY
```

執行初始化工具。自有主機範例：

```bash
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://HOST_OR_IP
```

Cloud VM 將 `--target` 改為 `cloud-vm`。`--origin` 必須是使用者實際開啟的 origin，只能包含 scheme、hostname 與選用的 port，不能包含路徑。

初始化工具會：

- 產生 Django、PostgreSQL、AI database 與 credential lease secrets。
- 偵測 repository 路徑及 Docker socket UID/GID。
- 以 `0600` 權限寫入 `.env`。
- 寫入前驗證 production Compose。
- 拒絕覆寫既有 `.env`，除非明確指定 `--force`。

`--force` 會重新產生 secrets。既有部署不可把它當成一般更新指令。

## 6. 啟動服務

先建立 exam integrity 服務需要的本機金鑰。腳本會保留已存在且格式正確的檔案：

```bash
python3 scripts/bootstrap_integrity_secrets.py
```

接著固定目前的 Git ref，交由 production 部署腳本驗證、建置與啟動：

```bash
QJUDGE_REF="$(git rev-parse HEAD)"
./scripts/deploy-prod.sh "$(pwd)" "$QJUDGE_REF"
```

腳本會執行下列工作：

1. 驗證 `.env` 與 public origin。
2. 強制切換到指定 Git ref。
3. 建立 AI OAuth signing key。
4. 驗證 Compose、準備 judge image 並建置 application images。
5. 啟動服務、確認資料庫角色權限，最後檢查 HTTP 首頁。

它也會清除未被容器使用的舊 image。若主機同時承載其他系統，部署前應先確認共用 Docker host 的維運政策。

## 7. 初始化系統

第一次啟動時，Compose 會依服務相依順序執行 PostgreSQL role/database bootstrap、AI migration 與 Django migration。確認一次性服務的退出狀態：

```bash
docker compose ps --all ai-db-bootstrap ai-migrate
```

兩者都應以 exit code `0` 完成。接著建立第一個管理者帳號：

```bash
docker compose exec backend python manage.py createsuperuser
```

如果 migration 或 bootstrap 沒有成功，先不要重建 volume。請依 [故障排除](deployment/troubleshooting.md) 查看對應服務的 log。

## 8. 驗收

### 8.1 容器與健康狀態

```bash
docker compose ps --all
curl --fail http://127.0.0.1/
curl --fail http://127.0.0.1:8000/api/health/
curl --fail http://127.0.0.1:8001/health/ready
```

持續執行的核心服務應為 running 或 healthy；`ai-db-bootstrap`、`ai-migrate` 與 `judge-image` 等一次性服務可以是成功結束狀態。

### 8.2 使用者流程

使用瀏覽器開啟 `QJUDGE_PUBLIC_ORIGIN`，依序確認：

1. 能以剛建立的管理者帳號登入。
2. 能建立最小題目並送出一筆評測。
3. Celery worker 能完成任務並回傳評測結果。
4. 能上傳並讀回一個 Markdown image 或其他使用 object storage 的檔案。
5. 產生的 presigned URL 能在有效時間內讀取，過期後不可繼續使用。

### 8.3 最小部署邊界

未設定公開 Tunnel、第三方 OAuth、AI provider key 與 Remote MCP 時，登入、題目管理、評測及 object storage 仍應運作。需要啟用選用功能時，再閱讀下一節對應文件。

## 9. 選用功能

- [部署前準備與服務選擇](deployment/prerequisites.md)：各服務功能、開源／雲端方案，以及 Cloud VM 與自有主機的差異。
- [S3-compatible Object Storage](deployment/object-storage.md)：R2 設定、共用契約及 MinIO 實作狀態。
- [AI 與 MCP](deployment/ai-and-mcp.md)：AI provider、內部 MCP 與 Remote MCP 的網路條件。
- [HTTPS 與 OAuth](deployment/https-and-oauth.md)：反向代理、Cloudflare Tunnel 與 OAuth 的 HTTPS 條件。
- [AWS EC2 部署差異](deployment/ec2.md)：EC2 特有準備與後續實測紀錄。
- [故障排除](deployment/troubleshooting.md)：依 env、Compose、migration、health 與 storage 排查問題。

## 10. 更新與停止服務

### 更新到指定版本

先備份重要資料，再取得遠端 tag 或 commit。部署腳本會切換版本、重建 image 並執行 migration：

```bash
git fetch --all --tags --prune
QJUDGE_REF=RELEASE_TAG_OR_COMMIT_SHA
./scripts/deploy-prod.sh "$(pwd)" "$QJUDGE_REF"
```

更新後重新執行第 8 節驗收。若 release notes 含有額外 migration 或不相容變更，應先在 staging 或備份副本驗證。

### 暫停服務

```bash
docker compose stop
```

這個指令保留 containers、volumes 與資料。一般維護不需要刪除 PostgreSQL volume；資料移除應有獨立備份、目標確認與還原計畫。
