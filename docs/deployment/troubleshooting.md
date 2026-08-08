# 部署故障排除

依本頁順序檢查，先確認輸入與 rendered Compose，再看單一服務 log。一般診斷不需要刪除 volume、清空資料庫或重建 secrets。

## 1. 環境初始化

### 找不到 Docker socket

`setup-env.sh` 需要讀取 `/var/run/docker.sock` 的 UID/GID。先確認 Docker daemon 已啟動：

```bash
docker info
ls -l /var/run/docker.sock
```

不要手動猜測 UID/GID。修正 Docker daemon 或目前帳號權限後，重新執行初始化。

### 非互動模式缺少 R2 輸入

CI、SSH automation 或沒有 TTY 的 shell 不會出現互動提示。先確認四個變數名稱存在，不要輸出 secret value：

```bash
for key in \
  OBJECT_STORAGE_ENDPOINT_URL \
  OBJECT_STORAGE_PUBLIC_ENDPOINT_URL \
  OBJECT_STORAGE_ACCESS_KEY \
  OBJECT_STORAGE_SECRET_KEY
do
  if [ -n "$(printenv "$key")" ]; then
    printf '%s=set\n' "$key"
  else
    printf '%s=missing\n' "$key"
  fi
done
```

### 成對 credential 錯誤

NYCU、GitHub、Google OAuth、SMTP 與 Cloudflare Realtime credentials 都必須成對提供。若只設定 ID／username 或只設定 secret／password，初始化工具會停止，不會產生部分有效的 `.env`。

移除不使用的單一值，或補齊同一組 credential，再重新執行。

### 拒絕覆寫 `.env`

這是保護機制。先確認目標檔案：

```bash
ls -l .env
awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' .env
```

不要輸出完整 `.env` 到 terminal、issue 或 CI log。`--force` 會重新產生 secrets，只適合確認要替換整份環境的情況。

## 2. Compose interpolation

先執行唯讀 rendering：

```bash
docker compose config --quiet
```

如果顯示 required variable missing，檢查 `.env` 是否在 repository root，以及變數名稱是否符合 [.env.example](../../.env.example)。`.env.example` 的空白欄位只是 schema reference，不能直接拿來執行 production Compose。

需要檢查 service 是否進入預設清單時：

```bash
docker compose config --services
docker compose config --profiles
```

沒有設定 Tunnel 時，`cloudflared` 不會出現在預設 service 清單，這不是故障。

## 3. 容器狀態與 logs

先看所有服務，包含已退出的一次性服務：

```bash
docker compose ps --all
```

再針對異常服務讀取最近 logs：

```bash
docker compose logs --tail=200 SERVICE_NAME
```

常用服務名稱包括 `postgres`、`ai-db-bootstrap`、`ai-migrate`、`backend`、`ai-service`、`celery`、`ai-worker`、`frontend` 與 `integrity-controller`。

不要一開始就重啟整套服務。先找出第一個失敗的 dependency，修正後只重試該服務或其 downstream services。

## 4. Database bootstrap 與 migration

一次性資料庫服務應以 exit code `0` 完成：

```bash
docker compose ps --all ai-db-bootstrap ai-migrate
docker compose logs --tail=200 ai-db-bootstrap ai-migrate
```

Backend migration 在 backend container 的 startup command 執行：

```bash
docker compose logs --tail=200 backend
docker compose exec backend python manage.py showmigrations --plan
```

若 `ai-db-bootstrap` 顯示 role name、database name 或 password 錯誤，先檢查 `.env` 與既有 PostgreSQL volume 的身分是否一致。不要直接刪除 database volume；既有資料要先備份並確認 migration／credential rotation 方法。

## 5. Health checks

```bash
curl --fail http://127.0.0.1/
curl --fail http://127.0.0.1:8000/api/health/
curl --fail http://127.0.0.1:8001/health/ready
```

- 首頁失敗：先看 `frontend` 與 `backend`。
- Backend health 失敗：看 PostgreSQL、PgBouncer、Redis 與 backend migration。
- AI readiness 失敗：看 AI database、AI Redis queue 與 `ai-service` logs。AI API readiness 不要求 provider key。

## 6. R2 與 presigned URL

先確認 endpoint scheme 與主機時間：

```bash
awk -F= '/^OBJECT_STORAGE_(ENDPOINT_URL|PUBLIC_ENDPOINT_URL)=/{print $1 "=" $2}' .env
date -u
```

常見問題：

| 症狀 | 檢查 |
| --- | --- |
| Signature mismatch | Access key／secret、endpoint、主機時間 |
| Bucket not found | `anticheat-raw`、`markdown-images`、`ai-artifacts` 是否已建立 |
| Browser CORS error | Bucket CORS 是否允許 `QJUDGE_PUBLIC_ORIGIN` 與實際 method/header |
| Presigned URL 指向內部 host | `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL` 是否為瀏覽器可連線 endpoint |
| Access denied | Credential 是否具有指定 bucket 的 object read/write 權限 |

不要把 presigned URL 或 credential 貼到公開 issue；URL 在有效期限內可能帶有存取權限。

## 7. Judge、Docker socket 與 integrity secrets

確認 judge image：

```bash
docker image inspect oj-judge:latest >/dev/null
```

確認 Docker socket ownership：

```bash
stat -c '%u:%g %a %n' /var/run/docker.sock
```

確認 integrity files 是 regular files 且不輸出內容：

```bash
stat -c '%F %a %n' \
  secrets/integrity/controller-token \
  secrets/integrity/integrity-worker-signing-key
```

若 bind mount source 變成目錄，bootstrap script 會拒絕覆寫。先停止使用該路徑的 container，確認目錄沒有資料，再以可恢復方式移走錯誤目錄，重新執行：

```bash
python3 scripts/bootstrap_integrity_secrets.py
```

## 8. Tunnel profile

沒有 `TUNNEL_TOKEN`：

```bash
docker compose ps cloudflared
```

查不到 service 或沒有 running container 是正常狀態。啟用 Tunnel 後改用：

```bash
docker compose --profile tunnel ps cloudflared
docker compose --profile tunnel logs --tail=200 cloudflared
```

Token 有效但 public URL 無法存取時，還要檢查 Cloudflare 端的 Tunnel status、public hostname route、DNS 與 target service，不要只重啟 container。

## 9. 回報問題時需要的資料

提供下列不含 secrets 的內容：

```bash
git rev-parse HEAD
docker version
docker compose version
docker compose ps --all
```

再附上異常 service 的最近 200 行 logs，先移除 token、credential、email、presigned URL 與個人資料。

返回 [QJudge 正式架設與部署指南](../deployment.md)。
