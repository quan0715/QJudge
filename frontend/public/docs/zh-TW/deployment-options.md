# 在核心部署完成後加入選用功能

先完成最小部署的登入、出題、評測與圖片上傳，再閱讀這一頁。這些功能都不是啟動 QJudge 核心流程的前置條件，可以依課程需求逐項加入。

| 需求 | 什麼時候需要 | 是否需要公開 HTTPS |
| --- | --- | --- |
| 校園內網或 VPN 使用 | 使用者只從可信任網路進入 | 不一定 |
| Internet 公開入口 | 學生從一般網路登入 | 需要 |
| 第三方 OAuth 登入 | 使用 NYCU、GitHub 或 Google 帳號登入 | 需要 |
| AI provider | QJudge 主動呼叫 OpenAI 或 DeepSeek | QJudge 不必公開，但 provider 連線本身使用 outbound HTTPS |
| Internal MCP | AI worker 在 Compose network 內使用 QJudge tools | 不需要 |
| Remote MCP | 外部 IDE、CLI 或 AI client 連入 QJudge | 需要 |

## 先選擇公開入口

`QJUDGE_PUBLIC_ORIGIN` 是使用者在瀏覽器實際開啟的網址，也是 cookies、CORS、CSRF 與 OAuth issuer 的共同基準。它只能包含 scheme、hostname 與選用 port，例如：

```text
https://judge.example.edu
```

不能加 `/app`、query string 或 fragment。

常見入口有四種：

- Private HTTP：只在可信任的校園內網、VPN 或暫時驗收使用。
- Caddy／Nginx：主機有固定 public IP 與網域，由部署者管理 certificate 與 reverse proxy。
- Cloudflare Tunnel：主機主動連向 Cloudflare，不需要直接開放 application inbound port。
- Cloud load balancer：學校或單位已有雲端 ingress、certificate 與 health check 架構。

對 Internet 公開時必須使用 HTTPS。登入 cookie、OAuth code 或 MCP token 不應經過未加密的公開網路。

## 以 Cloudflare Tunnel 建立 HTTPS 入口

Cloudflare Tunnel 與 R2 是兩個獨立服務。R2 保存檔案；Tunnel 才是讓使用者從網域進入 QJudge 的方式。使用 R2 不代表一定要使用 Tunnel，反過來也一樣。

先在 Cloudflare 建立 Tunnel 與 public hostname。QJudge 的主要 hostname 要導向 Compose 裡的 frontend：

```text
http://frontend:80
```

取得 Tunnel token 後，在部署主機用不會把 token 留在 command history 的編輯器開啟 `.env`：

```bash
nano .env
```

修改既有 origin，並加入 token：

```text
QJUDGE_PUBLIC_ORIGIN=https://judge.example.edu
TUNNEL_TOKEN=YOUR_TUNNEL_TOKEN
```

存檔後先讓 Compose 驗證格式：

```bash
docker compose --profile tunnel config --quiet
```

沒有訊息代表設定可以解析。接著重建受到 public origin 影響的 services，並啟動 Tunnel：

```bash
docker compose --profile tunnel up -d --force-recreate \
  backend frontend qjudge-mcp cloudflared
```

查看 Tunnel container：

```bash
docker compose --profile tunnel ps cloudflared
```

正常情況是 running。接著從校外網路開啟 HTTPS 網域，確認首頁、登入、登出與圖片讀取；不能只以 Cloudflare dashboard 顯示 Healthy 作為驗收。

改變 public origin 也要同步修改 R2 CORS allowed origin。正式切換前先準備可以恢復舊 origin 與 route 的維護方式。

## 啟用第三方 OAuth 登入

QJudge 沒有 OAuth credential 時仍可使用 email／password 登入。只有確定要讓使用者以 NYCU、GitHub 或 Google 帳號登入時，才需要這一節。

在 provider 管理頁登記瀏覽器 callback。實際 route 是：

```text
https://judge.example.edu/auth/nycu/callback
https://judge.example.edu/auth/github/callback
https://judge.example.edu/auth/google/callback
```

