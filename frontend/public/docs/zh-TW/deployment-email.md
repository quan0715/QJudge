# 設定寄信

`EMAIL_MODE` 是平台的寄信開關。QJudge 一律透過標準的 `EMAIL_*` SMTP 設定寄信，模式只決定 SMTP 服務從哪裡來：

| 模式 | SMTP 服務 | 負責 |
| --- | --- | --- |
| `disabled`（留空時的預設） | 無，平台不寄信 | — |
| `external` | 你既有的 SMTP 服務 | 由服務商處理佇列、投遞與信譽 |
| `bundled` | 以 `deploy/qjudge addon postal` 管理的自架 Postal | 由管理者負責投遞、資料、DNS 與 IP 信譽 |

重設密碼還需要 `AUTH_EMAIL_PASSWORD_ENABLED` 開啟，登入頁才會顯示「忘記密碼」。目前公開考試與公布成績不會寄出通知信。所有設定都放在 `deploy/.env`。

步驟 1–4 適用於 `external` 與 `bundled`。使用 `bundled` 時，先依下方「自架 Postal」章節架好 Postal，再在這些步驟中把它當作 SMTP 服務。

## 1. 準備 SMTP 與寄件地址

先向 SMTP 服務確認以下資料：

- backend 與 celery 容器能連到的 SMTP hostname、port 與 TLS 模式。容器中的 `localhost` 指向容器自己。
- SMTP 帳號與密碼；無需認證的受限內網 relay 可以同時留空。
- 服務允許使用的寄件地址。依服務指示設定寄件網域、DKIM 與 SPF；自行直送外部信箱時，也要確認出口 IP 與 PTR。

部署維護者在主機上的 `deploy/.env` 填入憑證，不要把真實密鑰貼到聊天、命令列 `--set`、Git 或文件。既有網域的郵件紀錄應保留。

## 2. 保持停用，先套用 SMTP 設定

在 repository 根目錄編輯 `deploy/.env`。以下都是範例值，請換成你的服務資料：

```dotenv
EMAIL_MODE=disabled
EMAIL_HOST=smtp.example.edu
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
EMAIL_TIMEOUT=10
EMAIL_HOST_USER=your-smtp-user
EMAIL_HOST_PASSWORD=replace-with-your-smtp-credential
DEFAULT_FROM_EMAIL=QJudge <noreply@mail.example.edu>
```

| 連線方式 | 設定 |
| --- | --- |
| STARTTLS（常用 587） | `EMAIL_USE_TLS=true`、`EMAIL_USE_SSL=false` |
| 隱式 TLS（常用 465） | `EMAIL_USE_TLS=false`、`EMAIL_USE_SSL=true` |
| 受限內網、無 TLS 的 relay | 兩者皆 `false`；僅在已確認網路隔離且服務要求時使用 |

兩種 TLS 不能同時開啟。帳密須同時提供或同時留空。`EMAIL_TIMEOUT` 可設 1–120 秒；`QJUDGE_PUBLIC_ORIGIN` 決定重設密碼連結的網址。

`deploy/qjudge check` 會驗證設定格式；`EMAIL_MODE=external` 或 `bundled` 時另要求明確的 `EMAIL_HOST` 與 `DEFAULT_FROM_EMAIL`。格式正確不代表 SMTP 能寄出或信件已送達。

完成[第一次部署](deployment.md)後，以目前版本套用設定。以下指令適用於已支援 `EMAIL_MODE` 的部署版本；從舊版升級時，請改用包含此功能的新版本 ref：

```bash
deploy/qjudge check
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
```

第一次安裝尚無 `deploy/.version` 時，依部署指南使用要安裝的版本，例如 `deploy/qjudge upgrade origin/main`。只改 `.env` 或執行 `restart` 不會更新既有容器的環境設定；`upgrade` 會重新建立受影響的服務。請安排在沒有進行中考試的維護時段。

## 3. 從 celery 寄一封測試信

在同一個 repository 根目錄，先建立指向已部署版本與 project 的 Compose 指令：

```bash
qjudge_image_version="sha-$(sed -n 's/^current=//p' deploy/.version | cut -c1-12)"
qjudge_dc() {
  QJUDGE_VERSION="$qjudge_image_version" docker compose \
    --project-directory deploy --env-file deploy/.env \
    -f deploy/compose.yml -f deploy/compose.build.yml "$@"
}
```

把以下收件地址換成維護者同意接收測試信的信箱，再執行一次：

```bash
qjudge_dc exec -T celery python manage.py sendtestemail your-test-inbox@example.edu
```

`sendtestemail` 直接使用 SMTP 設定，不受 `EMAIL_MODE` 影響，因此停用狀態下也能驗證。它會寄出真正的信；此處的收件地址不需要是平台帳號。指令成功代表 SMTP 接受了信件，仍要確認收件匣、垃圾郵件與寄信服務的投遞紀錄。若結果不明，先查紀錄，再決定是否重試。

