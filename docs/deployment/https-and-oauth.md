# HTTPS 與 OAuth

最小部署可先使用 HTTP。當 QJudge 要公開到 Internet、啟用第三方登入或提供 Remote MCP 時，才需要穩定的公開 HTTPS origin。

## 選擇公開入口

| 方式 | 適用情境 | 部署者負責事項 | QJudge 狀態 |
| --- | --- | --- | --- |
| Private HTTP | 實驗室內網、VPN 或暫時驗證 | 限制網路存取，不啟用公開 OAuth | 最小部署可用 |
| Caddy／Nginx + ACME | 已有公開 IP 與網域 | DNS、port 80/443、certificate renewal、proxy routes | 可用架構，尚未提供專用設定檔 |
| Cloudflare Tunnel | 不直接開放 inbound application port | Cloudflare zone、Tunnel、public hostname routes 與 token | Compose `tunnel` profile 已提供 |
| Cloud load balancer | 既有雲端 ingress 架構 | Load balancer、certificate、health check、forwarding rules | 尚未建立供應商專用流程 |

Private HTTP 只能用在可信任網路。登入 cookie、OAuth code 或 MCP token 經過不受信任網路時，必須使用 HTTPS。

## Public origin

`QJUDGE_PUBLIC_ORIGIN` 是使用者實際開啟的 origin，也是 frontend URL、CORS、CSRF 與 OAuth issuer 的共同來源。Production settings 會依它的 scheme 決定 SSL redirect、Secure cookies 與 HSTS。例如：

```text
https://judge.example.com
```

它不能包含 `/app`、query 或 fragment。反向代理必須保留原始 host、scheme 與必要的 forwarding headers，否則 callback、cookie 或 CSRF 驗證可能失敗。

## 第三方 OAuth

Production 部署預設仍可使用 password login。啟用 NYCU、GitHub 或 Google OAuth 時，要在 provider console 登記 HTTPS callback：

```text
https://judge.example.com/api/v1/auth/callback/nycu
https://judge.example.com/api/v1/auth/callback/github
https://judge.example.com/api/v1/auth/callback/google
```

只提供實際使用的 provider credential，且 client ID 與 client secret 必須成對設定。全新安裝可在執行 `setup-env.sh` 前匯出，例如：

```bash
export GITHUB_OAUTH_CLIENT_ID=...
read -r -s -p "GitHub OAuth client secret: " GITHUB_OAUTH_CLIENT_SECRET
printf '\n'
export GITHUB_OAUTH_CLIENT_SECRET
```

初始化工具會拒絕只提供其中一個值。既有部署不要用 `setup-env.sh --force` 加入 OAuth credential，因為它會重新產生資料庫與應用 secrets；應透過 secret manager 或安全編輯方式更新 `.env`，再重建 backend。

```bash
docker compose up -d --no-deps --force-recreate backend
```

完成後要測試 login redirect、callback、使用者資料與 logout，不能只確認 provider 按鈕出現。

## Cloudflare Tunnel

Cloudflare Tunnel 是選用 profile。沒有 `TUNNEL_TOKEN` 時，預設 `docker compose up` 不會啟動 `cloudflared`。

### 全新安裝

先在 Cloudflare 建立 Tunnel 與 public hostname routes，取得 token。Route 至少要讓 public origin 到達 frontend；Remote MCP 還要將 `/mcp` 導向 MCP service，實際 routing policy 由 Cloudflare 端管理。

在第一次初始化前連同 R2 inputs 一起匯出：

```bash
export TUNNEL_TOKEN=...
export OBJECT_STORAGE_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
export OBJECT_STORAGE_ACCESS_KEY=...
export OBJECT_STORAGE_SECRET_KEY=...
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin https://judge.example.com
```

正式部署腳本偵測到 token 後會自動加入 `tunnel` profile。若 application 已啟動，也可以單獨啟動：

```bash
docker compose --profile tunnel up -d cloudflared
```

### 既有部署

不要重跑 `setup-env.sh --force`。先備份並透過 secret manager 或安全編輯方式，在既有 `.env` 加入 `TUNNEL_TOKEN`，同時確認 `QJUDGE_PUBLIC_ORIGIN` 已改為 HTTPS origin，再重新建立受 public origin 影響的 services：

```bash
docker compose --profile tunnel up -d --force-recreate backend frontend qjudge-mcp cloudflared
```

改變 public origin 會影響 browser security 與 OAuth issuer。正式切換前要先確認 DNS／Tunnel route，並安排能回復舊 origin 的維護窗口。

## 反向代理基本條件

若不使用 Tunnel，反向代理至少要處理：

- Port 80 轉址 HTTPS。
- Port 443 TLS termination 與 certificate renewal。
- `/` 轉向 frontend。
- `/api`、WebSocket 與需要的 streaming routes 正確轉向 backend。
- Remote MCP 的 `/mcp` transport、長連線與 request headers。
- Upload size、proxy timeout 與 forwarded headers。

具體設定必須配合實際 proxy 軟體與網域驗證，完成前不要把 application ports 直接暴露到 Internet。

## 驗收

1. HTTP request 會轉址到正確 HTTPS origin，或 private-only 部署確實無法從 Internet 存取。
2. Browser 沒有 mixed content、CORS 或 CSRF 錯誤。
3. Password login、refresh 與 logout 正常。
4. 每個已啟用的第三方 OAuth provider 都能完成完整 callback。
5. 若啟用 Remote MCP，外部 client 能完成 OAuth 與 MCP initialization。
6. 若啟用 Tunnel，`docker compose --profile tunnel ps cloudflared` 顯示 running，Cloudflare route 指向正確 service。
7. 未啟用 Tunnel 時，預設 service 清單不含 `cloudflared`；這是正常狀態。

Cloudflare account、DNS 與歷史 route 背景另見 [Cloudflare Deployment Notes](../cloudflare.md)。

返回 [QJudge 正式架設與部署指南](../deployment.md)。
