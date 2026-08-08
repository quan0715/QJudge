# Cloudflare Deployment Notes

QJudge 的正式部署主線請先閱讀 [正式架設與部署指南](deployment.md)。HTTPS、OAuth 與 Tunnel 操作以 [HTTPS 與 OAuth](deployment/https-and-oauth.md) 為準；R2 操作以 [S3-compatible Object Storage](deployment/object-storage.md) 為準。

本文件保存 Cloudflare 平台選擇、既有帳號資源與 landing page 的背景。這些資訊不是最小部署的前置條件。

## Cloudflare 在 QJudge 的用途

- **Cloudflare Tunnel**：選用的公開 ingress。Production Compose 以 `tunnel` profile 提供 `cloudflared`。
- **Cloudflare DNS／Proxy**：管理 `q-judge.com` 與相關 subdomains。
- **Cloudflare R2**：目前 deployment initializer 支援的 S3-compatible object storage。
- **Cloudflare Pages**：適合獨立 static landing page，不直接取代 Django、Celery、PostgreSQL、Redis、Judge 與 MCP services。
- **Workers／D1／KV**：不是目前 QJudge application runtime 的主要部署方式。

不使用 Tunnel 時，可改採自行管理的 reverse proxy 或 private network。是否使用 Cloudflare 不改變 QJudge 的 Compose 與 `.env` 主流程。

## Historical MCP Inspection Snapshot

以下是 2026-04-24 透過 Cloudflare MCP API 取得的外部狀態快照。它只描述當時帳號狀態，不能取代部署驗證；使用前要重新確認 Cloudflare 實際設定。

- Account：`5c4436c7b498dada4961ff21dfd81595`
- Zones：`q-judge.com`、`quan.wtf`
- `q-judge.com` plan：Free Website
- Production tunnel：`QJudge_Production`，tunnel id `71730ffe-e9d4-4c7d-87c7-11c06ab5a85a`
- Dev tunnel：`QJudge-Dev`，tunnel id `6180bcd2-1559-4ff4-b09b-5248feed9e3a`
- 當時 DNS 將 `q-judge.com`、`grafana.q-judge.com`、`monitor.q-judge.com`、`mcp.q-judge.com` 指向 production tunnel CNAME
- 當時 production ingress：
  - `q-judge.com` → `http://frontend:80`
  - `grafana.q-judge.com` → `http://grafana:3000`
  - `monitor.q-judge.com` → `http://glitchtip:8000`
  - `mcp.q-judge.com` → `http://qjudge-mcp:9000`
- Workers：none
- Pages projects：none
- D1 databases：none
- KV namespaces：none
- R2 buckets：一個名為 `image` 的 bucket

舊監控 routes 已不屬於目前預設部署。若帳號仍保留這些 routes，應在 Cloudflare 端另外確認用途或移除。

## Landing Page

Frontend repository 內的 `frontend/wrangler.jsonc` 用於獨立 landing page：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "qjudge-landing",
  "compatibility_date": "2026-04-24",
  "pages_build_output_dir": "./dist-landing",
  "send_metrics": false
}
```

相關命令：

```bash
cd frontend
npm run build:landing
npm run cf:landing:create
npm run cf:landing:deploy:preview
npm run cf:landing:deploy
```

Landing deployment 與 production application CD 分開：

- Workflow：`.github/workflows/deploy-landing.yml`
- Project：`qjudge-landing`
- Production domain：`https://www.q-judge.com`
- Pages fallback：`https://qjudge-landing.pages.dev`
- GitHub secret：`CLOUDFLARE_API_TOKEN`

Token 只需要部署 Pages project 所需的最小 account permissions，不需要遠端 Docker host 或 deployment SSH 權限。

## Tunnel Background

Production Compose 中的 `cloudflared` 是 opt-in profile。Token、全新安裝、既有 `.env` 更新與驗收步驟統一維護在 [HTTPS 與 OAuth](deployment/https-and-oauth.md)，本頁不再保存第二份操作指令。

Tunnel route 由 Cloudflare remote configuration 管理。變更 public hostname 後，除了 container 狀態，還要驗證 DNS、ingress target、OAuth callback 與 Remote MCP transport。

## R2 Background

Application 只接受四個 operator-managed `OBJECT_STORAGE_*` inputs。Production bucket names、auto-create policy 與 TTL 是版本化的 Compose defaults；正式 bucket 建立、credential 與 CORS 步驟統一維護在 [S3-compatible Object Storage](deployment/object-storage.md)。

早期 Cloudflare 環境曾使用 `qjudge-*` prefixed bucket names。現行 production Compose 使用 `anticheat-raw`、`markdown-images` 與 `ai-artifacts`；切換既有資料前要先制定搬移與回復計畫，不能只改 bucket 名稱。

## Realtime

Cloudflare Realtime 是考試 live monitoring 的選用 provider，不屬於最小部署。Compose 預設停用功能；需要啟用時才提供 `CLOUDFLARE_REALTIME_APP_ID` 與 `CLOUDFLARE_REALTIME_APP_SECRET`，並另外驗證 room 建立、publisher 權限、TTL 與瀏覽器連線。

Realtime credentials 應透過 secret manager 或初始化前的 shell 傳入，不把 feature flag、room prefix、API base URL 或 TTL 重新搬回根目錄 `.env`。
