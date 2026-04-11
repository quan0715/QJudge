# QJudge MCP Server — Exam Question Editing

**Date:** 2026-04-11
**Status:** Draft
**Scope:** MCP Server with OAuth 2.1, exam question CRUD + reorder

---

## Overview

建立一個獨立的 MCP Server，讓老師/助教透過 AI 工具（Claude Code、Cursor 等）編輯競賽的 exam questions。MCP Server 作為 stateless thin proxy，所有業務邏輯和權限檢查由 Django backend 處理。

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

6 個 tools，全部操作 `/api/v1/contests/{contest_id}/exam-questions/`：

### list_exam_questions

```
Parameters: contest_id (str)
Django API: GET /api/v1/contests/{contest_id}/exam-questions/
```

列出指定競賽的所有 exam questions。

### get_exam_question

```
Parameters: contest_id (str), question_id (str)
Django API: GET /api/v1/contests/{contest_id}/exam-questions/{question_id}/
```

取得單一題目詳情，含 correct_answer。

### create_exam_question

```
Parameters:
  contest_id (str)
  question_type (str)     # true_false|single_choice|multiple_choice|short_answer|essay
  prompt (str)
  score (int)
  options (list[str]?)    # 選擇題用
  correct_answer (Any?)
Django API: POST /api/v1/contests/{contest_id}/exam-questions/
```

新增一道題目。

### update_exam_question

```
Parameters:
  contest_id (str)
  question_id (str)
  prompt (str?)
  options (list[str]?)
  correct_answer (Any?)
  score (int?)
Django API: PATCH /api/v1/contests/{contest_id}/exam-questions/{question_id}/
```

修改題目。只傳有變更的欄位。

### delete_exam_question

```
Parameters: contest_id (str), question_id (str)
Django API: DELETE /api/v1/contests/{contest_id}/exam-questions/{question_id}/
```

刪除題目。

### reorder_exam_questions

```
Parameters: contest_id (str), question_ids (list[str])
Django API: POST /api/v1/contests/{contest_id}/exam-questions/reorder/
```

按 question_ids 的順序重新排列題目。

### 回傳格式

- 成功：回傳 Django API 的 JSON response（序列化為字串）
- 失敗：回傳 Django 的 error message，讓 AI 理解並告知使用者

## Error Handling

MCP Server 直接轉發 Django 的回應：

| Django 回傳 | MCP Server 行為 |
|---|---|
| 200/201/204 | 回傳 response body |
| 400 | 回傳 validation error message |
| 401 | 提示使用者重新授權 |
| 403 | 回傳權限拒絕原因（question_edit_locked、not owner 等） |
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
- Batch 操作
- import-from-bank
- 學生端功能
- MCP Resources（第一版只用 Tools）
