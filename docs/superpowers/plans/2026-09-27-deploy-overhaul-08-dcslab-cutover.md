# Deploy Overhaul 08：dcslab 轉換 Runbook

> **For agentic workers:** 這是一份在正式主機上執行的操作手冊，不是程式實作計畫。依順序執行，每個標記「使用者」的步驟必須等使用者完成並回報後才繼續。Agent 以 SSH 連 dcslab（帳號 `dcslab`，**沒有 sudo**），任何 `down -v`、刪除 volume、刪除 bucket 或資料目錄的動作都不做。

**Goal:** 把 dcslab 上的 `qjudge-app`（舊 compose）、`qjudge-media`（LiveKit + coturn）、`qjudge-prod`（MinIO）換成 `deploy/qjudge` 管理的 app stack 與 storage／media addon，沿用所有資料，之後以 `deploy/qjudge upgrade` 與 CD 部署。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md` §11

**計畫系列：** 01–07（完成）→ **08（本文件）**。

---

## 現況（2026-09-27 唯讀調查）

| 項目 | 值 |
|---|---|
| 主機 | `dcslab-4090-server`，`140.113.207.46`（`eno1`），Docker 29.6.2，無 sudo |
| repo | `/mnt/data/qjudge-app`，`master` @ `ee9ef7d`；未追蹤 `docker-compose.dcslab-production.yml`、`docker-compose.dcslab.yml`、`scripts/staging-ip.nginx.conf` |
| app project | `qjudge-app`，設定檔 `docker-compose.yml` + `docker-compose.dcslab-production.yml` + `docker-compose.dcslab.yml`；15 個服務；network `online_judge_oj_network` |
| volume | `qjudge-app_postgres_data`、`_integrity_resident_data`、`_judge_tmp`、`_media_volume`、`_static_volume`（與新 compose 的 volume 名稱相同） |
| DB | role `qjudge_admin`（superuser）、`qjudge_web`、`qjudge_ai`；DB `online_judge` 560 MB、`qjudge_ai` 383 MB；三組密碼皆為 48 字元且 URL-safe，不需 `ALTER ROLE` |
| secrets | `/mnt/data/qjudge-app/secrets/`（AI OAuth 金鑰；`integrity/` 內 4 個檔，`backend-public-key`、`resident-service-token` 群組 10001） |
| MinIO | project `qjudge-prod`（`/mnt/data/qjudge-prod/docker-compose.migration.yml`），image `quay.io/minio/minio@sha256:14cea4…`，資料 `/mnt/data/qjudge-data/minio`（`xl-single`），873 MiB／16642 物件；bucket `qjudge-anticheat-raw`、`qjudge-markdown-images`、`qjudge-ai-artifacts`、空的 `qjudge-dev` |
| 儲存網址 | `https://storage.q-judge.com`（app 內外都走這個網址） |
| media | project `qjudge-media`（`/mnt/data/qjudge-media`），host network；LiveKit `node_ip` 140.113.207.46，7880／7881／UDP 50000–50099；coturn 3478、TLS 5349、relay 50300–50399；`turn_servers` 指向 `turn.q-judge.com` |
| 入口 | Cloudflare Tunnel（app 內的 `cloudflared`）提供 `q-judge.com`、`mcp.q-judge.com`；主機 HAProxy `:443` 依 SNI：`turn`／`relay.q-judge.com` → `127.0.0.1:5349`（coturn TLS passthrough）、`storage.q-judge.com` → nginx `127.0.0.1:8444` → MinIO 9000、其他 → nginx `127.0.0.1:8443` → LiveKit 7880；憑證 lineage `/etc/letsencrypt/live/qjudge-media/` |
| port | 8080、8445 未使用；5349、7880、9000、9001 由舊 media／MinIO 佔用（停掉後釋出） |
| 其他 | backend 環境裡的 `LIVEKIT_NODE_IP=140.113.220.195` 已過時（新版不再讀）；`.env` 內 `RECUR_*`、`GLITCHTIP_*` 程式已不使用 |

新設定的對應：

