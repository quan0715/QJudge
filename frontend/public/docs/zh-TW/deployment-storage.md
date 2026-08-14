# 準備 QJudge 的檔案儲存

QJudge 的 database 保存帳號、題目、權限與作答紀錄；題目圖片、監考證據與 AI 產生的檔案則放在 object storage（物件儲存）。兩者都屬於核心資料，但用途不同，不能用 database 取代檔案儲存。

QJudge 透過 S3-compatible API 讀寫檔案，因此不綁定單一供應商。第一次部署可以使用 Cloudflare R2，也可以連接 MinIO。Cloudflare Tunnel 只處理網站流量，與選擇哪一種 object storage 無關。

## 先選擇 R2 或 MinIO

| 選項 | 適合的情況 | 部署者要負責的工作 |
| --- | --- | --- |
| Cloudflare R2 | 課程團隊沒有維護儲存服務的人力，希望先完成 QJudge 部署 | 建立 bucket、credential 與 CORS；服務容量與更新由 Cloudflare 維護 |
| MinIO | 學校已有 MinIO，或政策要求檔案留在校內 | 維護 MinIO 的容量、備份、更新、網路與 HTTPS |

兩條路使用相同的 QJudge application code。差別集中在 endpoint、credential、region 與 bucket 管理方式；日後切換供應商時不需要修改 Backend、AI Service 或 Frontend。

MinIO 本身是一套獨立的儲存系統。這份指南說明如何把既有或另行部署的 MinIO 交給 QJudge 使用，不取代 MinIO 的正式維運文件。若要新建 MinIO，請先依組織採用版本的官方文件完成儲存磁碟、備份與 TLS；單機 container 適合驗證相容性，但不等於正式環境的備援設計。

QJudge 目前以 Cloudflare R2 與 `minio/minio:RELEASE.2025-07-23T15-54-02Z` 驗證圖片、監考證據、AI artifact 與 presigned URL。這個 MinIO 版本只代表相容性基準，不是要求正式環境使用舊版 image；部署者仍應依組織的維護與資安政策選擇受支援的版本。

## Bucket 不必一次全部建立

QJudge 預設使用三個 private bucket：

| Bucket | 何時需要 | 保存內容 |
| --- | --- | --- |
| `markdown-images` | 第一次核心部署就需要 | 題目、公告與其他 Markdown 內容中的圖片 |
| `anticheat-raw` | 啟用 Exam Integrity 前需要 | 螢幕分享、Webcam 與其他監考證據 |
| `ai-artifacts` | 啟用會產生檔案的 AI workflow 前需要 | AI 產生、供教師下載或檢視的檔案 |

最小可行部署只要先準備 `markdown-images`。另外兩個 bucket 可以等到啟用對應功能前再建立；若已確定近期會使用正式考試與 AI，也可以一次準備完成。

分開的原因是三類檔案通常有不同的存取權、保存期限、容量與刪除規則。例如監考證據可能受校務規範限制，題目圖片則需要跟課程內容保留較久。技術上可以把三個設定指向同一個 bucket，但正式環境仍建議分開，後續管理會比較清楚。

名稱是 QJudge 的預設值，不是 R2 或 MinIO 的規定。學校已有命名規範時，可以在 `.env` 改用：

```text
ANTICHEAT_RAW_BUCKET=school-qjudge-anticheat
MARKDOWN_IMAGE_S3_BUCKET=school-qjudge-markdown
AI_ARTIFACT_S3_BUCKET=school-qjudge-ai-artifacts
```

這三項是選用的部署配置。沿用預設名稱時，不需要放進 `.env`。

## QJudge 需要的連線資料

無論使用哪一種服務，初始化工具都會整理以下四個值：

| 設定 | 用途 |
| --- | --- |
| `OBJECT_STORAGE_ENDPOINT_URL` | QJudge containers 送出 S3 request 的位置 |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` | 使用者瀏覽器開啟 presigned URL 的位置 |
| `OBJECT_STORAGE_ACCESS_KEY` | QJudge application credential 的識別碼 |
| `OBJECT_STORAGE_SECRET_KEY` | Credential 的秘密，不可寫進 Git、issue 或截圖 |

R2 的兩個 endpoint 通常相同。MinIO 若位於校內網路，container endpoint 可以使用 private hostname；public endpoint 必須是使用者瀏覽器實際能連到的網址。不要把 `http://127.0.0.1:9000` 當成另一台主機或 container 也能使用的位址。

## 使用 Cloudflare R2

### 1. 建立需要的 bucket

