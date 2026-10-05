# 設定寄信

`EMAIL_MODE` 控制平台的寄信功能。留空或設為 `disabled` 時停用；設為 `external` 時使用你準備的 SMTP 服務。重設密碼還需要 `AUTH_EMAIL_PASSWORD_ENABLED` 開啟，登入頁才會顯示「忘記密碼」。目前公開考試與公布成績不會寄出通知信。

這個版本支援 `disabled` 與 `external`，尚未提供 `bundled` 或 `deploy/qjudge addon postal`。自行架設的 Postal 也可以當作 external SMTP，但需要另外完成服務部署、寄件網域驗證與 SMTP 憑證設定。

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

`deploy/qjudge check` 會驗證設定格式；`EMAIL_MODE=external` 時另要求明確的 `EMAIL_HOST` 與 `DEFAULT_FROM_EMAIL`。格式正確不代表 SMTP 能寄出或信件已送達。

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

確認收到測試信後，把 `deploy/.env` 改成：

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

`PASSWORD_RESET_ENABLED` 已移除，`deploy/qjudge check` 會指出如何替換。先刪除該行，設 `EMAIL_MODE=disabled`；完成 SMTP 驗證後再改成 `external`。舊版曾設為 `true` 不會自動啟用新版 mail。若要回退到仍使用舊開關的版本，需配合該版本恢復設定並重新部署。
