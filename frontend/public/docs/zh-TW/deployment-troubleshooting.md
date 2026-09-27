# 部署故障排除

先找出最早失敗的一步，不要一開始就重啟所有服務、重建 `deploy/.env` 或刪除 volume。以下指令的 `qjudge` 是 Compose project 名稱；`deploy/.env` 設定了 `COMPOSE_PROJECT_NAME` 時改用該值。自帶的 addon 分別在 `qjudge-storage` 與 `qjudge-media` project 中。

## 先看這三個

```bash
deploy/qjudge check
docker compose -p qjudge ps --all
docker compose -p qjudge logs --tail=200 <service>
```

`check` 一次列出 `deploy/.env` 的所有問題；沒有問題時顯示 `…/.env: OK`。`ps` 中長駐服務應為 running 或 healthy。依症狀查看對應服務的 log：

| 服務 | 負責 |
| --- | --- |
| `frontend` | HTTP 入口與路徑分流 |
| `backend` | Django API |
| `celery`、`celery-high`、`celery-beat` | 背景工作與程式評測 |
| `ai-service`、`ai-worker`、`ai-scheduler` | AI 助教 |
| `integrity-resident`、`integrity-reconciler` | 考試 Integrity |
| `qjudge-mcp` | Remote MCP |
| `postgres`、`pgbouncer`、`redis` | 資料庫與 queue |
| `cloudflared` | Cloudflare Tunnel |

## `check` 的錯誤

每一行是一個 key 與原因，例如：

- `…: unknown key` — 不是目前支援的 key，對照 `deploy/.env.example` 修正或刪除。
- `…: required.` — 必填或所選功能需要的 key 沒有值。
- `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL: must use https when QJUDGE_PUBLIC_ORIGIN uses https`
- `QJUDGE_PUBLIC_ORIGIN: must not include a path, query, or fragment`
- DB 密碼只能包含英數字與 `-._~`，因為它會直接放進連線 URL。

`init` 在 `deploy/.env` 已存在時拒絕執行；要修改設定請直接編輯該檔。

## `upgrade` 失敗

`upgrade` 會印出停在哪一步：

| 訊息 | 處理 |
| --- | --- |
| `N problem(s) in …` | 依上方的 `check` 錯誤修正 |
| git 的 checkout 錯誤 | 確認 ref 存在於 remote；`git fetch` 失敗時只會使用本機已有的 ref |
| `judge image unavailable` | 無法從 GHCR 取得，本機 build `backend/judge/Dockerfile.judge` 也失敗；看前面的 Docker 輸出 |
| `build failed` | 看前面的 build 輸出中第一個失敗的 image |
| `postgres is not healthy`、`database backup failed` | 查看 `postgres` 的 log 與磁碟空間 |
| `<service> failed; application services still run the previous version` | `migrate`、`ai-migrate` 或金鑰產生失敗；錯誤直接顯示在上方輸出 |
| `sha-… is not healthy` | 新版服務在 5 分鐘內沒有通過健康檢查；有上一版時會以上一版的 image 重新啟動 |

這些情況都會 checkout 回原本的版本，資料庫不會自動還原。印出 `Database not restored` 時，下一行是最新備份與還原指令；只有 migration 不能與舊版程式共存時才需要還原，步驟見[部署指南](deployment.md)第 9 節。

健康檢查要求 `backend`、`ai-service`、`integrity-resident` 皆為 healthy，而且直接對 frontend 的 `/api/health/`（帶 origin 的 `Host` 與 `X-Forwarded-Proto`）回應 200，不經過反向代理。

## 網站打不開或一直重新導向

先確認入口設定與 `deploy/qjudge ingress` 的輸出一致，再從反向代理所在的主機直接測試 frontend（位址與 port 換成 `ingress` 列出的值）：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Host: judge.example.edu' -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8080/api/health/
```

- `200`：QJudge 正常，問題在反向代理、DNS 或憑證。
- `400`：`Host` 與 `QJUDGE_PUBLIC_ORIGIN` 的網域不同。
- 連不上：檢查 `FRONTEND_BIND_ADDRESS`、`FRONTEND_PORT` 與防火牆，以及 `frontend` 是否 running。

瀏覽器一直重新導向時，檢查反向代理是否設定 `X-Forwarded-Proto`。Origin 為 HTTPS 而請求沒有這個 header 時，backend 會回應 `301` 導向 HTTPS。

後台看到的使用者 IP 都是反向代理的位址時，確認 `QJUDGE_TRUSTED_PROXIES` 包含反向代理的 IP，且反向代理有附加 `X-Forwarded-For`。使用 Tunnel 時查看 `docker compose -p qjudge logs --tail=200 cloudflared`，並確認 Cloudflare 的 route 與 `ingress` 列出的一致。

## 檔案上傳或圖片讀取失敗

| 症狀 | 檢查 |
| --- | --- |
| 瀏覽器顯示 CORS error | Bundled：修改 origin 後要重新執行 `deploy/qjudge addon storage up`。External：bucket CORS 要允許 `QJUDGE_PUBLIC_ORIGIN` 與 `GET`、`PUT`、`HEAD` |
| `SignatureDoesNotMatch` | 反向代理改寫了 `Host`，或瀏覽器連線的網址與 `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` 不同；也檢查主機時間 `date -u` |
| `NoSuchBucket` | Bundled 執行 `deploy/qjudge addon storage init`；External 建立 `OBJECT_STORAGE_BUCKET` 指定的 bucket |
| `AccessDenied` | Credential 沒有該 bucket 的讀寫權限 |

相關 log：`docker compose -p qjudge logs --tail=200 backend ai-worker`，bundled MinIO 為 `docker compose -p qjudge-storage logs --tail=200 minio`。Presigned URL 在有效時間內可以直接存取檔案，不要貼到公開的 issue。

## 提交後沒有評測結果

```bash
docker compose -p qjudge logs --tail=200 celery celery-high
docker image inspect oj-judge:latest --format '{{.Id}}'
```

評測由 `celery` 與 `celery-high` 透過主機的 Docker 執行 `oj-judge:latest`。Image 不存在時重新執行 `upgrade`，它會重新取得或 build judge image。

## 即時監看無法使用

1. 開啟 `/api/v1/contests/<contest_id>/exam/live/config/`：`enabled` 為 false 表示 `MEDIA_MODE` 未啟用或尚未重新 `upgrade`；`configured` 為 false 表示 LiveKit 設定不完整。
2. 查看 `docker compose -p qjudge-media logs --tail=200 livekit` 與 `backend` 的 log。Backend 以 `LIVEKIT_PUBLIC_URL` 推導出的 HTTPS 網址呼叫 LiveKit，container 內必須能連到它。
3. 只有部分網路連不上時，檢查 `LIVEKIT_NODE_IP` 上的 UDP／TCP port 與 443 的 TURN/TLS 轉送，對照 `deploy/qjudge ingress` 的輸出。

## 回報問題

附上以下資訊，並先移除 token、密碼、email、presigned URL 與學生資料：

```bash
git rev-parse HEAD
cat deploy/.version
docker version
docker compose version
deploy/qjudge check
docker compose -p qjudge ps --all
```

再加上異常服務的 log。不要附上 `deploy/.env` 或 `deploy/secrets/` 的內容。
