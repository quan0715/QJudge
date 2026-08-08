# AI 與 MCP

AI provider 與公開 Remote MCP 都是選用功能。Production Compose 會啟動 AI service、AI worker 與內部 `qjudge-mcp`，但沒有 provider credential 時，模型推論不會成功；登入、題目管理與一般評測仍可運作。

## 哪些情況不需要公開 HTTPS

下列流量都留在 Docker network 或受控 private network，因此不需要公開 HTTPS：

- Backend 呼叫 `ai-service`。
- AI service 與 AI worker 使用內部 PostgreSQL、Redis 與 backend token exchange。
- AI worker 呼叫 `http://qjudge-mcp:9000/mcp`。

雲端 AI API 使用的是 application 對外發出的 HTTPS request。這種 outbound HTTPS 不代表 QJudge 本身必須具有公開網域或公開 HTTPS 入口。

## 啟用 AI provider

部署時只需為實際使用的既有 provider 提供 API key：

| 變數 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API credential |
| `DEEPSEEK_API_KEY` | DeepSeek API credential |

只設定實際使用的 provider。全新安裝可在執行 `setup-env.sh` 前匯出選用值，初始化工具會將非空值寫入 `.env`：

```bash
read -r -s -p "OpenAI API key: " OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
```

再依 [正式架設與部署指南](../deployment.md) 建立 `.env`。既有部署應透過 secret manager 或安全編輯方式更新 `.env`，再重建 AI worker：

```bash
docker compose up -d --no-deps --force-recreate ai-worker
```

Provider keys 只會注入執行模型工作的 AI worker，不會提供給 frontend、backend 或 AI API service。

若要加入其他模型供應商、自架模型或代理端點，屬於模型擴充工作，不在本部署指南的範圍內，後續會以獨立文件說明。

## 內部 MCP

Production Compose 已將 AI runtime 的 MCP URL 固定為：

```text
http://qjudge-mcp:9000/mcp
```

這個 URL 只在 Compose network 內使用，不需要對外開 port。MCP token exchange 也透過 backend 的內部 URL完成。即使 `QJUDGE_PUBLIC_ORIGIN` 是 HTTP，內部 AI/MCP 連線仍能運作。

## Remote MCP

當 Cursor、IDE、CLI 或其他外部 client 要直接連線 QJudge MCP 時，才屬於 Remote MCP。此時需要：

- 外部 client 可存取的穩定 `MCP_PUBLIC_URL`。
- 可公開存取的 OAuth issuer、authorization 與 token endpoints。
- 正確的 redirect URI 與 PKCE flow。
- Production 環境的公開 HTTPS。

全新安裝可在初始化前提供：

```bash
export MCP_PUBLIC_URL=https://judge.example.com/mcp
```

公開路由必須由反向代理或 Tunnel 將 `/mcp` 導向 `qjudge-mcp`。設定方式請見 [HTTPS 與 OAuth](https-and-oauth.md)。只供 AI worker 使用內部 MCP 時，不要設定 `MCP_PUBLIC_URL`。

## 驗收

### AI provider

1. `docker compose ps ai-service ai-worker` 顯示服務正常執行。
2. AI worker 能連到 provider endpoint。
3. 使用一個最小 prompt 產生回應。
4. Provider credential 不出現在 logs、frontend build 或 API response。
5. AI artifacts 能寫入 `ai-artifacts` bucket。

### Remote MCP

1. Client 能讀取 OAuth metadata。
2. Authorization code 與 PKCE flow 能完成。
3. Client 取得的 token scope 只包含授權用途。
4. MCP initialize、tools/list 與一個唯讀 tool call 能成功。
5. 未授權或過期 token 被拒絕。

返回 [QJudge 正式架設與部署指南](../deployment.md)。