| 新 key | 來源 |
|---|---|
| `COMPOSE_PROJECT_NAME` | `qjudge-app`（沿用 volume） |
| `QJUDGE_PUBLIC_ORIGIN` | `https://q-judge.com` |
| `COMPOSE_PROFILES`、`TUNNEL_TOKEN` | `tunnel`；舊 `.env` 的 `TUNNEL_TOKEN` |
| `SECRET_KEY`、`DB_PASSWORD` | 執行中 backend 的環境 |
| `POSTGRES_ADMIN_PASSWORD` | 執行中 postgres 的 `POSTGRES_PASSWORD` |
| `AI_DB_PASSWORD` | 執行中 ai-service `AI_DATABASE_URL` 內的密碼 |
| `CREDENTIAL_LEASE_SECRET`、AI provider key／base URL | 執行中 ai-service／ai-worker 的環境 |
| OAuth、SMTP、`AUTH_EMAIL_PASSWORD_ENABLED`、`QAUTH_PROVIDER_CONNECTIONS_JSON` | 執行中 backend 的環境（有設定才寫） |
| `STORAGE_MODE` 等 | `bundled`；endpoint `http://minio:9000`；公開網址 `https://storage.q-judge.com`；access／secret key = 執行中 MinIO 的 `MINIO_ROOT_USER`／`MINIO_ROOT_PASSWORD`；bucket `qjudge`；`MINIO_DATA_DIR=/mnt/data/qjudge-data/minio` |
| `MEDIA_MODE` 等 | `bundled`；`LIVEKIT_PUBLIC_URL=wss://rtc.q-judge.com`；API key／secret = 執行中 backend 的 `LIVEKIT_API_KEY`／`LIVEKIT_API_SECRET`；`LIVEKIT_NODE_IP=140.113.207.46`；`LIVEKIT_TURN_HOST=turn.q-judge.com` |
| `HOST_PROJECT_ROOT` | `/mnt/data/qjudge-app` |
| `FRONTEND_BIND_ADDRESS`、`QJUDGE_TRUSTED_PROXIES` | 不設（frontend 綁 127.0.0.1:8080，只由 Tunnel 與本機 nginx 連入） |

轉換後的入口：

| 網域 | 轉換後 |
|---|---|
| `q-judge.com` | Tunnel → `http://frontend:80`（不變；`frontend` 在新 network `qjudge` 上） |
| `mcp.q-judge.com` | 停用；Remote MCP 改為 `https://q-judge.com/mcp`（事先通知使用者更新 MCP client） |
| `storage.q-judge.com` | 不變（nginx 8444 → `127.0.0.1:9000`，改由 storage addon 提供） |
| `rtc.q-judge.com` | 不變（nginx 8443 → `127.0.0.1:7880`，改由 media addon 提供） |
| `turn.q-judge.com`（TLS 443） | HAProxy → **新** nginx stream `127.0.0.1:8445`（終止 TLS）→ `127.0.0.1:5349`（LiveKit 內建 TURN） |
| UDP 3478、TCP 7881、UDP 50000–50099、UDP 50300–50399 | 不變（改由 LiveKit 容器同埠公開） |

---

## A. 事前準備（不停機）

- [ ] **A1（Agent）確認 dev 的 CI 全綠**，包含最新一次 push；需要時手動觸發 `E2E (manual only)` 一次並確認通過。
- [ ] **A2（使用者決定）開 release PR `dev` → `main`**（依 `qjudge-github-workflow-owner`）。PR 會跑 coding E2E。**先不要合併**；在維護時段開始時才合併。合併後 main 不再支援舊部署方式，hotfix 只能等轉換完成後走新流程。
- [ ] **A3（使用者）決定維護時段**（預估 60–90 分鐘停機），事先公告；並公告 Remote MCP 網址改為 `https://q-judge.com/mcp`。
- [ ] **A4（使用者，sudo）準備 TURN 的 TLS 終止**，先不切換 HAProxy：在 nginx 加 `stream` 區塊（`/etc/nginx/nginx.conf` 的頂層，或 include 一個 stream 設定檔）：

```nginx
stream {
    server {
        listen 127.0.0.1:8445 ssl;
        ssl_certificate     /etc/letsencrypt/live/qjudge-media/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/qjudge-media/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        proxy_pass 127.0.0.1:5349;
    }
}
```

`sudo nginx -t && sudo systemctl reload nginx`。此時 8445 尚無流量（HAProxy 仍指向 coturn 的 5349）。確認憑證 lineage `qjudge-media` 涵蓋 `turn.q-judge.com`（`sudo certbot certificates`）。certbot renew hook 之後只需要 reload nginx 與 HAProxy（不再需要重啟 coturn）。

