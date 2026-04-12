# MCP Production OAuth 2.1 + 教學頁 + 部署

**日期**: 2026-04-11
**狀態**: Draft

## 目標

讓助教/老師可以透過 CLI 工具（Claude Code / Cursor / Codex）一行指令加入 QJudge MCP server，自動完成 OAuth 登入授權，零設定即可使用。

## 目標使用者

助教與老師。學生不在此版本範圍內。

## 架構概覽

```
使用者 CLI (Claude Code)
    │
    ├─ MCP 工具呼叫 ──→ mcp.qjudge.com (MCP Server, FastMCP)
    │                         │
    │                         ├─ /.well-known/oauth-protected-resource (RFC 9728)
    │                         └─ proxy → Django backend (帶 Bearer token)
    │
    └─ OAuth 流程 ──→ qjudge.com (Django)
                          ├─ /.well-known/oauth-authorization-server (RFC 8414)
                          ├─ /o/register/ (DCR, RFC 7591)
                          ├─ /o/token/
                          └─ /oauth/authorize → React 授權確認頁
```

- `mcp.qjudge.com`：MCP server（FastMCP），stateless proxy
- `qjudge.com`：Django 主站，負責所有 OAuth endpoints
- TLS 由 Cloudflare Tunnel 處理

## 一、OAuth 2.1 Server 端

### 1.1 django-oauth-toolkit 設定

```python
OAUTH2_PROVIDER = {
    "SCOPES": {"mcp": "Access QJudge via MCP"},
    "DEFAULT_SCOPES": ["mcp"],
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,       # 1 小時
    "REFRESH_TOKEN_EXPIRE_SECONDS": 2592000,    # 30 天
    "ROTATE_REFRESH_TOKENS": True,
    "PKCE_REQUIRED": True,
    "ALLOWED_REDIRECT_URI_SCHEMES": ["http", "https"],
}
```

單一 `mcp` scope，純做 gate。實際權限由 Django 的 role/permission 機制控制。

### 1.2 Well-known Metadata Endpoints

**`GET qjudge.com/.well-known/oauth-authorization-server`**（RFC 8414）

```json
{
  "issuer": "https://qjudge.com",
  "authorization_endpoint": "https://qjudge.com/o/authorize/",
  "token_endpoint": "https://qjudge.com/o/token/",
  "registration_endpoint": "https://qjudge.com/o/register/",
  "revocation_endpoint": "https://qjudge.com/o/revoke/",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

由 Django view 提供，URL 從環境變數 `OAUTH_ISSUER_URL` 組合。

**`GET mcp.qjudge.com/.well-known/oauth-protected-resource`**（RFC 9728）

```json
{
  "resource": "https://mcp.qjudge.com",
  "authorization_servers": ["https://qjudge.com"]
}
```

由 MCP server 提供，URL 從環境變數 `MCP_PUBLIC_URL` 組合。

### 1.3 Dynamic Client Registration (DCR)

**`POST qjudge.com/o/register/`** — 自建 Django view，實作 RFC 7591。

請求範例：
```json
{
  "client_name": "Claude Code",
  "grant_types": ["authorization_code"],
  "token_endpoint_auth_method": "none",
  "redirect_uris": ["http://localhost:PORT/callback"]
}
```

行為：
- 只接受 `grant_types: ["authorization_code"]` + `token_endpoint_auth_method: "none"`（public client）
- 建立 `oauth2_provider.models.Application`，`client_type="public"`，`authorization_grant_type="authorization-code"`
- 回傳 `client_id`（不回傳 secret）
- 拒絕其他 grant type 或 confidential client 請求

### 1.4 授權流程（前端自建）

1. Claude Code 導向 `qjudge.com/o/authorize/?response_type=code&client_id=...&code_challenge=...&redirect_uri=...`
2. Django 自訂 `AuthorizationView` 子類別，覆寫行為：不渲染 Django 模板，而是 302 redirect 到前端 `qjudge.com/oauth/authorize`，把所有 OAuth 參數（client_id, scope, redirect_uri, code_challenge 等）帶在 query string 上
3. 如果使用者未登入，Django 的 `login_required` 先跳到前端登入頁，登入後 redirect 回 `/o/authorize/`，再觸發步驟 2
4. 前端 React 頁面顯示：
   - 請求者資訊（client name，如 "Claude Code"）
   - 「允許 MCP Client 存取你的 QJudge 帳號？」
   - 允許 / 拒絕按鈕
5. 使用者按允許 → 前端 POST 到 Django API endpoint（`/api/oauth/approve/`）
6. Django 建立 authorization code，回傳 redirect URL（帶 code）
7. 前端執行 redirect → CLI 拿到 code → 換 token

授權時統一授予 `mcp` scope，不做 scope 選擇。

## 二、前端

### 2.1 授權確認頁（`/oauth/authorize`）

React 頁面，OAuth 流程中使用者被導到此處：

- 顯示 client name（來自 DCR 的 `client_name`）
- 顯示「允許此應用程式存取你的 QJudge 帳號？」
- 允許 / 拒絕按鈕
- 未登入會先跳登入再回來

### 2.2 教學頁（`/settings/mcp`）

純靜態教學頁，放在 Settings 底下：

1. **什麼是 MCP** — 一句話說明
2. **快速連接** — 第一個 tab 採用類似 Notion MCP onboarding 的「Connect through your AI tool」模式：
   - 顯示 remote MCP server URL：`https://mcp.q-judge.com/mcp`
   - 說明在支援 MCP / Connectors 的 AI 工具中直接貼上 URL
   - 提示第一次實際呼叫工具時才會進入 OAuth flow
   - 適用於 ChatGPT、Claude Desktop、VS Code 與其他支援 remote MCP 的客戶端
3. **安裝步驟** — 其餘 tab 顯示三個 client：
   - **Claude Code**：`claude mcp add --transport http qjudge https://mcp.qjudge.com/mcp`
   - **Cursor**：`.cursor/mcp.json` 設定範例
   - **Codex CLI**：對應指令
4. 每個 tab 都有複製按鈕
5. **驗證方式** — 「加入後第一次使用會自動開啟瀏覽器登入授權」

內容來自現有 `frontend/public/docs/zh-TW/mcp-setup.md` 的結構化版本。

## 三、Production 部署

### 3.1 docker-compose.yml 新增 MCP 服務

```yaml
qjudge-mcp:
  build:
    context: ./mcp-server
  container_name: oj_mcp
  environment:
    - DJANGO_BASE_URL=http://backend:8000
    - MCP_PUBLIC_URL=https://mcp.qjudge.com
  depends_on:
    - backend
  networks:
    - oj_network
  restart: unless-stopped
```

不對外暴露 port，透過 Cloudflare Tunnel 存取。

### 3.2 Cloudflare Tunnel

- `qjudge.com` → Django（現有）
- `mcp.qjudge.com` → `qjudge-mcp:9000`（新增子域）

TLS 由 Cloudflare 處理，容器間走 HTTP。

### 3.3 Django 環境變數

新增：
- `OAUTH_ISSUER_URL=https://qjudge.com` — metadata endpoint 使用

### 3.4 Management Command

`create_mcp_oauth_app` — 建立一個 fallback public Application，給不支援 DCR 的 client 使用。DCR 建立的 Application 是動態的，不需要預建。部署時執行一次。

## 不在此版本範圍

- 學生端 MCP 存取
- Scope 細分（read/write 分離）
- Token 管理前端 UI（撤銷、查看 active token）
- Rate limiting（可後續加）
- MCP server 在 test compose 中的整合測試
