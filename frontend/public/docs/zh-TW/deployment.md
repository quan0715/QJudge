# 從一台主機開始部署 QJudge

QJudge 以 Docker Compose 在一台 Linux 主機上執行。設定、安裝、升級與回退都經由 repository 內的 `deploy/qjudge` 指令完成。這一頁依操作順序完成第一次安裝；網路入口、檔案儲存與即時監看的細節分別在：

- [網路入口與選用功能](deployment-options.md)
- [設定檔案儲存](deployment-storage.md)
- [設定即時監看](deployment-live-monitoring.md)
- [設定寄信](#/docs/deployment-email)
- [部署故障排除](deployment-troubleshooting.md)

## 1. 準備主機

主機需要：

- Docker Engine 與 Docker Compose v2（`docker compose version` 可以執行）。
- Git、Python 3（`deploy/qjudge` 只使用標準函式庫）與 curl。
- 目前帳號可以使用 Docker：`docker info` 會同時顯示 Client 與 Server。

QJudge 的主站 HTTP 入口是 frontend，預設綁在 `127.0.0.1:8080`。HTTPS 由主機上的反向代理或 Cloudflare Tunnel 提供。主站、自帶 MinIO 與 LiveKit signaling 預設共用一個網域；自帶 LiveKit 的 TURN 仍須另外準備網域與 TCP／UDP 入口。

## 2. 取得程式碼

```bash
git clone https://github.com/quan0715/QJudge.git
cd QJudge
```

這個目錄只用來部署。`upgrade` 與 `rollback` 會以 `git checkout --detach` 切換版本，不要在這裡保存未提交的修改。

## 3. 建立設定

```bash
deploy/qjudge init
```

`init` 逐項詢問必填的設定，再詢問三個選填項目（`FRONTEND_BIND_ADDRESS`、`QJUDGE_TRUSTED_PROXIES`、`MEDIA_MODE`，直接按 Enter 表示不設定）：

| 設定 | 說明 |
| --- | --- |
| `QJUDGE_PUBLIC_ORIGIN` | 使用者在瀏覽器開啟的網址，例如 `https://judge.example.edu`；只能有 scheme、host 與 port |
| `STORAGE_MODE` | `bundled` 由 QJudge 執行 MinIO；`external` 使用既有的 S3-compatible 服務。見[設定檔案儲存](deployment-storage.md) |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` | Bundled 可省略，使用主站 origin；external 必填，origin 是 HTTPS 時必須是 HTTPS |
| `FRONTEND_BIND_ADDRESS`、`QJUDGE_TRUSTED_PROXIES` | 反向代理在同一台主機時留空。在另一台時見[網路入口與選用功能](deployment-options.md) |
| `MEDIA_MODE` | 即時監看：`disabled`（留空即停用）、`bundled` 或 `external`。見[設定即時監看](deployment-live-monitoring.md) |

`init` 會自動產生 `SECRET_KEY`、三組 DB 密碼與 `CREDENTIAL_LEASE_SECRET`。`STORAGE_MODE=bundled` 時另外填入 MinIO 的連線值（endpoint `http://minio:9000`、access key `qjudge`、隨機 secret key、bucket `qjudge`）；`MEDIA_MODE=bundled` 時產生 LiveKit API key／secret。結果寫入權限為 `0600` 的 `deploy/.env`，並在 Docker network `qjudge` 不存在時建立它。

也可以一次給定所有值，不進入互動：

```bash
deploy/qjudge init --non-interactive \
  --set QJUDGE_PUBLIC_ORIGIN=https://judge.example.edu \
  --set STORAGE_MODE=bundled
```

`deploy/.env` 已存在時 `init` 會拒絕執行。之後要調整設定，直接編輯 `deploy/.env` 再執行 `deploy/qjudge check`。所有可用的 key 與說明列在 `deploy/.env.example`。

`deploy/.env` 與 `deploy/secrets/`（第一次 `upgrade` 時產生的 AI OAuth 與 Integrity 金鑰）不進 Git，請與資料庫備份一起保存到主機以外的地方。

## 4. 啟動自帶的 storage 與 media

使用 `STORAGE_MODE=bundled` 時，啟動 MinIO 並建立 bucket：

```bash
deploy/qjudge addon storage up
deploy/qjudge addon storage init
```

使用 `MEDIA_MODE=bundled` 時，啟動 LiveKit：

```bash
deploy/qjudge addon media up
```

Addon 是獨立的 Compose project（`<project>-storage`、`<project>-media`），`upgrade` 不會重啟它們。`external` 模式跳過這一步。

## 5. 設定入口

```bash
deploy/qjudge ingress
```

`ingress` 依 `deploy/.env` 列出主站代理位址、storage bucket 路徑、LiveKit signaling 網址、TURN 網域、port 與 Tunnel route。加上 `--nginx` 會輸出可以修改後使用的 nginx 設定：

```bash
deploy/qjudge ingress --nginx
```

照輸出設定反向代理或 Cloudflare Tunnel，細節見[網路入口與選用功能](deployment-options.md)。

## 6. 安裝指定版本

```bash
deploy/qjudge upgrade origin/main
```

參數可以是 commit SHA、tag 或 `origin/main` 這類 remote ref。`upgrade` 依序執行：

1. `git fetch` 後 checkout 指定版本，並執行 `check`。
2. 準備 judge image：從 GHCR 取得，失敗時使用本機已有的 `oj-judge:latest`，再不行就在本機 build。
3. 在主機 build QJudge images，tag 為 `sha-<commit 前 12 碼>`。
4. 啟動 PostgreSQL、PgBouncer 與 Redis，把 `online_judge` 與 `qjudge_ai` 備份到 `deploy/backups/`。
5. 以新版 backend image 產生缺少的 AI OAuth 與 Integrity 金鑰（已有的保留；`deploy/qjudge secrets` 可單獨執行這一步），再執行 Django 與 AI migration。
6. 啟動所有服務，最多等待 5 分鐘，直到 backend、AI service、Integrity 皆 healthy，且經由 frontend 的 `/api/health/` 回應 200。
7. 把目前與上一版的 commit 寫入 `deploy/.version`，QJudge images 只保留最近 3 版。

成功時最後一行是 `Upgraded to sha-…`。第一次 build 需要一段時間。

## 7. 建立管理者並驗收

以下指令的 `qjudge` 是 Compose project 名稱；`deploy/.env` 有設定 `COMPOSE_PROJECT_NAME` 時改用該值。

```bash
docker compose -p qjudge ps
docker compose -p qjudge exec backend python manage.py createsuperuser
```

長駐服務應為 running 或 healthy。接著用瀏覽器開啟 origin，依序確認：

1. 以剛建立的管理者登入。
2. 建立一個最小題目。
3. 提交一份會通過的程式，看到評測結果。
4. 在 Markdown 編輯器上傳圖片，重新開啟後仍能顯示。

四項都通過才算完成安裝；container 全部 running 不代表使用者流程可用。

## 8. 升級、套用設定與回退

請在沒有進行中考試的時段升級。考試登入鎖定值已改用 refresh session JTI，舊版開始的考試在換發 token 時可能需要重新登入。

升級到新版本：

```bash
deploy/qjudge upgrade <commit SHA 或 ref>
```

修改 `deploy/.env` 後，檢查設定並以目前版本重新執行 `upgrade`，讓受影響的服務重新建立：

```bash
deploy/qjudge check
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
```

Addon 的 image 版本寫在 `deploy/addons/*/compose.yml`。升級後若 addon 設定有變，再執行一次 `deploy/qjudge addon storage up` 或 `addon media up`。

`upgrade` 失敗時：

- 在啟動新版服務之前失敗（設定錯誤、build、備份或 migration）：checkout 回原本的版本，應用服務仍執行原本的版本。
- 新版服務啟動後健康檢查失敗：checkout `deploy/.version` 記錄的版本，以該版本的 image 重新啟動（第一次安裝沒有記錄，只會 checkout 回原本的版本）。
- 兩種情況都不會自動還原資料庫；需要時會印出最新備份與還原指令。

回到上一版：

```bash
deploy/qjudge rollback
```

`rollback` checkout `deploy/.version` 記錄的上一版，直接以本機保留的 image 啟動，不重新 build 或 migrate，並交換 `.version` 中的目前與上一版。資料庫同樣不會自動還原。Migration 若無法與舊版程式共存，需要手動還原備份。

## 9. 備份與還原

每次 `upgrade` 會以 `pg_dump -Fc` 建立 `deploy/backups/<UTC 時間>-<commit>/online_judge.dump` 與 `qjudge_ai.dump`，保留最近 10 份。這些備份不包含 object storage、`deploy/.env` 與 `deploy/secrets/`，請另外備份。

還原單一資料庫（`<id>` 換成備份目錄名稱）：

```bash
docker compose -p qjudge exec -T postgres \
  pg_restore -U qjudge_admin --clean --dbname online_judge \
  < deploy/backups/<id>/online_judge.dump
```

AI 資料庫把兩處 `online_judge` 換成 `qjudge_ai`。

暫停服務用 `docker compose -p qjudge stop`，資料與 volumes 都會保留。一般維護不要使用 `down -v`，它會刪除資料庫 volume。