- [ ] **A5（Agent）在 dcslab 以獨立 worktree 預先 build**，縮短停機時間（不影響執行中的服務）：

```bash
cd /mnt/data/qjudge-app
git fetch --tags --prune origin
git worktree add --detach /mnt/data/qjudge-next origin/dev   # A2 合併後改用 main 的 SHA
cd /mnt/data/qjudge-next
SHA=$(git rev-parse HEAD)
QJUDGE_VERSION=sha-${SHA:0:12} docker compose --project-name qjudge-app --project-directory deploy \
  --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml build
docker pull cgr.dev/chainguard/minio@sha256:6a1d0b45c8669726bba580ced0bfa4cb9fdeed1ed636dfabd81d1577beb6937b
docker pull livekit/livekit-server:v1.13.7@sha256:6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3
```

（build 只產生 `qjudge/*:sha-…` image；`--env-file deploy/.env.example` 只為了讓 compose 能解析，不會啟動任何服務。若 A2 的合併 SHA 與這裡不同，維護時段的 `upgrade` 會以 cache 重新 build，時間很短。）

- [ ] **A6（Agent）產生新 `.env` 並檢查**（寫在 worktree，不動執行中的服務；只輸出 key 名稱，不輸出值）：

```bash
cd /mnt/data/qjudge-next
python3 - <<'PY'
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, "deploy")
from qjudge_cli.schema import KEYS
from qjudge_cli.init import render_env

def env_of(project, service):
    cid = subprocess.run(["docker", "compose", "-p", project, "ps", "-q", service], capture_output=True, text=True).stdout.split()[0]
    data = json.loads(subprocess.run(["docker", "inspect", cid], capture_output=True, text=True).stdout)[0]["Config"]["Env"]
    return dict(item.split("=", 1) for item in data)

backend, ai, worker = env_of("qjudge-app", "backend"), env_of("qjudge-app", "ai-service"), env_of("qjudge-app", "ai-worker")
postgres = env_of("qjudge-app", "postgres")
minio = env_of("qjudge-prod", "minio")
old = dict(line.split("=", 1) for line in Path("/mnt/data/qjudge-app/.env").read_text().splitlines()
           if "=" in line and not line.lstrip().startswith("#"))
ai_password = re.match(r".*://[^:]+:([^@]+)@", ai["AI_DATABASE_URL"]).group(1)

env = {
    "COMPOSE_PROJECT_NAME": "qjudge-app",
    "QJUDGE_PUBLIC_ORIGIN": "https://q-judge.com",
    "COMPOSE_PROFILES": "tunnel",
    "TUNNEL_TOKEN": old["TUNNEL_TOKEN"].strip().strip('"'),
    "SECRET_KEY": backend["SECRET_KEY"],
    "POSTGRES_ADMIN_PASSWORD": postgres["POSTGRES_PASSWORD"],
    "DB_PASSWORD": backend["DB_PASSWORD"],
    "AI_DB_PASSWORD": ai_password,
    "CREDENTIAL_LEASE_SECRET": ai["CREDENTIAL_LEASE_SECRET"],
    "HOST_PROJECT_ROOT": "/mnt/data/qjudge-app",
    "STORAGE_MODE": "bundled",
    "OBJECT_STORAGE_ENDPOINT_URL": "http://minio:9000",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://storage.q-judge.com",
    "OBJECT_STORAGE_ACCESS_KEY": minio["MINIO_ROOT_USER"],
    "OBJECT_STORAGE_SECRET_KEY": minio["MINIO_ROOT_PASSWORD"],
    "OBJECT_STORAGE_BUCKET": "qjudge",
    "MINIO_DATA_DIR": "/mnt/data/qjudge-data/minio",
    "MEDIA_MODE": "bundled",
    "LIVEKIT_PUBLIC_URL": "wss://rtc.q-judge.com",
    "LIVEKIT_API_KEY": backend["LIVEKIT_API_KEY"],
    "LIVEKIT_API_SECRET": backend["LIVEKIT_API_SECRET"],
    "LIVEKIT_NODE_IP": "140.113.207.46",
    "LIVEKIT_TURN_HOST": "turn.q-judge.com",
}
known = {key.name for key in KEYS}
for source in (backend, worker):
    for name, value in source.items():
        if name in known and name not in env and value.strip():
            env[name] = value
target = Path("deploy/.env")
target.write_text(render_env(env))
target.chmod(0o600)
print("keys:", ", ".join(sorted(env)))
PY
deploy/qjudge check
deploy/qjudge ingress
```

