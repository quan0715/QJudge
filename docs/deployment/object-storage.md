# S3-compatible Object Storage

QJudge 將大型或不適合放入 PostgreSQL 的檔案存到 S3-compatible object storage。最小部署必須提供這項服務，但 storage 不必與 application 位於同一台主機。

## QJudge 使用物件儲存的功能

目前有三種用途：

| Bucket | 功能 | 預設名稱 |
| --- | --- | --- |
| Anti-cheat evidence | 考試 evidence 與 capture data | `anticheat-raw` |
| Markdown images | 題目與內容編輯器圖片 | `markdown-images` |
| AI artifacts | AI workflow 產生的 artifacts | `ai-artifacts` |

Production Compose 不會自動建立 bucket。第一次部署前，必須在 storage provider 建立上述三個 bucket，並讓同一組 application credential 能讀寫它們。

## 共用環境契約

部署者只管理四個輸入：

| 變數 | 用途 |
| --- | --- |
| `OBJECT_STORAGE_ENDPOINT_URL` | Backend 與 workers 使用的 S3 API endpoint |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` | 瀏覽器存取 presigned URL 時使用的 endpoint |
| `OBJECT_STORAGE_ACCESS_KEY` | Application access key |
| `OBJECT_STORAGE_SECRET_KEY` | Application secret key |

Region、bucket names、presigned URL TTL、object size limits、tagging 與 auto-create policy 都是版本化的 Compose/application defaults，不放在根目錄 `.env`。

Credential 應遵守最小權限：只允許 application 讀寫指定的三個 bucket，不使用 account owner 或全域管理金鑰。Production 與 load test 應使用不同 credential 與 bucket；load test 的獨立範本在 [`docs/examples/loadtest.env.example`](../examples/loadtest.env.example)。

## Cloudflare R2

> 路徑狀態：環境契約與 Compose rendering 已驗證；乾淨主機的完整 upload/download 流程尚未驗證。

在 Cloudflare account 中完成下列準備：

1. 建立 `anticheat-raw`、`markdown-images` 與 `ai-artifacts` 三個 bucket。
2. 建立只允許這三個 bucket 讀寫的 R2 API credential。
3. 記錄 account ID、access key ID 與 secret access key。
4. 為需要由瀏覽器直接使用 presigned URL 的 bucket 設定符合 `QJUDGE_PUBLIC_ORIGIN` 的 CORS policy。

R2 的 S3 API endpoint 格式如下：

```text
https://ACCOUNT_ID.r2.cloudflarestorage.com
```

在執行環境初始化前匯出四個值：

```bash
export OBJECT_STORAGE_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
read -r -p "R2 access key: " OBJECT_STORAGE_ACCESS_KEY
read -r -s -p "R2 secret key: " OBJECT_STORAGE_SECRET_KEY
printf '\n'
export OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY
```

接著由初始化工具產生 `.env`：

```bash
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://HOST_OR_IP
```

Cloud VM 只需將 target 改成 `cloud-vm`。R2 endpoint 必須使用 HTTPS；工具會在寫入前驗證這項條件。

## MinIO：尚未提供

MinIO 提供 S3-compatible API，但目前的初始化工具、production defaults 與 integration tests 尚未完成 MinIO 路徑。文件暫時不提供可執行的 MinIO 初始化指令，避免把未測試的設定當成支援功能。

正式支援前至少要驗證：

- Endpoint 使用 HTTP private network 或 HTTPS 時的安全邊界。
- Virtual-hosted style 與 path-style addressing。
- 三個 bucket 的 idempotent bootstrap。
- Backend、AI service 與 workers 使用同一份共用 credential contract。
- Browser-facing presigned upload/download URL 不會指向 container-only hostname。
- CORS、TTL、大檔案與錯誤 credential 的 integration tests。
- R2 與 MinIO 之間切換時，不需要改 application code。

完成這些測試後，MinIO 才能加入 `setup-env.sh` 的 storage selector。

## 驗收

部署完成後，依序確認：

1. Application credential 能列出或存取三個既有 bucket，但不能管理 account 其他資源。
2. 在 Markdown editor 上傳圖片後，能透過瀏覽器讀回。
3. 建立一筆含 evidence 的最小流程，worker 能上傳檔案，backend 能產生讀取 URL。
4. 啟用 AI provider 後，AI artifact 能寫入與讀取；未啟用 provider 時，這一項可略過。
5. Presigned URL 在 TTL 內有效，過期後被拒絕。
6. Production bucket 沒有出現 load test objects。

若遇到 signature、CORS 或 endpoint 錯誤，請依 [故障排除](troubleshooting.md) 的 object storage 順序檢查。

返回 [QJudge 正式架設與部署指南](../deployment.md)。
