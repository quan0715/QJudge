# 準備 QJudge 的檔案儲存

QJudge 的 database 適合保存帳號、題目、權限與作答紀錄；題目圖片、監考影音片段與 AI 產生的檔案則需要另一個可以存放大型檔案的空間。這類服務通常稱為 object storage（物件儲存）。

QJudge 使用 S3-compatible API 連線物件儲存。目前可以直接跟著文件部署的是 Cloudflare R2。MinIO 也提供相容的 API，但 QJudge 尚未完成相容性實測，因此本頁不會把它寫成可執行的部署路徑。

## QJudge 會保存哪些檔案

部署前要建立三個 private bucket。Bucket 可以理解成用途分開的檔案容器：

| Bucket | 保存內容 |
| --- | --- |
| `anticheat-raw` | Exam Integrity 的螢幕分享與 Webcam 證據 |
| `markdown-images` | 題目、公告與其他 Markdown 內容中的圖片 |
| `ai-artifacts` | AI workflow 產生、供使用者下載或檢視的檔案 |

Production Compose 不會自動建立這三個 bucket。先建立 bucket，再啟動 QJudge，能避免 application credential 同時擁有管理整個 account 的權限。

## 你需要準備的四個值

QJudge 對所有物件儲存共用四個輸入：

| 設定 | 部署者需要知道的意思 |
| --- | --- |
| `OBJECT_STORAGE_ENDPOINT_URL` | QJudge containers 送出 S3 request 的位置 |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` | 瀏覽器開啟 presigned URL 時能連到的位置 |
| `OBJECT_STORAGE_ACCESS_KEY` | application credential 的識別碼 |
| `OBJECT_STORAGE_SECRET_KEY` | application credential 的秘密，不可寫進 Git 或 issue |

R2 的兩個 endpoint 通常相同。Bucket 名稱、region、presigned URL 有效時間與檔案大小限制由 QJudge 的版本化設定管理，不需要再塞進根目錄 `.env`。

## 在 Cloudflare R2 建立 bucket

登入 Cloudflare dashboard，進入 R2 Object Storage，依序建立：

```text
anticheat-raw
markdown-images
ai-artifacts
```

三個 bucket 都維持 private。QJudge 會在需要讀寫時產生短效的 presigned URL，不需要把整個 bucket 設成 public。

接著建立 R2 API credential。權限只允許讀寫這三個 bucket，不要使用 account owner key 或可管理所有 Cloudflare 資源的 token。

建立後立即保存兩個只會完整顯示一次的值：

- Access Key ID
- Secret Access Key

R2 S3 API endpoint 使用 account ID，格式是：

```text
https://YOUR_R2_ACCOUNT_ID.r2.cloudflarestorage.com
```

`YOUR_R2_ACCOUNT_ID` 要換成 Cloudflare 顯示的實際 account ID，不要保留尖括號、引號或路徑。

## 讓瀏覽器可以使用 presigned URL

有些檔案由瀏覽器直接上傳或讀取，因此 R2 bucket 的 CORS policy 要允許 QJudge 的實際 origin。CORS 是瀏覽器用來判斷「哪個網站可以向這個 bucket 發 request」的規則。

例如 QJudge 會從 `https://judge.example.edu` 提供服務，policy 的 allowed origin 就要使用完全相同的 scheme 與 hostname。若使用非標準 port，也要包含 port。

三個 bucket 可使用以下方向設定；請把示例 origin 換成你的實際值：

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

初次在可信任內網以 HTTP 驗收時，allowed origin 也必須和 `QJUDGE_PUBLIC_ORIGIN` 完全相同。改成正式 HTTPS 網域後，要同步更新 R2 CORS。

## 交給 QJudge 初始化工具

回到 QJudge repository，不需要先把 credential 寫成一串 shell export。執行初始化工具：

```bash
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://YOUR_QJUDGE_HOST
```

Cloud VM 將 `self-hosted` 改成 `cloud-vm`。腳本會依序詢問：

```text
R2 S3 endpoint
R2 access key
R2 secret key
```

Access key 與 secret key 不會回顯在畫面上。腳本會把 public endpoint 設成同一個 R2 endpoint，驗證兩者都使用 HTTPS，再將必要值寫入 `.env`。

若 `.env` 已經存在，不要用 `--force` 只為了換 R2 credential；那會同時重新產生其他 secrets。既有部署應先備份，再透過安全的 secret 管理方式更新這四個值並重建受影響的 services。

## 部署後怎麼確認

完成主部署後，不要只看 bucket 是否存在。請從 QJudge 實際執行使用者流程：

1. 在 Markdown editor 上傳一張小圖片。
2. 儲存內容並重新開啟頁面，確認圖片能讀取。
3. 從瀏覽器開發者工具確認 request 指向預期的 R2 endpoint。
4. 確認 production bucket 沒有出現 load-test 使用的 object。
5. 若已啟用 Exam Integrity 或 AI provider，再分別驗證 evidence 與 AI artifact；沒有啟用時不需要為了測 storage 強行開啟它們。

如果瀏覽器出現 CORS error，先比對實際 origin、bucket CORS 與 public endpoint。如果出現 signature mismatch，先確認 endpoint、access key、secret key 與主機時間。完整順序請見[部署故障排除](deployment-troubleshooting.md)。

## MinIO 的目前狀態

MinIO 是可以自行架設的 S3-compatible object storage，適合希望檔案不離開校園或機房的單位。不過 QJudge 尚未完成相容性實測，目前的 `setup-env.sh` 也會拒絕 MinIO selector。

正式支援前必須確認：

- private HTTP 與 HTTPS endpoint 的安全邊界。
- path-style／virtual-hosted-style addressing。
- 三個 bucket 可以重複執行而不破壞既有資料的初始化流程。
- Backend、AI worker 與 Integrity Worker 使用相同 credential contract。
- Presigned URL 不會指向只有 container 才看得到的 hostname。
- CORS、過期時間、大檔案與錯誤 credential 的 end-to-end tests。
- R2 與 MinIO 之間切換時不需要改 application code。

在這些項目完成前，本文件不提供 MinIO 指令，也不宣稱兩者已經可以互換。這能避免部署者在建立完 database 後，才發現瀏覽器無法使用產生的 URL。

準備好 R2 後，回到[從一台主機開始部署 QJudge](deployment.md)繼續安裝。
