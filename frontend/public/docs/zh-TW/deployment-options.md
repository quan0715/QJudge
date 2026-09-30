# 網路入口與選用功能

這一頁說明 QJudge 對外的入口怎麼接，以及登入、Email、AI provider 與 MCP 的設定。所有設定都寫在 `deploy/.env`；修改後依[部署指南](deployment.md)第 8 節執行 `deploy/qjudge check` 並以目前版本重新 `upgrade`。

## 入口的結構

`frontend` container 是唯一的 HTTP 入口，綁在 `FRONTEND_BIND_ADDRESS:FRONTEND_PORT`（預設 `127.0.0.1:8080`）。它提供網頁，並把 `/api`、`/o`、`/.well-known`、`/admin`、`/django-admin`、`/static`、`/media` 與 `/mcp` 分流到各服務，所以主站只需要一條反向代理規則。

放在前面的反向代理必須：

- 保留原本的 `Host`（含 port）與 URI。
- 以附加方式設定 `X-Forwarded-For`，並設定 `X-Forwarded-Proto`。Origin 為 HTTPS 時，backend 依 `X-Forwarded-Proto` 判斷連線是否已加密，缺少時會一直導向 HTTPS。
- 關閉 request／response buffering，讓上傳與串流回應即時送達。Bundled storage 使用主站時，代理也需允許其上傳大小（範例設定為 `client_max_body_size 0`）。
- 使用 bundled LiveKit 時，轉發 WebSocket `Upgrade`／`Connection` header 並允許長連線。

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

`cloudflared` 屬於主要的 Compose project，由 `upgrade` 一起啟動。`deploy/qjudge ingress` 會列出要在 Cloudflare 設定的 public hostname：主站導向 `http://frontend:80`，已包含 bundled MinIO 與 LiveKit signaling，不需要額外的 Tunnel route。明確指定另一個 storage 或 LiveKit 網域時才另外設定。

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

`<provider>` 為 `nycu`、`github` 或 `google`。`AUTH_EMAIL_PASSWORD_ENABLED=false` 會關閉 email／密碼登入，只保留第三方登入。詳細申請憑證、Callback URL 與設定流程見[配置第三方登入](#/docs/auth-setup)。

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

AI 助教由 QJudge 主動呼叫模型服務，只需要主機能連出去，不必公開 QJudge。每台主機在 `deploy/ai/` 設定自己提供的模型（詳細欄位規格、自架端點範例與驗證指令見[配置 AI 模型與服務](#/docs/ai-setup)）：

| 檔案 | 用途 |
| --- | --- |
| `deploy/ai/models.yml` | 可用模型、預設模型與自架端點；`deploy/qjudge init` 由 `models.example.yml` 建立 |
| `deploy/ai/keys.env` | Provider API key，只載入 `ai-service` 與 `ai-worker` |

```yaml
default: deepseek-flash
models:
  - id: deepseek-flash
    provider: deepseek
    display_name: DeepSeek V4.1 Flash
    reasoning_effort: high
    max_input_tokens: 1000000
  - id: gpt-6-luna
    provider: openai
    display_name: GPT-6 Luna
    reasoning_effort: medium
    max_input_tokens: 272000
  - id: campus-gemma
    provider: campus-vllm
    model: Gemma4-31B
    display_name: Campus Gemma
endpoints:
  campus-vllm:
    base_url: http://10.0.0.5:8000/v1
```

- `openai` 與 `deepseek` 是內建 provider。其他名稱視為自架的 OpenAI-compatible 端點，需要在 `endpoints` 寫 `base_url`。
- API key 的名稱是 provider 名稱轉大寫、`-` 改成 `_` 再加上 `_API_KEY`，例如 `OPENAI_API_KEY`、`CAMPUS_VLLM_API_KEY`，寫在 `keys.env`，不要寫進 YAML。內建 provider 必須有 key；自架端點沒有開驗證時可以不設。
- `model` 省略時送出與 `id` 相同的名稱。`default` 可省略；指定的預設模型暫時無法使用時，改用第一個可用模型。`models: []` 會關閉 AI 功能。
- `max_input_tokens` 是模型的 context 上限。內建 provider 只有在 LangChain 已知該模型時可以省略；自架模型省略時會向端點的 `/models` 讀取 `max_model_len`，讀不到的模型暫時不列出，60 秒後重試。
- `reasoning_effort` 可設 `low`、`medium` 或 `high`，自架端點不支援。

設定有誤時，其他功能照常運作，AI 助教與 AI 批改會顯示設定錯誤的提示，詳細原因寫在 `ai-service` 的 log。移除某個模型後，歷史紀錄仍保留原本的模型 ID。

修改 `deploy/ai/` 後，以目前版本重新執行 `upgrade` 套用，再重新啟動兩個 AI 服務，讓它們重新讀取模型清單：

```bash
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
docker compose -p qjudge restart ai-service ai-worker
```

`upgrade` 在停止任何服務之前就會檢查模型設定，有錯誤時中止並列出所有問題，服務維持原狀。只想檢查、不套用時：

```bash
docker compose -p qjudge exec ai-service python -m infrastructure.agent.model_config
```

這個指令只做靜態檢查，不確認端點連線或模型能否實際回應；請再以 AI 助教實際送出一則訊息驗收。

從舊版升級的主機，把 `deploy/.env` 的 AI 設定搬到 `deploy/ai/`：

1. `OPENAI_API_KEY`、`DEEPSEEK_API_KEY` 搬到 `keys.env`。
2. `OPENAI_BASE_URL`、`DEEPSEEK_BASE_URL` 改寫成 `endpoints.openai.base_url`、`endpoints.deepseek.base_url`。
3. `VLLM_BASE_URL` 改成一個自架端點。若端點命名為 `vllm`，`VLLM_API_KEY` 可以原樣搬到 `keys.env`。
4. 想讓歷史紀錄維持熟悉的名稱時，沿用原本的模型 ID。
5. 從 `deploy/.env` 刪除這六項；還留著時，`deploy/qjudge check` 與 `upgrade` 會拒絕執行。

舊版只從 `deploy/.env` 讀取 AI key，刪除後若 `rollback` 回舊版，AI 功能會沒有 key 可用。

## Remote MCP

外部的 AI 工具以 `<origin>/mcp` 連線，例如 `https://judge.example.edu/mcp`。這條路徑與 OAuth metadata 都由 frontend 分流，不需要額外的網域、port 或設定。使用者端的設定方式見[配置 MCP 工具連線](#/docs/mcp-setup)。外部工具會經由 QJudge 的 OAuth 授權，實際使用時 origin 應為 HTTPS。
