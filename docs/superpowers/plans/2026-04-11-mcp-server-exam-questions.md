# QJudge MCP Server — Exam Question Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP Server that lets teachers/TAs edit `paper_exam` questions via AI tools, with OAuth 2.1 authentication through Django, explicit contest-type guardrails, and batch create support.

**Architecture:** Standalone FastMCP service (`:9000`) acts as stateless proxy to Django backend (`:8000`). Django gains `django-oauth-toolkit` as Authorization Server. OAuth token passthrough — MCP Server forwards Bearer token to Django API, which handles all auth and business logic. MCP additionally enforces tool-level contest-type guardrails so AI clients do not mix up `paper_exam` and `coding` contests.

**Tech Stack:** Python `mcp[cli]` (FastMCP), `httpx` (async HTTP), `django-oauth-toolkit` (OAuth AS), Docker Compose

**Spec:** `docs/superpowers/specs/2026-04-11-mcp-server-exam-questions.md`

## Current Notes

- `qjudge_exam` should only operate on `paper_exam` contests.
- `qjudge_coding` should only operate on `coding` contests.
- `qjudge_exam.create` / `qjudge_exam.update` must support `explanation`.
- `qjudge_exam.batch_create` must support `mode="append"` and `mode="overwrite"`.

---

## File Map

### New files (mcp-server/)

| File | Responsibility |
|---|---|
| `mcp-server/pyproject.toml` | Dependencies: `mcp[cli]`, `httpx` |
| `mcp-server/config.py` | Environment variable loading (`DJANGO_BASE_URL`) |
| `mcp-server/server.py` | FastMCP entry point + 6 tool definitions |
| `mcp-server/Dockerfile` | Container image for MCP server |

### Modified files (backend/)

| File | Change |
|---|---|
| `backend/requirements/base.txt` | Add `django-oauth-toolkit>=2.4,<3.0` |
| `backend/config/settings/base.py` | Add `oauth2_provider` to `INSTALLED_APPS`, `OAuth2Authentication` to DRF auth classes, `OAUTH2_PROVIDER` settings |
| `backend/config/urls.py` | Add `path("o/", include("oauth2_provider.urls"))` |

### Modified files (docker/)

| File | Change |
|---|---|
| `docker-compose.dev.yml` | Add `qjudge-mcp` service |

---

## Task 1: Add django-oauth-toolkit to Django backend

**Files:**
- Modify: `backend/requirements/base.txt`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Add dependency to requirements**

In `backend/requirements/base.txt`, add after the last line:

```
django-oauth-toolkit>=2.4,<3.0
```

- [ ] **Step 2: Add oauth2_provider to INSTALLED_APPS**

In `backend/config/settings/base.py`, add `"oauth2_provider"` to `INSTALLED_APPS` after `"rest_framework_simplejwt.token_blacklist"`:

```python
INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party apps
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "oauth2_provider",  # OAuth 2.1 Authorization Server
    "corsheaders",
    "django_ratelimit",
    "channels",
    # Local apps ...
]
```

- [ ] **Step 3: Add OAuth2Authentication to DRF**

In `backend/config/settings/base.py`, add `OAuth2Authentication` to `DEFAULT_AUTHENTICATION_CLASSES`:

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.users.authentication.CookieJWTAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "oauth2_provider.contrib.rest_framework.OAuth2Authentication",  # MCP OAuth
    ],
    # ... rest unchanged
}
```

- [ ] **Step 4: Add OAUTH2_PROVIDER settings**

In `backend/config/settings/base.py`, add after the `SIMPLE_JWT` block (after line ~201):

```python
# OAuth 2.1 Provider settings (for MCP Server)
OAUTH2_PROVIDER = {
    "SCOPES": {
        "mcp:exam:read": "Read exam questions",
        "mcp:exam:write": "Create, update, delete exam questions",
    },
    "DEFAULT_SCOPES": ["mcp:exam:read"],
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,  # 1 hour
    "REFRESH_TOKEN_EXPIRE_SECONDS": 2592000,  # 30 days
    "ROTATE_REFRESH_TOKENS": True,
    "PKCE_REQUIRED": True,
    "ALLOWED_REDIRECT_URI_SCHEMES": ["http", "https"],
}
```

- [ ] **Step 5: Add OAuth URL routes**

In `backend/config/urls.py`, add the import and URL pattern:

```python
urlpatterns = [
    path('api/health/', health_check, name='health-check'),
    path('django-admin/', admin.site.urls),
    path('o/', include('oauth2_provider.urls', namespace='oauth2_provider')),  # OAuth 2.1
    path('api/v1/auth/', include('apps.users.urls')),
    # ... rest unchanged
]
```

- [ ] **Step 6: Run migrations inside dev container**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec backend python manage.py migrate
```