Frontend 收到 provider code 後，才會呼叫 backend 的 `/api/v1/auth/callback/{provider}` 完成交換。Provider console 不應登記這個 backend API path。

只設定實際使用的 provider，而且 client ID 與 client secret 必須成對出現。在 `.env` 加入例如：

```text
GITHUB_OAUTH_CLIENT_ID=YOUR_GITHUB_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET=YOUR_GITHUB_CLIENT_SECRET
```

不要把 secret 放在 shell command、截圖或 issue。驗證 Compose 後重建 backend：

```bash
docker compose up -d --no-deps --force-recreate backend
```

完整驗收要從登入頁選擇 provider、完成授權、回到 QJudge、確認使用者資料，再登出。只看到登入按鈕不代表 callback 已正確設定。

## 啟用 AI provider

AI provider 是模型實際執行推論的服務。QJudge 目前支援以 API key 呼叫 OpenAI 或 DeepSeek；只設定課程要使用的一個 provider 即可。

這是 QJudge 主動送出的 outbound HTTPS request，因此不用為了啟用 AI 先把 QJudge 公開到 Internet。沒有 provider key 時，登入、題目管理、一般評測與 Internal MCP 仍可運作。

使用安全的編輯器在 `.env` 加入其中一項：

```text
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
```

或：

```text
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY
```

重建實際執行模型工作的 worker：

```bash
docker compose up -d --no-deps --force-recreate ai-worker
```

接著送出一個最小 prompt，確認收到回應，並確認產生的 artifact 能寫入 `ai-artifacts` bucket。API key 不應出現在 frontend bundle、API response 或 log。

自架模型、代理 endpoint、增加模型與調整定價屬於模型擴充，不是部署設定，本指南不處理這些項目。

## Internal MCP 與 Remote MCP

MCP 讓 AI client 透過標準介面使用 QJudge 提供的 tools，例如讀取被授權的課程或題目資料。先判斷 client 在哪裡，才能知道是否需要公開入口。

Internal MCP 不需要公開 HTTPS。Production Compose 已讓 AI worker 經由內部 Docker network 呼叫：

```text
http://qjudge-mcp:9000/mcp
```

這個 hostname 只在 Compose 裡解析，不需要對 Internet 開 port，也不需要設定 `MCP_PUBLIC_URL`。

Remote MCP 需要公開 HTTPS。當外部 IDE、CLI 或 AI client 要直接連線時，需要穩定的 `MCP_PUBLIC_URL`、公開 OAuth metadata、正確 redirect URI 與 PKCE flow。

如果使用同一個 QJudge 網域，可以在 `.env` 加入：

```text
MCP_PUBLIC_URL=https://judge.example.edu/mcp
```

Tunnel 或 reverse proxy 還要把 `/mcp` route 導向：

```text
http://qjudge-mcp:9000
```

設定完成後重建 backend 與 MCP server：

```bash
docker compose up -d --no-deps --force-recreate backend qjudge-mcp
```

外部 client 驗收要完成 OAuth authorization、取得 token、MCP initialize、`tools/list` 與一個唯讀 tool call；過期或未授權 token 必須被拒絕。

## Cloud VM 與自有主機差在哪裡

QJudge 的 clone、`.env`、Compose 與驗收流程不因供應商改變。Cloud VM 額外需要部署者處理：

- 建立 Ubuntu LTS VM，記錄 image 與 CPU architecture。
- 固定 public IP 或 hostname。
- 設定 cloud firewall／Security Group 與主機 firewall。
- 規劃 block volume、snapshot、擴容與還原。
- 管理 SSH、session service 與雲端身分權限。

自有主機則由學校或機房處理硬體、網路設備、磁碟與備份。兩者最後都回到同一份 QJudge 部署主線，不建立兩套重複的 application 步驟。

論文將以 AWS EC2 作為 Cloud VM 實例。AMI、instance type、EBS 容量、Security Group 與實測結果會在真正部署後補入；目前不提供推測性數值。

遇到 public origin、Tunnel、OAuth、AI 或 MCP 問題時，請依[部署故障排除](deployment-troubleshooting.md)從前面的相依項目開始檢查。
