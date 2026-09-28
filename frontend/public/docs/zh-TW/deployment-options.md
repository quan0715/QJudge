# 網路入口與選用功能

這一頁說明 QJudge 對外的入口怎麼接，以及登入、Email、AI provider 與 MCP 的設定。所有設定都寫在 `deploy/.env`；修改後依[部署指南](deployment.md)第 8 節執行 `deploy/qjudge check` 並以目前版本重新 `upgrade`。

## 入口的結構

`frontend` container 是唯一的 HTTP 入口，綁在 `FRONTEND_BIND_ADDRESS:FRONTEND_PORT`（預設 `127.0.0.1:8080`）。它提供網頁，並把 `/api`、`/o`、`/.well-known`、`/admin`、`/django-admin`、`/static`、`/media` 與 `/mcp` 分流到各服務，所以主站只需要一條反向代理規則。

放在前面的反向代理必須：

- 保留原本的 `Host`。
- 以附加方式設定 `X-Forwarded-For`，並設定 `X-Forwarded-Proto`。Origin 為 HTTPS 時，backend 依 `X-Forwarded-Proto` 判斷連線是否已加密，缺少時會一直導向 HTTPS。
- 關閉 buffering，讓串流回應（例如 AI 回覆）即時送達。

`deploy/qjudge ingress --nginx` 會輸出符合上述條件的 nginx 設定，憑證路徑需自行填入。

## 反向代理在同一台主機

維持預設即可：`FRONTEND_BIND_ADDRESS` 留空（`127.0.0.1`），反向代理連到 `http://127.0.0.1:8080`。Frontend 只接受本機連線，`QJUDGE_TRUSTED_PROXIES` 可以不設定。

## 反向代理在另一台主機

例如 VPS 與反向代理位於同一個內網：

```text
FRONTEND_BIND_ADDRESS=10.0.0.5
QJUDGE_TRUSTED_PROXIES=10.0.0.2
```

- `FRONTEND_BIND_ADDRESS` 填 VPS 在內網的 IP，反向代理連到 `http://10.0.0.5:8080`。
- `QJUDGE_TRUSTED_PROXIES` 填反向代理的 IP 或 CIDR（多個以逗號分隔）。Frontend 只接受這些位址送來的 `X-Forwarded-For`，其餘來源的 header 不會被採信。Bind address 不是本機位址時這一項必填，`check` 也會拒絕 `0.0.0.0/0` 這類信任所有來源的值。
- 以主機防火牆限制只有反向代理能連到 `FRONTEND_PORT`。自帶 MinIO 的 `9000`、自帶 LiveKit 的 `7880` 與 `5349` 也綁在同一個位址，同樣只開放給反向代理。

改完後執行 `upgrade` 套用；有自帶 addon 時，再執行 `deploy/qjudge addon storage up`／`addon media up` 讓它們改綁新位址。

## Cloudflare Tunnel

不想在主機開放 HTTP port 時，可以改用 Cloudflare Tunnel：

```text
COMPOSE_PROFILES=tunnel
TUNNEL_TOKEN=<Cloudflare 提供的 token>
```

`cloudflared` 屬於主要的 Compose project，由 `upgrade` 一起啟動。`deploy/qjudge ingress` 會列出要在 Cloudflare 設定的 public hostname：主站導向 `http://frontend:80`，自帶 MinIO 導向 `http://minio:9000`，自帶 LiveKit 導向 `http://livekit:7880`。

Tunnel 只轉送 HTTP。即時監看的 media 與 TURN port 仍須直接開放，見[設定即時監看](deployment-live-monitoring.md)。

## 第三方登入

QJudge 內建 NYCU、GitHub 與 Google 登入。只設定要使用的 provider，client ID 與 secret 必須成對：

```text
GITHUB_OAUTH_CLIENT_ID=<client id>
GITHUB_OAUTH_CLIENT_SECRET=<client secret>
```

在 provider 登記的 callback 是 frontend 的路徑：

```text
https://judge.example.edu/auth/<provider>/callback
```

`<provider>` 為 `nycu`、`github` 或 `google`。`AUTH_EMAIL_PASSWORD_ENABLED=false` 會關閉 email／密碼登入，只保留第三方登入。

## Email

寄送 Email 需要 SMTP：

```text
EMAIL_HOST=smtp.example.edu
EMAIL_PORT=587
EMAIL_HOST_USER=<username>
EMAIL_HOST_PASSWORD=<password>
DEFAULT_FROM_EMAIL=qjudge@example.edu
```

`EMAIL_HOST_USER` 與 `EMAIL_HOST_PASSWORD` 必須成對，連線使用 TLS。

## AI provider

AI 助教由 QJudge 主動呼叫模型服務，只需要主機能連出去，不必公開 QJudge。在主機的 `deploy/ai/models.yml` 列出可用模型及預設模型；OpenAI、DeepSeek 與自架 OpenAI-compatible 端點都在此設定。API key 放在 `deploy/ai/keys.env`，不放進模型清單。沒有可用模型時，AI 功能會顯示設定提示，其他功能不受影響。現有部署的轉換與回滾步驟請參閱專案原始碼的 `docs/operations/ai-model-configuration.md`。

## Remote MCP

外部的 AI 工具以 `<origin>/mcp` 連線，例如 `https://judge.example.edu/mcp`。這條路徑與 OAuth metadata 都由 frontend 分流，不需要額外的網域、port 或設定。使用者端的設定方式見[讓 AI 工具連接 QJudge](mcp-setup.md)。外部工具會經由 QJudge 的 OAuth 授權，實際使用時 origin 應為 HTTPS。