Expected: Migration for `oauth2_provider` tables (AccessToken, RefreshToken, Application, Grant, etc.)

- [ ] **Step 7: Verify Django still starts and existing auth works**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec backend python manage.py check
```

Expected: `System check identified no issues.`

- [ ] **Step 8: Commit**

```bash
git add backend/requirements/base.txt backend/config/settings/base.py backend/config/urls.py
git commit -m "feat: add django-oauth-toolkit for MCP OAuth 2.1 support"
```

---

## Task 2: Create MCP Server project scaffold

**Files:**
- Create: `mcp-server/pyproject.toml`
- Create: `mcp-server/config.py`
- Create: `mcp-server/server.py` (minimal, no tools yet)

- [ ] **Step 1: Create pyproject.toml**

Create `mcp-server/pyproject.toml`:

```toml
[project]
name = "qjudge-mcp-server"
version = "0.1.0"
description = "QJudge MCP Server for exam question management"
requires-python = ">=3.11"
dependencies = [
    "mcp[cli]>=1.9.0",
    "httpx>=0.27.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 2: Create config.py**

Create `mcp-server/config.py`:

```python
import os


DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://localhost:8000")
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "9000"))
```

- [ ] **Step 3: Create minimal server.py**

Create `mcp-server/server.py`:

```python
"""QJudge MCP Server — exam question management tools."""

from mcp.server.fastmcp import FastMCP

from config import DJANGO_BASE_URL, MCP_HOST, MCP_PORT

mcp = FastMCP(
    "QJudge",
    stateless_http=True,
    json_response=True,
)


@mcp.tool()
async def list_exam_questions(contest_id: str) -> str:
    """列出指定競賽的所有考試題目。

    Args:
        contest_id: 競賽 ID (UUID)
    """
    return "not implemented yet"


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host=MCP_HOST, port=MCP_PORT)
```

- [ ] **Step 4: Test MCP server starts locally**

```bash
cd mcp-server && pip install -e . && python server.py &
sleep 2
curl -s http://localhost:9000/mcp -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | python -m json.tool
kill %1
```

Expected: JSON-RPC response with server capabilities.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/
git commit -m "feat: scaffold MCP server project with FastMCP"
```

---

## Task 3: Implement API proxy helper

**Files:**
- Modify: `mcp-server/server.py`

The core helper that all 6 tools will use to call Django API with token passthrough.

- [ ] **Step 1: Add the proxy helper function**

In `mcp-server/server.py`, add after the imports and before the `mcp` definition:

```python
import json
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP, Context

from config import DJANGO_BASE_URL, MCP_HOST, MCP_PORT


async def django_api(
    method: str,
    path: str,
    ctx: Context,
    *,
    json_body: dict | None = None,
) -> str:
    """Call Django API with OAuth token passthrough.

    Extracts the Bearer token from the MCP request context and forwards it
    to Django. Returns the response body as a string for the AI to read.
    """
    # Extract Bearer token from the MCP transport headers
    headers: dict[str, str] = {}
    request_context = ctx.request_context
    if request_context and hasattr(request_context, "headers"):
        auth_header = request_context.headers.get("authorization", "")
        if auth_header:
            headers["Authorization"] = auth_header

    url = f"{DJANGO_BASE_URL}{path}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method=method,
            url=url,
            headers=headers,
            json=json_body,
        )

    if response.status_code == 204:
        return json.dumps({"status": "success"})

    try:
        body = response.json()
    except Exception:
        body = {"raw": response.text}

    if response.status_code >= 400:
        return json.dumps({
            "error": True,
            "status": response.status_code,
            "detail": body,
        }, ensure_ascii=False)

    return json.dumps(body, ensure_ascii=False)
```

- [ ] **Step 2: Remove placeholder tool, verify import**

Replace the placeholder `list_exam_questions` with a pass (tools come in next task):

```python
mcp = FastMCP(
    "QJudge",
    stateless_http=True,
    json_response=True,
)


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host=MCP_HOST, port=MCP_PORT)
```

- [ ] **Step 3: Commit**

```bash
git add mcp-server/server.py
git commit -m "feat: add Django API proxy helper for MCP tools"
```

---

## Task 4: Implement the 6 MCP tools

**Files:**
- Modify: `mcp-server/server.py`

- [ ] **Step 1: Add list_exam_questions tool**

Add after the `mcp` definition in `server.py`:

```python
@mcp.tool()
async def list_exam_questions(contest_id: str, ctx: Context) -> str:
    """列出指定競賽的所有考試題目（含正確答案，僅限老師/助教）。

    Args:
        contest_id: 競賽 ID (UUID)
    """
    return await django_api(
        "GET",
        f"/api/v1/contests/{contest_id}/exam-questions/",
        ctx,
    )
