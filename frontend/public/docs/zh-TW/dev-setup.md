# 建立本機開發環境

這份文件用 Docker Compose 啟動一套可以修改程式、即時查看結果的 QJudge。它是開發環境，不適合直接提供正式課程使用；要架設正式站台，請改看[架設與部署](/docs/deployment)。

## 1. 準備工具與 R2

主機需要 Git、Docker 與 Docker Compose v2。Node.js、Python、PostgreSQL 等執行環境會放在容器內，因此不必先逐一安裝到電腦上。

目前開發環境也需要 S3-compatible object storage。已完成驗證的選項是 Cloudflare R2；請先依[準備檔案儲存](/docs/deployment-storage)建立三個 bucket 與 API token。

## 2. 取得程式碼

```bash
git clone YOUR_QJUDGE_REPOSITORY_URL
cd online_judge
```

如果你已經在專案目錄中，可以直接進行下一步。

## 3. 產生環境設定

先設定 R2 endpoint。指令會在終端機詢問 access key 與 secret key，並把產生的密碼與必要設定寫入不會提交到 Git 的 `.env`。

```bash
export OBJECT_STORAGE_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://localhost:5173
```

再建立 Exam Integrity 與 AI OAuth 服務需要的本機 secret 檔案：

```bash
python3 scripts/bootstrap_integrity_secrets.py
```

如果 `.env` 已存在，腳本會拒絕覆寫。除非你確定舊設定不再需要，否則不要直接加上 `--force`；可以先備份舊檔，再重新產生。

## 4. 啟動開發服務

專案提供一個 wrapper，確保每次都使用正確的 dev Compose 檔案：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
```

第一次建置會下載 image 並安裝依賴，所需時間取決於網路與電腦效能。完成後查看狀態：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh
```

常用入口如下：

- QJudge 網頁：`http://localhost:5173`
- Backend API：`http://localhost:8000`
- AI Service：`http://localhost:8001`
- Storybook：`http://localhost:6006`
- MCP Server：`http://localhost:9002/mcp`

AI Service 提供兩個健康檢查：`/health/live` 表示程序仍在運作，`/health/ready` 表示相依服務也已就緒。

```bash
curl http://localhost:8001/health/live
curl http://localhost:8001/health/ready
```

## 5. 修改程式與查看日誌

frontend、backend 與 ai-service 的原始碼會掛載進容器。大多數修改儲存後即可重新載入；若變更依賴或 Dockerfile，再執行一次 `up -d --build`。

哪個畫面出錯，就先看相對應的服務：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f frontend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f backend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f ai-service
```

按 `Ctrl+C` 只會離開日誌，不會停止服務。

## 6. 執行測試

前端檢查在 dev frontend container 中執行：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test
```

後端測試使用獨立的 test Compose，避免測試資料混入開發資料庫：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q
```

只修一個功能時，可以把最後一行換成特定測試路徑，先取得較快的回饋。不要在 dev backend container 中臨時改 `DATABASE_URL` 來模擬測試環境。

## 7. 暫停與再次開始

停止開發服務：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev down
```

這會停止容器，但保留資料 volume。再次執行 `dev up -d` 即可繼續。不要為了排除一般啟動問題使用 `down -v`，因為 `-v` 會刪除本機資料庫 volume。

完成環境後，下一步可閱讀[貢獻指南](/docs/contributing)，了解分支、測試與文件更新方式。
