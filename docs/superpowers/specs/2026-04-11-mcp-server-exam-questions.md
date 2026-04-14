# QJudge MCP Server — Exam Question Editing

**Date:** 2026-04-11
**Status:** Draft
**Scope:** MCP Server with OAuth 2.1, paper-exam question CRUD + reorder + batch create

---

## Overview

建立一個獨立的 MCP Server，讓老師/助教透過 AI 工具（Claude Code、Cursor 等）編輯 `paper_exam` 競賽的 exam questions。MCP Server 作為 stateless thin proxy，所有業務邏輯和權限檢查由 Django backend 處理；MCP 只補工具導向的 orchestration 與 contest 類型防呆。

## Architecture

```
MCP Client (Claude Code, Cursor, etc.)
    │
    │  Streamable HTTP + OAuth 2.1 Bearer
    ▼
QJudge MCP Server (FastMCP, :9000)
    │
    │  HTTP + Bearer token passthrough
    ▼
Django Backend (:8000)
    + django-oauth-toolkit (Authorization Server)
    + /api/v1/contests/*/exam-questions/
```

### Key Principles

- MCP Server 是 **stateless thin proxy**，不存使用者狀態，不做業務邏輯
- 所有權限檢查（contest owner/admin、question_edit_locked）在 Django 側
- OAuth token 代表使用者本人，MCP Server 只是轉發
- Django 現有的 view、serializer、model 不需修改

## OAuth 2.1 Flow

### Django 側（Authorization Server）

加 `django-oauth-toolkit`，設定：

- **Grant type:** Authorization Code + PKCE（OAuth 2.1 強制）
- **Scope:** `mcp:exam:read` `mcp:exam:write`
- **Token 格式:** Opaque token（DOT 預設，DB 查詢驗證）
- **Access token TTL:** 1 小時
- **Refresh token TTL:** 30 天
- **Client type:** Public（MCP client 無法安全存 secret）

DRF 認證設定新增 `OAuth2Authentication`，與現有 JWT 並存：

```python
"DEFAULT_AUTHENTICATION_CLASSES": [
    "apps.users.authentication.CookieJWTAuthentication",
    "rest_framework_simplejwt.authentication.JWTAuthentication",
    "oauth2_provider.contrib.rest_framework.OAuth2Authentication",  # 新增
],
```

Django URL 新增：

```python
path("o/", include("oauth2_provider.urls", namespace="oauth2_provider")),
```

### MCP Server 側（Resource Server）

MCP Server 不自行驗 token。流程：

1. MCP Client 連線 → MCP Server 回 401 + RFC 9728 metadata（指向 Django AS）
2. Client 開瀏覽器到 Django `/o/authorize/?response_type=code&code_challenge=...`
3. 使用者登入 QJudge → 授權
4. Django callback 回 authorization code
5. Client 用 code 換 token（`POST /o/token/`）
6. 後續 MCP 請求帶 `Authorization: Bearer <token>`
7. MCP Server 將 token 原樣轉發給 Django API

### OAuth Application 註冊

dev 環境需在 Django 建立一個 OAuth Application：

- client_type: `public`
- grant_type: `authorization-code`
- redirect_uri: 由 MCP client 提供
- PKCE: required

## MCP Tools

3 個合併 tools，透過 `action` 參數區分操作（減少 schema token 佔用）：

### qjudge_discover

查詢教室與競賽。Actions: `list_classrooms`, `list_contests`, `get_contest`

### qjudge_exam

管理 `paper_exam` contest 的考試題目。Actions: `list`, `get`, `create`, `update`, `delete`, `reorder`, `import_from_bank`, `batch_create`

- `create` / `update` 支援 `explanation`
- `batch_create` 支援：
  - `mode="append"`：逐筆新增
  - `mode="overwrite"`：先刪除 contest 既有 exam 題目，再逐筆新增
- 如果 contest 實際上是 `coding`，MCP 直接回錯誤，提示改用 `qjudge_coding`

### qjudge_coding

管理 `coding` contest 的程式題目。若 contest 實際上是 `paper_exam`，MCP 直接回錯誤，提示改用 `qjudge_exam`。

### qjudge_grading

查看作答與批改。Actions: `list_answers`, `question_detail`, `dashboard`, `grade`, `batch_grade`, `ungrade`

### 回傳格式

- 成功：回傳精簡後的 Django API JSON response（移除 snapshot、截斷長欄位）
- 失敗：回傳 `{error: true, status: N, detail: ...}`
- 批改：回傳最小 ack `{status: "success", graded_count: N}`

## Error Handling

MCP Server 直接轉發 Django 的回應：

| Django 回傳 | MCP Server 行為 |
|---|---|
| 200/201/204 | 回傳 response body |
| 400 | 回傳 validation error message |
| 401 | 提示使用者重新授權 |
| 403 | 回傳權限拒絕原因（question_edit_locked、not owner 等） |
| 400 | 回傳固定工具錯誤（如 contest type 不符、batch mode 無效） |
| 404 | 回傳 "contest or question not found" |
| 5xx | 回傳 "QJudge 服務暫時不可用" |

不做 retry、不做 fallback。

## Security

- OAuth 2.1 強制 PKCE
- MCP Server 不存任何 token
- 業務權限由 Django 檢查
- Production 走 HTTPS（Cloudflare Tunnel）
- 不在 MCP 層做 rate limiting（Django 已有 120/min）
- 不在 MCP 層做 audit log（Django 已有 ContestActivity）

## Project Structure

### 新增：mcp-server/

```
mcp-server/
├── pyproject.toml      # deps: mcp[cli], httpx
├── Dockerfile
├── server.py           # FastMCP entry point + 6 tools
└── config.py           # 環境變數（DJANGO_BASE_URL）
```

### Django 側變動

```
backend/
├── requirements/base.txt          # + django-oauth-toolkit
├── config/settings/base.py        # + oauth2_provider app
│                                  # + OAuth2Authentication
│                                  # + OAUTH2_PROVIDER settings
├── config/urls.py                 # + path('o/', ...)
└── (migrate)                      # DOT tables
```

不動任何現有 view、serializer、model。

### Docker Compose（dev）

```yaml
qjudge-mcp:
  build: ./mcp-server
  ports:
    - "9000:9000"
  environment:
    - DJANGO_BASE_URL=http://backend:8000
  depends_on:
    - backend
```

## Out of Scope

- list_contests tool（contest ID 由使用者提供）
- 學生端功能
- MCP Resources（第一版只用 Tools）