```

- [ ] **Step 2: Add get_exam_question tool**

```python
@mcp.tool()
async def get_exam_question(contest_id: str, question_id: str, ctx: Context) -> str:
    """取得單一考試題目的詳細資訊（含正確答案）。

    Args:
        contest_id: 競賽 ID (UUID)
        question_id: 題目 ID
    """
    return await django_api(
        "GET",
        f"/api/v1/contests/{contest_id}/exam-questions/{question_id}/",
        ctx,
    )
```

- [ ] **Step 3: Add create_exam_question tool**

```python
@mcp.tool()
async def create_exam_question(
    contest_id: str,
    question_type: str,
    prompt: str,
    score: int,
    ctx: Context,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
) -> str:
    """在指定競賽中新增一道考試題目。

    Args:
        contest_id: 競賽 ID (UUID)
        question_type: 題型，可選值：true_false, single_choice, multiple_choice, short_answer, essay
        prompt: 題目內容（支援 Markdown）
        score: 配分（正整數）
        options: 選項列表（選擇題必填，如 ["選項A", "選項B", "選項C", "選項D"]）
        correct_answer: 正確答案。是非題用 true/false；單選題用選項索引 (int)；多選題用索引陣列 [0,2]；簡答/申論可為 null
    """
    body: dict[str, Any] = {
        "question_type": question_type,
        "prompt": prompt,
        "score": score,
    }
    if options is not None:
        body["options"] = options
    if correct_answer is not None:
        body["correct_answer"] = correct_answer

    return await django_api(
        "POST",
        f"/api/v1/contests/{contest_id}/exam-questions/",
        ctx,
        json_body=body,
    )
```

- [ ] **Step 4: Add update_exam_question tool**

```python
@mcp.tool()
async def update_exam_question(
    contest_id: str,
    question_id: str,
    ctx: Context,
    prompt: str | None = None,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
    score: int | None = None,
    question_type: str | None = None,
) -> str:
    """修改指定考試題目，只需傳入要修改的欄位。

    Args:
        contest_id: 競賽 ID (UUID)
        question_id: 題目 ID
        prompt: 新的題目內容（支援 Markdown）
        options: 新的選項列表
        correct_answer: 新的正確答案
        score: 新的配分
        question_type: 新的題型
    """
    body: dict[str, Any] = {}
    if prompt is not None:
        body["prompt"] = prompt
    if options is not None:
        body["options"] = options
    if correct_answer is not None:
        body["correct_answer"] = correct_answer
    if score is not None:
        body["score"] = score
    if question_type is not None:
        body["question_type"] = question_type

    if not body:
        return json.dumps({"error": True, "detail": "No fields to update"}, ensure_ascii=False)

    return await django_api(
        "PATCH",
        f"/api/v1/contests/{contest_id}/exam-questions/{question_id}/",
        ctx,
        json_body=body,
    )
```

- [ ] **Step 5: Add delete_exam_question tool**

```python
@mcp.tool()
async def delete_exam_question(contest_id: str, question_id: str, ctx: Context) -> str:
    """刪除指定的考試題目。

    Args:
        contest_id: 競賽 ID (UUID)
        question_id: 題目 ID
    """
    return await django_api(
        "DELETE",
        f"/api/v1/contests/{contest_id}/exam-questions/{question_id}/",
        ctx,
    )
```

- [ ] **Step 6: Add reorder_exam_questions tool**

```python
@mcp.tool()
async def reorder_exam_questions(
    contest_id: str,
    question_ids: list[str],
    ctx: Context,
) -> str:
    """重新排列考試題目的順序。

    Args:
        contest_id: 競賽 ID (UUID)
        question_ids: 按新順序排列的題目 ID 列表，例如 ["id-3", "id-1", "id-2"] 表示第三題變第一、第一題變第二、第二題變第三
    """
    orders = [{"id": qid, "order": idx} for idx, qid in enumerate(question_ids)]
    return await django_api(
        "POST",
        f"/api/v1/contests/{contest_id}/exam-questions/reorder/",
        ctx,
        json_body={"orders": orders},
    )
```

- [ ] **Step 7: Verify server starts with all tools**

```bash
cd mcp-server && python server.py &
sleep 2
curl -s http://localhost:9000/mcp -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | python -m json.tool
kill %1
```

Expected: JSON response listing all 6 tools with their names and descriptions.

- [ ] **Step 8: Commit**

```bash
git add mcp-server/server.py
git commit -m "feat: implement 6 exam question MCP tools"
```

---

## Task 5: Add MCP Server to Docker Compose

**Files:**
- Create: `mcp-server/Dockerfile`
- Modify: `docker-compose.dev.yml`

- [ ] **Step 1: Create Dockerfile**

Create `mcp-server/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

EXPOSE 9000

