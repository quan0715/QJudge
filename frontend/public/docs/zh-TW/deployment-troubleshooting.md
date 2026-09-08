# 部署故障排除

遇到錯誤時，先找出部署流程中最早失敗的一步。不要一開始就重啟所有 services、替換 `.env` 或刪除資料；下游服務常常只是因為前一個相依項目沒有準備好。

以下每一節先提供少量、唯讀的檢查。若要回報問題，保留 QJudge commit、Ubuntu／Docker 版本與異常 service 最近的 logs，並先移除 token、credential、email、presigned URL 與學生資料。

## 1. 主機與工具

**症狀：** 找不到指令、Docker daemon unavailable，或目前帳號沒有權限。

先執行：

```bash
docker --version
docker compose version
docker info
```

前兩行應顯示版本，`docker info` 應同時顯示 Client 與 Server。若出現 permission denied，先修正目前帳號的 Docker 權限；若無法連到 daemon，先確認 Docker service 已啟動。

Docker 可以運作、部署仍在 build 階段失敗時，再查看 build 輸出中第一個失敗的 image。不要因為最後一行只寫 exit code，就忽略前面的 package 或 network error。

## 2. 環境設定

**症狀：** `setup-env.sh` 停止、拒絕覆寫，或顯示缺少必要值。

先確認 `.env` 是否存在、權限是否正確，並只列出 key 名稱：

```bash
ls -l .env
awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' .env
```

`.env` 應位於 repository root，權限應限制為擁有者讀寫。不要用 `cat .env` 回報問題。

如果 `.env` 已存在，初始化工具拒絕覆寫是正常的保護機制。不要直接加入 `--force`；它會重新產生 application 與 database secrets。先備份並確認你是要修改單一設定，還是重新建立整套環境。

非互動的 shell 不會出現 object storage 提示。自動化流程需要預先注入四個 `OBJECT_STORAGE_*` 值，但 log 只能顯示 key 是否存在，不能輸出 value。

## 3. Compose 與啟動

**症狀：** Compose 說變數缺失、service 沒有建立，或 container 反覆重啟。

先檢查 rendered Compose 與所有狀態：

```bash
docker compose config --quiet
docker compose ps --all
```

第一個指令沒有輸出代表設定可以解析。第二個指令中，長期服務應為 running／healthy；一次性服務可以成功結束。

找出第一個異常 service 後讀取最近 logs：

```bash
docker compose logs --tail=200 SERVICE_NAME
```

將 `SERVICE_NAME` 換成畫面中的名稱，例如 `postgres`、`ai-db-bootstrap`、`backend` 或 `frontend`。先修正第一個失敗的 dependency，再重新建立受影響的 service。

## 4. Database 與 migration

**症狀：** `ai-db-bootstrap`／`ai-migrate` 失敗，backend 卡在 migration，或登入時出現 database error。

先看一次性工作與 backend：

```bash
docker compose ps --all ai-db-bootstrap ai-migrate
docker compose logs --tail=200 ai-db-bootstrap ai-migrate backend
```

`ai-db-bootstrap` 與 `ai-migrate` 應以成功狀態結束。Backend 啟動時會執行 Django migration；完成後才啟動 web server。

需要確認 Django migration 狀態時：

```bash
docker compose exec backend python manage.py showmigrations --plan
```

若既有 PostgreSQL volume 使用的 password 和目前 `.env` 不一致，不能靠刪除 volume 修復。先確認備份、既有角色與 credential rotation 方式，再決定復原步驟。

## 5. 健康檢查

**症狀：** Container 看起來已啟動，但網頁、API 或 AI readiness 沒有回應。

在部署主機依序測試：

```bash
curl --fail http://127.0.0.1/
curl --fail http://127.0.0.1:8000/api/health/
curl --fail http://127.0.0.1:8001/health/ready
```

首頁失敗時先看 `frontend`，backend health 失敗時看 `postgres`、`pgbouncer`、`redis` 與 `backend`。AI readiness 不要求 provider API key；失敗時先看 AI database、Redis queue 與 `ai-service`。

下一步讀取對應 service：

```bash
docker compose logs --tail=200 frontend backend ai-service
```

只啟動 container 但沒有完成瀏覽器登入、題目、評測與圖片上傳，仍不能視為部署完成。

## 6. 檔案儲存