## 4. 啟用平台寄信

確認收到測試信後，把 `deploy/.env` 改成 `external`；SMTP 服務是 Postal addon 時改成 `bundled`：

```dotenv
EMAIL_MODE=external
```

再檢查並套用目前版本：

```bash
deploy/qjudge check
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
```

backend 與 celery 會取得同一組 mail 設定。以專用測試帳號驗證「忘記密碼」、收信與重設流程。只有第三方登入、沒有可用本機密碼的帳號不能使用密碼重設；原本有本機密碼的帳號連結 OAuth 後仍可使用。輸入帳號或 email 時，大小寫須與密碼登入一致。SMTP 測試通過仍需完成這項 worker 流程驗收。

重設密碼會登出完成重設的那個瀏覽器，其他裝置也無法再延長登入。不過其他裝置上已經登入的工作階段，會一直有效到目前的存取憑證到期為止（最長 8 小時）。若使用者懷疑帳號被盜用，重設後最長仍需約 8 小時，對方的登入才會失效。

`EMAIL_MODE` 是所有應用寄信功能共用的開關。未來加入的通知功能也會使用此判斷，個別通知規則將另外提供設定說明。

## 停用與排除問題

停用時設為 `EMAIL_MODE=disabled`，再執行上面的 `check` 與 `upgrade`，更新 backend 與 celery。已交給 SMTP 服務的信件無法收回；正在執行的工作也可能已通過開關檢查。保留 SMTP 設定不會自行寄信，手動 `sendtestemail` 仍可使用。

- 看不到「忘記密碼」：確認 mail 模式與 `AUTH_EMAIL_PASSWORD_ENABLED`，並確認容器已重新建立。`/api/v1/auth/providers` 的 `password_reset_enabled` 反映兩者的組合。
- SMTP 測試失敗：依錯誤確認 hostname、容器網路、port、TLS、帳密與寄件地址授權。
- SMTP 測試成功，重設信沒收到：確認 celery 正在處理 `default` queue，查看 `qjudge_dc logs --tail 100 celery` 與寄信服務投遞紀錄。worker 的失敗事件為 `password_reset_job_failed`；使用者收到的回覆仍保持一致。

### 從舊版設定升級

`PASSWORD_RESET_ENABLED` 已移除，`deploy/qjudge check` 會指出如何替換。先刪除該行，設 `EMAIL_MODE=disabled`；完成 SMTP 驗證後再改成 `external` 或 `bundled`。舊版曾設為 `true` 不會自動啟用新版 mail。若要回退到仍使用舊開關的版本，需配合該版本恢復設定並重新部署。

## 自架 Postal（`EMAIL_MODE=bundled`）

Postal addon 是 QJudge 旁邊獨立的 Compose project。一般的 QJudge `init`／`upgrade` 不會啟動 Postal，也不會改動 SMTP 設定；只有在 `EMAIL_MODE=bundled` 時，明確執行的 `deploy/qjudge addon postal check|init|up|status|backup|upgrade` 才會操作它。

### 前置條件