Expected：`check` 為 OK；`ingress` 列出的入口與上方「轉換後的入口」一致（storage 9000、LiveKit 7880、TURN 5349、frontend 8080）。`render_env` 若名稱不同，依 `deploy/qjudge_cli/init.py` 實際函式調整。任何從 backend 環境複製進來的 key 都要列在輸出中，讓使用者確認沒有多餘的值。

- [ ] **A7（Agent）比對 volume 與 network**：`docker volume ls` 確認 5 個 `qjudge-app_*` volume 存在；`QJUDGE_VERSION=sha-… docker compose --project-name qjudge-app --project-directory deploy --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.build.yml config --volumes` 列出相同的 5 個名稱。

---

## B. 維護時段

每一步完成後在對話中回報結果；任一步驟失敗依 C 節回退。

- [ ] **B1（Agent）備份**（`BK=/mnt/data/qjudge-backups/cutover-$(date -u +%Y%m%dT%H%M%SZ)`，目錄 0700）：

```bash
mkdir -p -m 700 "$BK"
P=$(docker compose -p qjudge-app ps -q postgres)
for db in online_judge qjudge_ai; do
  docker exec "$P" pg_dump -U qjudge_admin -d "$db" -Fc > "$BK/$db.dump"
done
cp -a /mnt/data/qjudge-app/.env /mnt/data/qjudge-app/secrets "$BK/"
docker compose -p qjudge-app ps --format '{{.Service}} {{.Image}}' > "$BK/images.txt"
```

MinIO 資料在 B3 停掉 MinIO 後備份。確認兩個 dump 大小合理（`pg_restore --list` 可讀）。

- [ ] **B2（使用者）合併 release PR**，回報 main 的合併 SHA（下稱 `$SHA`）。

- [ ] **B3（Agent）停止舊服務**（`stop`，保留容器以便回退）：

```bash
cd /mnt/data/qjudge-app
docker compose -p qjudge-app -f docker-compose.yml -f docker-compose.dcslab-production.yml -f docker-compose.dcslab.yml stop
docker compose -p qjudge-media -f /mnt/data/qjudge-media/compose.yaml stop
docker compose -p qjudge-prod -f /mnt/data/qjudge-prod/docker-compose.migration.yml stop
docker run --rm -v /mnt/data/qjudge-data/minio:/data:ro -v "$BK":/backup alpine tar -czf /backup/minio-data.tgz -C /data .
```

（MinIO 資料目錄屬 root，因此以容器打包。）

- [ ] **B4（Agent）切換程式碼與設定**：

```bash
cd /mnt/data/qjudge-app
git fetch --tags --prune origin
git checkout --detach "$SHA"
mkdir -p -m 700 deploy/secrets
cp -a secrets/. deploy/secrets/
cp /mnt/data/qjudge-next/deploy/.env deploy/.env && chmod 600 deploy/.env
deploy/qjudge check
```

- [ ] **B5（Agent）storage addon 與 bucket 搬移**：

```bash
deploy/qjudge addon storage up
deploy/qjudge addon storage init
docker exec qjudge-app-storage-minio-1 sh -c '
  mc alias set l http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null &&
  for b in qjudge-anticheat-raw qjudge-markdown-images qjudge-ai-artifacts; do mc mirror --preserve l/$b l/qjudge || exit 1; done &&
  for b in qjudge-anticheat-raw qjudge-markdown-images qjudge-ai-artifacts qjudge; do mc du l/$b; done'
```

（容器名稱以 `docker ps` 為準。）Expected：三個舊 bucket 的物件數與大小相加等於 `qjudge`（約 16642 物件／873 MiB）。舊 bucket 保留不刪。

- [ ] **B6（使用者，sudo）切換 TURN 的 HAProxy backend**：`turn_tls` 的 `server turn 127.0.0.1:5349` 改為 `server turn 127.0.0.1:8445`，`sudo haproxy -c -f /etc/haproxy/haproxy.cfg && sudo systemctl reload haproxy`。

- [ ] **B7（Agent）media addon**：

```bash
deploy/qjudge addon media up
docker compose -p qjudge-app-media ps
docker logs --tail=50 qjudge-app-media-livekit-1 2>&1 | grep -i -E "turn|node|error"
```

Expected：LiveKit running，log 有 `Starting TURN server`（UDP 3478、TLS 5349、external TLS）與 `node_ip` 140.113.207.46。

