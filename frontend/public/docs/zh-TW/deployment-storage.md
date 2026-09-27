# 設定檔案儲存

資料庫保存帳號、題目與作答紀錄；題目圖片、監考證據與 AI 產生的檔案則放在 S3-compatible object storage。QJudge 把所有檔案放在同一個 bucket，以 object key 的開頭區分用途。

## 設定值

| 設定 | 用途 |
| --- | --- |
| `STORAGE_MODE` | `bundled`：QJudge 執行 MinIO；`external`：使用既有服務 |
| `OBJECT_STORAGE_ENDPOINT_URL` | Container 連線 storage 的網址；bundled 為 `http://minio:9000` |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` | 瀏覽器連線 storage 的網址；origin 是 HTTPS 時必須是 HTTPS |
| `OBJECT_STORAGE_ACCESS_KEY`、`OBJECT_STORAGE_SECRET_KEY` | Credential；bundled 時同時是 MinIO 的 root 帳密，secret 至少 8 字元 |
| `OBJECT_STORAGE_BUCKET` | 保存所有檔案的 bucket |
| `MINIO_DATA_DIR` | 選填，bundled MinIO 的主機資料目錄；未設定時使用 Docker volume |

Bucket 維持 private。瀏覽器上傳與讀取檔案時，QJudge 以 `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` 產生短效的 presigned URL，所以這個網址必須是瀏覽器實際連到的網址，前面的反向代理也不能改寫 `Host`。Region 固定為 `us-east-1`。QJudge 執行時不會建立 bucket。

## Bundled：由 QJudge 執行 MinIO

`deploy/qjudge init` 選擇 `STORAGE_MODE=bundled` 時，會填好 endpoint、access key、隨機 secret key 與 bucket `qjudge`，只需要提供公開網址，例如 `https://storage.example.edu`。接著啟動 MinIO 並建立 bucket：

```bash
deploy/qjudge addon storage up
deploy/qjudge addon storage init
```

- MinIO 在獨立的 Compose project `<project>-storage` 中執行，`upgrade` 不會重啟它。
- S3 API 綁在 `FRONTEND_BIND_ADDRESS:9000`，由反向代理或 Tunnel 對外提供公開網址；`deploy/qjudge ingress` 會列出設定方式。代理需保留 `Host`、不限制上傳大小並關閉 buffering（`ingress --nginx` 已包含）。
- 管理介面只綁在 `127.0.0.1:9001`，需要時以 SSH port forwarding 連線。
- CORS 由 MinIO 設為 `QJUDGE_PUBLIC_ORIGIN`。修改 origin 後重新執行 `deploy/qjudge addon storage up` 套用。
- `addon storage init` 可以重複執行，已存在的 bucket 不受影響。

MinIO 的資料在 volume 或 `MINIO_DATA_DIR` 中，不包含在 `upgrade` 的資料庫備份內，請依磁碟規劃另外備份。

## External：使用既有的 S3-compatible 服務

使用 Cloudflare R2、學校既有的 MinIO 或其他 S3-compatible 服務時，先在該服務完成：

1. 建立一個 private bucket。
2. 建立只能讀寫這個 bucket 的 credential。
3. 設定 bucket CORS，允許 QJudge 的 origin。以 JSON 格式為例：

```json
[
  {
    "AllowedOrigins": ["https://judge.example.edu"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

再把連線值寫入 `deploy/.env`（`init` 會逐項詢問）：

```text
STORAGE_MODE=external
OBJECT_STORAGE_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
OBJECT_STORAGE_ACCESS_KEY=<access key>
OBJECT_STORAGE_SECRET_KEY=<secret key>
OBJECT_STORAGE_BUCKET=<bucket>
```

兩個 endpoint 常常相同；服務在內網與公開網路使用不同網址時才分開填。External 模式不需要 `addon storage` 指令，`ingress` 也不會列出 storage 的入口。

## 驗收

1. 在 Markdown 編輯器上傳一張圖片，儲存後重新開啟仍能顯示。
2. 在瀏覽器開發者工具確認上傳與讀取的 request 指向 `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`。
3. 啟用監考或 AI 後，再分別確認監考證據與 AI 產生的檔案可以上傳與下載。

遇到 CORS 或 signature 錯誤時，見[部署故障排除](deployment-troubleshooting.md)。