登入 Cloudflare dashboard，進入 R2 Object Storage。第一次核心驗收先建立：

```text
markdown-images
```

準備啟用 Exam Integrity 或 AI 檔案時，再建立：

```text
anticheat-raw
ai-artifacts
```

Bucket 維持 private。QJudge 會在需要上傳或讀取時產生短效 presigned URL，不必把整個 bucket 公開。

### 2. 建立 application credential

建立只能讀寫 QJudge buckets 的 R2 API credential，不要使用 account owner key。建立後保存 Access Key ID 與 Secret Access Key；secret 通常只會完整顯示一次。

R2 S3 API endpoint 格式如下：

```text
https://YOUR_R2_ACCOUNT_ID.r2.cloudflarestorage.com
```

### 3. 設定 CORS

瀏覽器會直接使用 presigned URL 上傳或讀取，因此每個啟用的 bucket 都要允許 QJudge 的實際 origin。假設網站是 `https://judge.example.edu`，可使用：

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

Origin 必須包含正確的 `http` 或 `https`、hostname 與非標準 port。日後改用正式 HTTPS 網域時，也要同步更新 CORS。

### 4. 產生 QJudge 環境設定

回到 QJudge repository 執行：

```bash
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://YOUR_QJUDGE_HOST
```

Cloud VM 將 target 改成 `cloud-vm`。工具會詢問 R2 endpoint、access key 與 secret key，並自動使用同一個 public endpoint。

## 使用 MinIO

### 1. 確認 MinIO 的兩個入口

先確認 MinIO 已經運作，並準備：

- QJudge containers 可以連到的 S3 API endpoint，例如 `http://minio.internal:9000`。
- 使用者瀏覽器可以連到的 endpoint，例如 `https://storage.example.edu`。

兩者可以相同，也可以不同。QJudge 網站若使用 HTTPS，MinIO public endpoint 也必須使用 HTTPS，否則瀏覽器會阻擋混合內容。MinIO Console 的 `9001` 是管理介面，不是 S3 API endpoint；QJudge 應連接 S3 API 使用的 `9000` 或其 HTTPS reverse proxy。

### 2. 建立 bucket 與 credential

使用 MinIO Console 建立目前需要的 private bucket，再建立只允許這些 bucket 讀寫的 application access key。不要把 MinIO root credential 長期交給 QJudge。

若管理單位已設定 `mc` alias，可以用以下指令建立預設 buckets；`--ignore-existing` 讓重複執行不會破壞既有資料：

```bash
mc mb --ignore-existing qjudge/markdown-images
mc mb --ignore-existing qjudge/anticheat-raw
mc mb --ignore-existing qjudge/ai-artifacts
```

只建立目前會用到的 bucket 即可。

### 3. 設定 CORS

MinIO 使用 S3 XML 格式設定 bucket CORS。建立 `qjudge-cors.xml`，並把 origin 換成 QJudge 的實際網址：

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://judge.example.edu</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

再把規則套用到已建立的 bucket：

```bash
mc cors set qjudge/markdown-images qjudge-cors.xml
mc cors set qjudge/anticheat-raw qjudge-cors.xml
mc cors set qjudge/ai-artifacts qjudge-cors.xml
```

### 4. 產生 QJudge 環境設定

回到 QJudge repository 執行：

```bash
./scripts/setup-env.sh \
  --target self-hosted \
  --storage minio \
  --origin http://YOUR_QJUDGE_HOST
```

工具會分別詢問 container endpoint 與 public endpoint，再詢問 application access key 與 secret key。它也會寫入 MinIO 所需的 region、bucket 建立與 object tagging policy；這些值由工具管理，不需要另外加入 `.env.example`。

## 部署後驗收

完成主部署後，從 QJudge 實際驗證：

1. 在 Markdown editor 上傳一張小圖片。
2. 儲存內容並重新開啟，確認圖片可以讀取。
3. 從瀏覽器開發者工具確認 request 指向預期的 public endpoint。
4. 確認 object 出現在 `markdown-images`，而不是其他用途的 bucket。
5. 啟用 Exam Integrity 或 AI provider 後，再分別驗證監考證據與 AI artifact。

如果瀏覽器顯示 CORS error，先比對 `QJUDGE_PUBLIC_ORIGIN`、public endpoint 與 bucket CORS。出現 signature mismatch 時，檢查 endpoint、credential、region 與主機時間。完整順序請見[部署故障排除](deployment-troubleshooting.md)。

完成其中一條儲存路徑後，回到[從一台主機開始部署 QJudge](deployment.md)繼續安裝。