- [ ] **B8（Agent）安裝／升級 app**：

```bash
deploy/qjudge upgrade "$SHA"
```

Expected：`Upgraded to sha-…`；`deploy/.version` 只有 `current`；`deploy/backups/` 有一份備份。失敗時 `upgrade` 會 checkout 回原本的 ref，依 C 節回退。

- [ ] **B9（使用者）Cloudflare Tunnel**：`q-judge.com` 的 route 維持 `http://frontend:80`；刪除 `mcp.q-judge.com` 的 route（或改指 `http://frontend:80` 並接受 MCP resource 為 `https://q-judge.com`）。

- [ ] **B10 驗收（Agent 做可自動化的部分，使用者做瀏覽器部分）**：
  - Agent：`https://q-judge.com/api/health/` 200；`https://q-judge.com/.well-known/oauth-protected-resource` 200；`https://q-judge.com/mcp` POST 回 401；`docker compose -p qjudge-app ps` 全部 running／healthy；`manage.py healthcheck` 通過；backend 使用者數與 B1 前一致。
  - 使用者：登入（含 OAuth）、題目圖片顯示與上傳、提交程式並完成評測、考試中的 Integrity 證據上傳、AI 助教一次對話與 artifact 下載、MCP client 以新網址連線。
  - 使用者：監考 relay-only 測試——Firefox `about:config` 設 `media.peerconnection.ice.relay_only=true`，實際進行一次監考畫面串流，於 `about:webrtc` 確認 candidate 為 relay 且連線成功；分別在一般網路（UDP 3478）與封鎖 UDP 的網路（只走 TLS 443）各測一次。

---

## C. 回退

在 B10 完成前發現無法修復的問題：

```bash
cd /mnt/data/qjudge-app
docker compose -p qjudge-app --project-directory deploy --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.build.yml stop
docker compose -p qjudge-app-media --project-directory deploy --env-file deploy/.env -f deploy/addons/media/compose.yml stop
docker compose -p qjudge-app-storage --project-directory deploy --env-file deploy/.env -f deploy/addons/storage/compose.yml stop
git checkout --detach ee9ef7d
docker compose -p qjudge-prod -f /mnt/data/qjudge-prod/docker-compose.migration.yml start
docker compose -p qjudge-media -f /mnt/data/qjudge-media/compose.yaml start
docker compose -p qjudge-app -f docker-compose.yml -f docker-compose.dcslab-production.yml -f docker-compose.dcslab.yml up -d
```

- 使用者（sudo）：HAProxy `turn_tls` 改回 `127.0.0.1:5349`；Cloudflare 恢復 `mcp.q-judge.com` route。
- 新版 migration 已執行時，以 B1 的 dump 還原：`docker exec -i <postgres> pg_restore -U qjudge_admin --clean --if-exists -d <db> < "$BK/<db>.dump"`。
- MinIO 被新版啟動過後若舊版無法讀取，停掉 MinIO，以 `minio-data.tgz` 還原資料目錄後再啟動。
- 使用者（決定）：release PR 已合併到 main 時，以 revert PR 還原 main，或保留 main 並盡快重新安排轉換。

---

## D. 事後清理（驗收一週後，使用者確認再做）

- [ ] 移除舊 network：`docker network rm online_judge_oj_network`（確認沒有容器連線）。
- [ ] 刪除 bucket `qjudge-dev`；舊的三個 bucket 保留到下一次完整備份後再刪。
- [ ] 移除舊容器：`docker compose -p qjudge-media -f /mnt/data/qjudge-media/compose.yaml rm`、`qjudge-prod` 同理；舊 image（`oj-*`、`quay.io/minio/minio`）視磁碟需要刪除。
- [ ] repo 內未追蹤的 `docker-compose.dcslab*.yml`、`scripts/staging-ip.nginx.conf` 與根目錄 `.env`、`secrets/` 移到 `$BK` 保存；`/mnt/data/qjudge-next` worktree 以 `git worktree remove` 移除。
- [ ] 使用者（sudo）：certbot renew hook 移除重啟 coturn 的步驟，保留 reload nginx／HAProxy。
- [ ] CD：GitHub secret `PROD_DEPLOY_PATH` 維持 `/mnt/data/qjudge-app`；之後的部署以 CD（main 手動觸發）或在主機執行 `deploy/qjudge upgrade <sha>`。