[官方建議獨立主機](https://docs.postalserver.io/getting-started/prerequisites/)，至少 2 CPU、4GB RAM、25GB 磁碟。本 addon 使用固定版本 Postal 3.3.7（linux/amd64）與 MariaDB 10.11.16；不支援在原地自動跨 MariaDB 大版本升級。

正式啟用前由管理者確認：

- 固定對外 IP；供應商允許**對外 TCP 25**。改用 587 連入 Postal，仍不能取代 Postal 對外投遞所需的 25。
- 由 IP／VPS 供應商設定 PTR，使反解與 SMTP hostname／正向 DNS 一致。購買網域的 Cloudflare 帳號通常不管理主機 IP 的 PTR。
- 郵件 hostname 的 A／AAAA 使用 Cloudflare **DNS only**；一般橘雲代理與 HTTP Tunnel 不轉送 SMTP。IPv6 未完整配置前不要發布 AAAA。
- 依 Postal 管理介面提供的實際值設定 SPF、DKIM、return-path MX，再配置 DMARC。不要覆蓋既有收件網域的 MX；建議用獨立寄信子網域。
- 公網退信需要 MX 指向可連入 TCP 25 的 SMTP 端點。本機預設只綁 loopback，必須明確調整 bind 與防火牆；管理介面另外透過 HTTPS 反向代理。
- SMTP 的 STARTTLS 憑證必須有效、鏈完整且符合 hostname；HTTP 憑證不會自動成為 SMTP 憑證。

參考：[DNS](https://docs.postalserver.io/getting-started/dns-configuration/)、[SMTP TLS](https://docs.postalserver.io/features/smtp-tls/)。本工具不建立 DNS、防火牆、憑證、管理員或 SMTP 帳號，也不會寄測試信。

### 準備 Postal 設定

在執行 Postal 的主機，把下列設定加進 `deploy/.env`；和 QJudge 同機時就是 QJudge 自己的 `deploy/.env`。這些值只有部署拓樸，不含憑證：

```dotenv
EMAIL_MODE=bundled
POSTAL_CONFIG_DIR=/srv/postal/config
POSTAL_HOSTNAME=postal.your-domain.example
POSTAL_NETWORK_MODE=standalone
POSTAL_WEB_BIND_ADDRESS=127.0.0.1
POSTAL_WEB_PORT=5000
POSTAL_SMTP_BIND_ADDRESS=127.0.0.1
POSTAL_SMTP_PORT=25
```

Postal 放在獨立主機時，那台主機的 `deploy/.env` 只需要這些設定（若改過 `COMPOSE_PROJECT_NAME` 也要一併設定），不需要 QJudge 的 PostgreSQL、AI、MinIO 或 SMTP 密碼。addon project 為 `<COMPOSE_PROJECT_NAME>-postal`，預設是 `qjudge-postal`；安裝後不可任意改名，否則會指向另一個資料卷。獨立主機也只需這份 checkout 的 `deploy/` 工具，不必啟動 QJudge。

管理者在 `POSTAL_CONFIG_DIR` 準備以下檔案。內容應由管理者在主機上填寫，不要提交 Git、貼入聊天或 CI 日誌：

| 檔案 | 用途 |
| --- | --- |
| `postal.yml` | 從 `deploy/addons/postal/postal.yml.example` 複製，替換 hostname、DB 密碼、Rails secret 與 DNS 設定 |
| `db-password` | MariaDB root 密碼；與 YAML 的兩處密碼相同，至少 16 字元，單行且不含頭尾空白 |
| `signing.key` | Postal RSA 私鑰，至少 2048 bits；依[官方安裝流程](https://docs.postalserver.io/getting-started/installation/)由管理者建立並保管 |
| `smtp.cert`、`smtp.key` | 對應 `POSTAL_HOSTNAME` 的憑證鏈與私鑰 |

目錄使用 0750、檔案 0640（或更嚴格），不可使用 symlink。官方容器使用 UID 999 的 `postal` 使用者：確認它能讀取目錄及檔案，管理者執行 CLI 時也需有讀取／備份權限；必要時使用 sudo。可採 `chown -R 999:999`，但應先在選用 image 核對群組配置。憑證更新後將實際檔案安全地更新到此目錄，再執行 addon `up` 重建服務。

`main_db` 與 `message_db` 固定指向 addon 內的 `postal-db:3306`，使用其專用 root 帳號，因 Postal 需建立每個 mail server 的資料庫。MariaDB 不發布主機 port，也不加入 QJudge 的網路。YAML 的 SMTP 單封上限須介於 1–25MB，搭配 256MB redo log。

```bash
deploy/qjudge addon postal check
deploy/qjudge addon postal init
```

`check` 會在無網路的短暫容器驗證 YAML、密碼一致性、私鑰及 SMTP 憑證，首次可能下載固定 image；不接觸 DB 或寄信。`init` 僅啟動 Postal MariaDB 並初始化 **Postal 自己的 schema**，不處理 QJudge migration，也不產生或更換憑證。

建立管理員是管理者的獨立操作（此互動指令會要求帳號資訊）：

```bash
docker compose --project-name qjudge-postal --project-directory deploy \
  -f deploy/addons/postal/compose.yml \
  run --rm --no-deps runner postal make-user

deploy/qjudge addon postal up
deploy/qjudge addon postal status
```

為管理網域設定 HTTPS proxy 到 `127.0.0.1:5000`，登入 Postal 後建立組織、mail server、寄件網域及 SMTP credential。Postal 自己的管理通知另用 `postal.yml` 的 `smtp` 區段，依官方文件設定；它不會自動沿用 QJudge `.env`。

### 同機連線與獨立主機

同機執行時，設 `POSTAL_NETWORK_MODE=qjudge`，再執行 addon `up`。只有 SMTP 容器加入既有 `qjudge` 網路，並以 `POSTAL_HOSTNAME` 為 alias。在同一份 `deploy/.env` 把 `EMAIL_HOST` 設為該名稱、port 25，保留 STARTTLS 與 hostname 驗證，並填入 Postal 的 SMTP credential 與寄件人。不要在 QJudge backend 容器填 `EMAIL_HOST=127.0.0.1`。backend 與 celery 要等 `deploy/qjudge upgrade` 重建容器時才會套用 `EMAIL_MODE=bundled`，所以請先完成 Postal 設定與步驟 3 的測試信，再執行那次升級。

獨立主機時，Postal 主機設 `EMAIL_MODE=bundled`，QJudge 主機則設 `EMAIL_MODE=external` 指向 Postal。Postal 主機保持 `POSTAL_NETWORK_MODE=standalone`，把 SMTP bind 設為合適的主機 IPv4（例如要接受公網退信時明確使用 `0.0.0.0`），再由管理者限制防火牆／設定 DNS。QJudge 使用可達的 SMTP DNS 名稱與 port。兩種方式 QJudge 都只需要 `EMAIL_HOST`、`EMAIL_PORT`、TLS、帳密及寄件人；不需要 Postal API key。

日後搬移時，先還原 Postal 完整 DB／config 到新主機、確認投遞與退信，再切換 QJudge 的標準 SMTP 設定；若保留同一 SMTP hostname，也可由管理者安排 DNS 切換。同機的 QJudge 網路 alias 必須停用或移除舊 SMTP 容器，避免仍把流量送到舊主機。QJudge 使用 `EMAIL_MODE=external` 後，不會代為停止舊 Postal。

### 健康檢查與真正寄達

`up` 等待 MariaDB、web、SMTP、worker 的健康檢查。`status` 缺少任一服務或任一不健康即失敗。這只表示容器程序可用；不證明 DNS、TLS 信任鏈、PTR、port 25、收件服務接受或沒有進垃圾郵件。

上線前需在另行授權的測試窗口檢查：從 QJudge 容器解析及連線、TLS 憑證鏈、Postal queue／delivery log、指定測試收件匣、SPF/DKIM/DMARC 結果與退信。工具不自動執行這些外部測試。

### 備份與升級

```bash
deploy/qjudge addon postal backup
# 或指定備份根目錄；每次建立新的私有子目錄
# deploy/qjudge addon postal backup --backup-dir /srv/backups/postal

deploy/qjudge addon postal upgrade
```

備份會停住全部 web／SMTP／worker（包含正在自動重啟的容器），避免投遞與 schema 在備份途中改變；完成後只恢復原本正在執行的服務。郵件客戶端此時可能需要重試，應安排維護窗口。相同 checkout/project 的並行 addon 操作會被鎖定拒絕，所有維護使用同一 checkout 與 env。

每份備份保留全部 MariaDB 資料庫（包含每個 mail server 的 message DB）、整份 config、image 記錄、非敏感部署設定和 addon 定義。目錄 0700、SQL／設定檔 0600；包含信件內容與私鑰，需加密、離機保存並制定保留期限。`.partial` 代表未完成備份，不能當作可還原成果。工具不刪除歷史備份或資料卷。

即使 SMTP 憑證已失效，`backup` 仍可保存資料；它驗證檔案可安全處理，不要求 SMTP 可運作。一般 `up`／憑證更新只重建 Postal writers，保留既有 MariaDB 容器。

`upgrade` 先完成備份，再取得 Compose 固定的 Postal image、執行 Postal migration，最後重建 writers 並等待健康。它不自動升級 MariaDB image；MariaDB 更新需另依官方相容性文件規劃。更新 Postal 版本需先 review `compose.yml` 的 tag/digest 與 release notes，不追蹤 `latest`。

停止、dump、config 複製或 migration 失敗時即停止流程，可能留下停止中的服務；保留備份及現況，勿直接連續重試 migration。檢查日誌時避免分享憑證。migration 成功後的 image rollback 也不等同資料庫回復，工具不自動降版 schema。

### 還原／搬機演練

1. 先保留原機與資料卷，隔離 SMTP 流量。確認備份含 `databases.sql`、`config/`、`manifest.json`、`addon/`，沒有 `.partial`；核對 image 記錄與備份時間。
2. 使用另一個 project／乾淨資料卷與備份記錄相容的 MariaDB／Postal image，在隔離主機還原。恢復 config 的讀取權限至容器 UID 999；更新 `POSTAL_CONFIG_DIR`，hostname／TLS 需與新拓樸一致。
3. 只啟動 MariaDB，不執行 Postal `init`、writer 或 migration。用 `docker compose ... exec -T postal-db sh -ec 'export MYSQL_PWD="$(cat /run/secrets/db-password)"; exec mariadb --user=root' < /private/backup/databases.sql` 匯入；`...` 必須替換為該還原 project、env 與備份的 Compose 定義。避免把密碼放在主機命令列。
4. 驗證資料庫與 mail server/message 資料，確認沒有舊 writer 同時投遞，再用相容的 Postal image 啟動，檢查狀態、DNS、queue 及另行授權的收發測試。只有演練通過後才切換流量；不要自動刪除舊機或舊 volume。

此 addon 的本機測試驗證指令順序、失敗邊界與設定解析；尚不代表已完成真實 Postal 啟動、還原演練或外部投遞驗收。