**症狀：** Bucket not found、Access denied、signature mismatch、圖片無法讀取或瀏覽器顯示 CORS error。

先只顯示 endpoint，不顯示 credential，並確認主機時間：

```bash
awk -F= '/^OBJECT_STORAGE_(ENDPOINT_URL|PUBLIC_ENDPOINT_URL)=/{print}' .env
date -u
```

Container endpoint 必須能從 QJudge services 連線，public endpoint 則必須能從使用者瀏覽器連線。使用 R2 時兩者通常相同且都使用 HTTPS；使用 MinIO 時可以不同，但 QJudge 網站若使用 HTTPS，public endpoint 也必須使用 HTTPS。

目前使用之功能對應的 bucket 必須存在：核心圖片上傳使用 `markdown-images`，Exam Integrity 使用 `anticheat-raw`，AI 產物使用 `ai-artifacts`。

依症狀檢查：

- Signature mismatch：endpoint、access key、secret key 或主機時間不一致。
- Access denied：credential 沒有指定 bucket 的 object read／write 權限。
- CORS error：bucket allowed origin 和 `QJUDGE_PUBLIC_ORIGIN` 不完全相同，或 method／header 未允許。R2 與 MinIO 都要檢查。
- URL 指向錯誤主機：public endpoint 使用了瀏覽器無法解析的 hostname。

接著查看實際處理 request 的 service：

```bash
docker compose logs --tail=200 backend ai-worker integrity-resident integrity-reconciler
```

Presigned URL 在有效時間內可能帶有存取權限，不要貼到公開 issue。

## 7. Judge 與 Integrity

**症狀：** 程式提交沒有結果、Judge image 不存在，或監考事件未出現在管理畫面。

先確認 image、Docker socket 與 secret files，不輸出 secret 內容：

```bash
docker image inspect oj-judge:latest >/dev/null
stat -c '%u:%g %a %n' /var/run/docker.sock
stat -c '%F %u:%g %a %n' secrets/integrity/backend-public-key secrets/integrity/resident-service-token secrets/integrity/integrity-worker-signing-key
```

Judge image 應存在；Docker socket 只供 Judge 使用，group 要和 `.env` 產生的設定一致。Integrity 不使用 Docker socket。三個 credential path 應是 regular file；Resident 的 public key 與 service token 應為 group 10001、權限 640，簽章私鑰保持 600。

再查看相關 services：

```bash
docker compose logs --tail=200 celery celery-high integrity-resident integrity-reconciler
docker compose exec -T integrity-resident python -c "from urllib.request import urlopen; assert urlopen('http://localhost:8011/ready').status == 200"
```

如果 secret bind mount source 意外變成 directory，先停止使用該路徑的 container，確認是空目錄再移除，重新執行 `docker compose run --rm --no-deps --build integrity-bootstrap`。不要覆寫現有有效憑證。Resident 與 reconciler 常駐運作，老師不需手動啟動或重啟每場考試的 Worker。

## 8. Tunnel 與 OAuth

**症狀：** HTTPS 網域打不開、Tunnel running 但沒有內容、OAuth callback mismatch，或登入後又回到錯誤頁面。

啟用 Tunnel 時先檢查 profile、logs 與 public origin：

```bash
docker compose --profile tunnel ps cloudflared
docker compose --profile tunnel logs --tail=200 cloudflared
awk -F= '/^QJUDGE_PUBLIC_ORIGIN=/{print}' .env
```

Container 應為 running，origin 應與瀏覽器網址完全相同。Cloudflare dashboard 還要確認 Tunnel status、public hostname、DNS 與 target service；token 正確不代表 route 一定正確。

OAuth provider 登記的 callback 必須是 frontend route：

```text
https://YOUR_QJUDGE_HOST/auth/PROVIDER/callback
```

`PROVIDER` 要換成 `nycu`、`github` 或 `google`。Client ID 與 secret 必須成對存在；不要把 backend 的 `/api/v1/auth/callback/{provider}` 登記到 provider console。

下一步查看 frontend 與 backend：

```bash
docker compose logs --tail=200 frontend backend
```

若要回報問題，附上 `git rev-parse HEAD`、`docker version`、`docker compose version`、`docker compose ps --all` 與已去除秘密的相關 logs。不要附上 `.env` 全文。

問題解除後，回到[從一台主機開始部署 QJudge](deployment.md)重新執行對應的驗收步驟。