CMD ["python", "server.py"]
```

- [ ] **Step 2: Add service to docker-compose.dev.yml**

Add before the `volumes:` section at the end of `docker-compose.dev.yml`:

```yaml
  qjudge-mcp:
    build:
      context: ./mcp-server
    container_name: oj_mcp_dev
    ports:
      - "9000:9000"
    environment:
      - DJANGO_BASE_URL=http://backend:8000
    depends_on:
      - backend
    networks:
      - oj_network_dev
    restart: unless-stopped
```

- [ ] **Step 3: Build and verify container starts**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build qjudge-mcp
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs qjudge-mcp
```

Expected: MCP server listening on port 9000.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/Dockerfile docker-compose.dev.yml
git commit -m "feat: add MCP server to Docker Compose dev environment"
```

---

## Task 6: Register OAuth Application and end-to-end test

**Files:**
- No new files — configuration and manual testing

- [ ] **Step 1: Create OAuth Application via Django shell**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec backend python manage.py shell -c "
from oauth2_provider.models import Application
from django.contrib.auth import get_user_model
User = get_user_model()

# Use an existing teacher/admin user as the application owner
admin = User.objects.filter(is_staff=True).first()

app, created = Application.objects.get_or_create(
    name='QJudge MCP Server',
    defaults={
        'client_type': Application.CLIENT_PUBLIC,
        'authorization_grant_type': Application.GRANT_AUTHORIZATION_CODE,
        'redirect_uris': 'http://localhost:9000/oauth/callback http://127.0.0.1/callback',
        'user': admin,
        'skip_authorization': False,
    },
)
if created:
    print(f'Created OAuth Application: client_id={app.client_id}')
else:
    print(f'Already exists: client_id={app.client_id}')
"
```

Expected: Prints the `client_id` for MCP client configuration.

- [ ] **Step 2: Test OAuth token acquisition manually**

Get a token directly via Resource Owner Password (for dev testing only — DOT supports this for testing):

```bash
# First, get a token by calling the token endpoint with a test user
# In production, this would go through the authorization code flow
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec backend python manage.py shell -c "
from oauth2_provider.models import Application, AccessToken
from oauthlib.common import generate_token
from django.utils import timezone
from datetime import timedelta
from django.contrib.auth import get_user_model
User = get_user_model()

app = Application.objects.get(name='QJudge MCP Server')
user = User.objects.get(username='teacher')

# Create a test access token with exam scopes
token = AccessToken.objects.create(
    user=user,
    application=app,
    token=generate_token(),
    expires=timezone.now() + timedelta(hours=1),
    scope='mcp:exam:read mcp:exam:write',
)
print(f'Test token: {token.token}')
"
```

- [ ] **Step 3: Test MCP tool via curl with OAuth token**

```bash
# Replace <TOKEN> with the token from step 2
# Replace <CONTEST_ID> with a real contest UUID from your dev data
TOKEN="<token from step 2>"
CONTEST_ID="<uuid>"

curl -s http://localhost:9000/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"list_exam_questions\",
      \"arguments\": {\"contest_id\": \"$CONTEST_ID\"}
    }
  }" | python -m json.tool
```

Expected: JSON response with exam questions for the contest (or appropriate error if no contest exists with that ID).

- [ ] **Step 4: Test permission denied scenario**

Create a token for a student user and verify the tool returns 403:

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec backend python manage.py shell -c "
from oauth2_provider.models import Application, AccessToken
from oauthlib.common import generate_token
from django.utils import timezone
from datetime import timedelta
from django.contrib.auth import get_user_model
User = get_user_model()

app = Application.objects.get(name='QJudge MCP Server')
user = User.objects.get(username='student')
token = AccessToken.objects.create(
    user=user, application=app,
    token=generate_token(),
    expires=timezone.now() + timedelta(hours=1),
    scope='mcp:exam:read mcp:exam:write',
)
print(f'Student token: {token.token}')
"
```

Then call `create_exam_question` with the student token — should get 403.

- [ ] **Step 5: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end MCP OAuth testing"
```

---

## Task 7: Final verification and cleanup

- [ ] **Step 1: Verify all 6 tools are listed**

```bash
curl -s http://localhost:9000/mcp -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python -m json.tool | grep '"name"'
```

Expected output:
```
"name": "list_exam_questions"
"name": "get_exam_question"
"name": "create_exam_question"
"name": "update_exam_question"
"name": "delete_exam_question"
"name": "reorder_exam_questions"
```

- [ ] **Step 2: Verify Django existing tests still pass**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec backend python -m pytest --no-cov -x -q
```

Expected: All existing tests pass (adding DOT + OAuth2Authentication should not break anything).

- [ ] **Step 3: Verify dev environment health**

```bash
./scripts/dev/check-dev-services.sh
```

Expected: All services healthy, including the new `qjudge-mcp` container.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: MCP server exam question editing — complete"
```
