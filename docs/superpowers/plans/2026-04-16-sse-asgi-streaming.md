# SSE ASGI Streaming Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix SSE streaming so events reach the frontend incrementally instead of being buffered by Django's WSGI `runserver`.

**Architecture:** Switch the dev backend from `python manage.py runserver` (WSGI, buffers `StreamingHttpResponse`) to `uvicorn` (ASGI, true streaming). Convert the two SSE proxy views to async using `httpx.AsyncClient`. The ASGI infrastructure already exists (`config/asgi.py`, `uvicorn` installed, `channels` configured). Non-SSE views remain synchronous and unaffected.

**Tech Stack:** Django 4.2, DRF 3.15, uvicorn 0.35, httpx 0.28 (AsyncClient), channels 4.3

**Root cause (proven):** `python manage.py runserver` uses `wsgiref` (WSGI) which buffers the entire `StreamingHttpResponse` generator output and flushes only when the generator is exhausted. Verified by curl: all SSE events arrive at the same timestamp after 13s delay. Direct httpx test to ai-service confirmed events stream incrementally (timestamps spread across seconds).

---

## File Map


| File                                              | Action                       | Responsibility                                                                     |
| ------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `docker-compose.dev.yml`                          | Modify line 148              | Switch backend command from `runserver` to `uvicorn`                               |
| `backend/apps/ai/services/session_runtime.py`     | Rewrite                      | Convert `_proxy_stream` + `generate` to async generators using `httpx.AsyncClient` |
| `backend/apps/ai/views.py`                        | Modify lines 86-137, 231-266 | Make `send_message_stream` and `resume_stream` actions `async`                     |
| `backend/apps/ai/tests/test_message_streaming.py` | Modify                       | Update mocks from sync `httpx.stream` to async `httpx.AsyncClient.stream`          |
| `frontend/nginx/default.conf`                     | Modify lines 9-15            | Add SSE-specific proxy headers for production Nginx                                |


---

### Task 1: Switch dev backend to uvicorn

**Files:**

- Modify: `docker-compose.dev.yml:148`
- **Step 1: Change backend command**

In `docker-compose.dev.yml`, replace the backend command:

```yaml
# OLD (line 148):
    command: python manage.py runserver 0.0.0.0:8000

# NEW:
    command: uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --reload --reload-dir /app
```

`--reload-dir /app` scopes the file watcher to the mounted volume (avoids watching node_modules or venv).

- **Step 2: Verify uvicorn starts**

```bash
docker compose -f docker-compose.dev.yml up -d --no-deps backend
docker compose -f docker-compose.dev.yml logs backend --since=10s
```

Expected: `INFO: Uvicorn running on http://0.0.0.0:8000` (no import errors).

- **Step 3: Verify existing REST endpoints still work**

```bash
curl -s http://localhost:8000/api/v1/auth/me -H "Cookie: access_token=<JWT>" | python3 -m json.tool
```

Expected: 200 OK with user JSON. All sync DRF views work unchanged under ASGI.

- **Step 4: Commit**

```bash
git add docker-compose.dev.yml
git commit -m "chore: switch dev backend from runserver to uvicorn for ASGI streaming"
```

---

### Task 2: Convert session_runtime to async

**Files:**

- Modify: `backend/apps/ai/services/session_runtime.py`

This is the core change. Convert `_proxy_stream` from sync `httpx.stream()` to async `httpx.AsyncClient.stream()`, and convert `generate()` from `Generator` to `AsyncGenerator`.

- **Step 1: Rewrite `build_sse_response` for async generators**

Replace the existing function at line 25-30:

```python
from django.http import StreamingHttpResponse
from collections.abc import AsyncGenerator

def build_sse_response(generator: AsyncGenerator[str, None]) -> StreamingHttpResponse:
    """Wrap an async generator in a standard SSE response."""
    response = StreamingHttpResponse(generator, content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
```

Stays sync (no `async def`) — it just constructs the response object. Django 4.2+ `StreamingHttpResponse` accepts async iterators when running under ASGI.

- **Step 2: Rewrite `BaseAIStreamRuntime._proxy_stream` to async**

Replace the entire `_proxy_stream` method (lines 41-110) with:

```python
async def _proxy_stream(
    self,
    *,
    payload: dict[str, Any],
    on_event: Callable[[dict[str, Any]], None],
    error_prefix: str,
) -> AsyncGenerator[str, None]:
    try:
        ai_headers = build_ai_service_headers(getattr(self, "user", None))
    except RuntimeError as exc:
        self.stream_error = str(exc)
        logger.error(self.stream_error)
        yield self._error_event(self.stream_error)
        return

    try:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{ai_service_base_url()}{self.endpoint}",
                json=payload,
                headers=ai_headers,
                timeout=httpx.Timeout(10.0, read=120.0),
            ) as response:
                if response.status_code != 200:
                    await response.aread()
                    error_text = response.text
                    logger.error(
                        "%s: %s - %s",
                        error_prefix,
                        response.status_code,
                        error_text,
                    )
                    self.stream_error = f"ai-service error: {response.status_code}"
                    yield self._error_event(self.stream_error)
                    return

                buffer = ""
                async for chunk in response.aiter_bytes():
                    buffer += chunk.decode("utf-8", errors="replace")
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if not line:
                            continue
                        if line.startswith("data: "):
                            try:
                                event = json.loads(line[6:])
                                on_event(event)
                            except json.JSONDecodeError:
                                pass
                            yield f"{line}\n\n"
                        else:
                            yield f"{line}\n"
                # Flush remaining buffer
                if buffer.strip():
                    line = buffer.strip()
                    if line.startswith("data: "):
                        try:
                            event = json.loads(line[6:])
                            on_event(event)
                        except json.JSONDecodeError:
                            pass
                        yield f"{line}\n\n"
                    else:
                        yield f"{line}\n"
    except Exception as exc:
        self.stream_error = str(exc)
        logger.exception("%s: %s", error_prefix, exc)
        yield self._error_event(self.stream_error)
```

Key changes from sync version:

- `httpx.stream()` → `httpx.AsyncClient().stream()`
- `response.iter_bytes()` → `response.aiter_bytes()`
- `response.read()` → `await response.aread()`
- `Generator` → `AsyncGenerator`
- `yield from` is not allowed in async generators, so callers must use `async for`
- **Step 3: Convert `ChatStreamRuntime.generate` to async**

Replace the `generate` method (lines 287-312):

```python
async def generate(self) -> AsyncGenerator[str, None]:
    if self.session:
        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.USER,
            content=self.content,
            message_type=AIMessage.MessageType.TEXT,
        )
        self._ensure_log()

    init_event = {
        "type": "init",
        "backend_session_id": self.backend_session_id,
        "is_new_session": self.session is None,
    }
    yield f"data: {json.dumps(init_event)}\n\n"

    async for chunk in self._proxy_stream(
        payload=self._build_payload(),
        on_event=self._handle_event,
        error_prefix="Error proxying to ai-service",
    ):
        yield chunk

    self._persist_session()
    self._persist_response()
    self._complete_log()
```

Note: `yield from` → `async for ... yield`. The ORM calls (`_persist_*`) are sync but Django 4.2 allows sync ORM in async context (auto-wraps in `sync_to_async`).

- **Step 4: Convert `ResumeStreamRuntime.generate` to async**

Replace the `generate` method (lines 387-393):

```python
async def generate(self) -> AsyncGenerator[str, None]:
    async for chunk in self._proxy_stream(
        payload=self._build_payload(),
        on_event=self._handle_event,
        error_prefix="Error proxying resume to ai-service",
    ):
        yield chunk
    self._persist_response()
```

- **Step 5: Update imports at top of file**

Replace the imports (lines 1-12):

```python
"""Runtime helpers for AI session streaming flows."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator, Callable
from typing import Any

import httpx
from django.http import StreamingHttpResponse
from django.utils import timezone

from ..models import AIMessage, AISession
from .stream_proxy import (
    ai_service_base_url,
    build_ai_service_headers,
    complete_execution_log,
    create_execution_log,
)
```

Remove `Generator` from imports, add `AsyncGenerator`.

- **Step 6: Commit**

```bash
git add backend/apps/ai/services/session_runtime.py
git commit -m "feat(ai): convert SSE proxy to async for true ASGI streaming"
```

---

### Task 3: Make SSE view actions async

**Files:**

- Modify: `backend/apps/ai/views.py:86-137, 231-266`
- **Step 1: Make `send_message_stream` async**

Change line 86 from `def` to `async def`, and line 137 to `await`:

```python
@action(detail=True, methods=["post"])
async def send_message_stream(self, request, pk=None):
    """Send a message and stream AI response (proxied to ai-service)."""
    # ... (all existing validation logic stays identical, lines 101-135) ...

    runtime = ChatStreamRuntime(
        user=request.user,
        backend_session_id=pk,
        session=session,
        content=content,
        validated_data=serializer.validated_data,
    )
    return build_sse_response(runtime.generate())
```

Only one change: `async def` on declaration. `build_sse_response` stays sync (just constructs the response object).

- **Step 2: Make `resume_stream` async**

Change line 231 from `def` to `async def`:

```python
@action(detail=True, methods=["post"])
async def resume_stream(self, request, pk=None):
    """Resume an interrupted agent and stream the result."""
    # ... (all existing validation logic stays identical, lines 239-259) ...

    runtime = ResumeStreamRuntime(
        user=request.user,
        session=session,
        decision=decision,
    )
    return build_sse_response(runtime.generate())
```

- **Step 3: Commit**

```bash
git add backend/apps/ai/views.py
git commit -m "feat(ai): make SSE view actions async for ASGI streaming"
```

---

### Task 4: Update tests for async

**Files:**

- Modify: `backend/apps/ai/tests/test_message_streaming.py`

The tests mock `httpx.stream` (sync context manager). After the change, the code uses `httpx.AsyncClient.stream` (async context manager). Update the mocks.

- **Step 1: Rewrite the mock helper and patch targets**

Replace the `_mock_stream_response` method and update all test methods:

```python
"""Tests for AI message streaming functionality."""
from unittest.mock import AsyncMock, MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIMessage, AISession

User = get_user_model()


def _create_user(username, email, password="testpass123"):
    """Helper: create a test user."""
    return User.objects.create_user(
        username=username, email=email, password=password,
    )


def _mock_async_stream(thread_id: str):
    """Build mock for httpx.AsyncClient.stream (async context manager)."""
    lines = [
        f'data: {{"type":"run_started","thread_id":"{thread_id}"}}\n\n',
        'data: {"type":"agent_message_delta","content":"Hello"}\n\n',
        'data: {"type":"usage_report","input_tokens":10,"output_tokens":5,"cost_cents":1}\n\n',
        'data: {"type":"done"}\n\n',
    ]

    mock_response = MagicMock()
    mock_response.status_code = 200

    async def aiter_bytes():
        for line in lines:
            yield line.encode("utf-8")

    mock_response.aiter_bytes = aiter_bytes

    # async context manager for client.stream()
    stream_cm = AsyncMock()
    stream_cm.__aenter__.return_value = mock_response
    stream_cm.__aexit__.return_value = None

    # async context manager for AsyncClient()
    mock_client = MagicMock()
    mock_client.stream.return_value = stream_cm

    client_cm = AsyncMock()
    client_cm.__aenter__.return_value = mock_client
    client_cm.__aexit__.return_value = None

    return client_cm


def _mock_async_stream_error():
    """Build mock for httpx.AsyncClient returning 500."""
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"
    mock_response.aread = AsyncMock(return_value=b"Internal Server Error")

    stream_cm = AsyncMock()
    stream_cm.__aenter__.return_value = mock_response
    stream_cm.__aexit__.return_value = None

    mock_client = MagicMock()
    mock_client.stream.return_value = stream_cm

    client_cm = AsyncMock()
    client_cm.__aenter__.return_value = mock_client
    client_cm.__aexit__.return_value = None

    return client_cm


class MessageStreamingTestCase(TestCase):
    """Test message streaming endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.user = _create_user("testuser", "test@example.com")
        self.other_user = _create_user("otheruser", "other@example.com")
        self.session = AISession.objects.create(
            session_id="44444444-4444-4444-4444-444444444444",
            user=self.user,
            context={"title": "existing"},
        )
        self.other_session = AISession.objects.create(
            session_id="55555555-5555-5555-5555-555555555555",
            user=self.other_user,
            context={"title": "other"},
        )

    def test_send_message_stream_to_own_session(self):
        self.client.force_authenticate(user=self.user)
        with patch(
            "apps.ai.services.session_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch(
            "apps.ai.services.session_runtime.httpx.AsyncClient",
            return_value=_mock_async_stream(self.session.session_id),
        ):
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            _ = b"".join(response.streaming_content)

    def test_send_message_stream_to_other_user_session_returns_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.other_session.session_id}/send_message_stream/",
            {"content": "Hello"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_message_saved_after_streaming(self):
        self.client.force_authenticate(user=self.user)

        with patch(
            "apps.ai.services.session_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch(
            "apps.ai.services.session_runtime.httpx.AsyncClient",
            return_value=_mock_async_stream(self.session.session_id),
        ):
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "User question"},
                format="json",
            )
            _ = b"".join(response.streaming_content)

            user_messages = AIMessage.objects.filter(
                session=self.session,
                role=AIMessage.Role.USER,
                content="User question",
            )
            assistant_messages = AIMessage.objects.filter(
                session=self.session,
                role=AIMessage.Role.ASSISTANT,
            )
            self.assertEqual(user_messages.count(), 1)
            self.assertGreaterEqual(assistant_messages.count(), 1)

    def test_non_existent_session_id_treated_as_new_backend_session(self):
        self.client.force_authenticate(user=self.user)
        backend_session_id = "66666666-6666-6666-6666-666666666666"
        ai_thread_id = "77777777-7777-7777-7777-777777777777"

        with patch(
            "apps.ai.services.session_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch(
            "apps.ai.services.session_runtime.httpx.AsyncClient",
            return_value=_mock_async_stream(ai_thread_id),
        ):
            response = self.client.post(
                f"/api/v1/ai/sessions/{backend_session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            _ = b"".join(response.streaming_content)

        self.assertTrue(
            AISession.objects.filter(session_id=ai_thread_id, user=self.user).exists()
        )

    def test_ai_service_error_handling(self):
        self.client.force_authenticate(user=self.user)

        with patch(
            "apps.ai.services.session_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch(
            "apps.ai.services.session_runtime.httpx.AsyncClient",
            return_value=_mock_async_stream_error(),
        ):
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            payload = b"".join(response.streaming_content).decode("utf-8", errors="ignore")
            self.assertIn('"type": "error"', payload)
```

- **Step 2: Run tests**

```bash
docker compose -f docker-compose.dev.yml exec -T backend python -m pytest apps/ai/tests/test_message_streaming.py -v --no-cov
```

Expected: All 5 tests pass (plus the 2 persistence tests which don't touch streaming).

- **Step 3: Commit**

```bash
git add backend/apps/ai/tests/test_message_streaming.py
git commit -m "test(ai): update streaming tests for async httpx mocks"
```

---

### Task 5: End-to-end streaming verification

**Files:** None (manual verification)

- **Step 1: Restart backend with uvicorn**

```bash
docker compose -f docker-compose.dev.yml up -d --no-deps --build backend
docker compose -f docker-compose.dev.yml logs backend --since=10s
```

Expected: `INFO: Uvicorn running on http://0.0.0.0:8000`

- **Step 2: Verify SSE streams incrementally via curl**

Generate a fresh CSRF token and JWT, then:

```bash
curl -N --no-buffer --max-time 60 -X POST \
  "http://localhost:8000/api/v1/ai/sessions/<SESSION_ID>/send_message_stream/" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: <CSRF>" \
  -H "X-QJudge-Agent-Contract: v2" \
  -H "Cookie: access_token=<JWT>; csrftoken=<CSRF>" \
  -d '{"content": "你好"}' 2>&1 | while IFS= read -r line; do
    [ -n "$line" ] && echo "[$(date +%H:%M:%S)] $line"
  done
```

Expected: Events arrive at **different timestamps** — `init` immediately, `run_started` within 1s, then `agent_message_delta` tokens spread across seconds. This is the key success criterion.

- **Step 3: Verify in browser**

Open the chatbot in the browser and send a message. Verify:

- Reasoning panel opens and shows thinking content incrementally
- Chain of Thought steps appear one by one with spinners
- Text response streams character by character
- "Response stopped" no longer appears for normal completions
- **Step 4: Verify non-SSE endpoints unaffected**

Spot-check a few REST endpoints:

- `GET /api/v1/ai/sessions/` — list sessions
- `POST /api/v1/ai/sessions/new_session/` — create session
- `GET /api/v1/auth/me` — user info

Expected: All return correct JSON responses as before.

- **Step 5: Commit (if any adjustments were needed)**

```bash
git add -A
git commit -m "fix(ai): verified async SSE streaming works end-to-end"
```

---

### Task 6: Fix production Nginx SSE config

**Files:**

- Modify: `frontend/nginx/default.conf:9-15`

The production Nginx config lacks SSE-specific headers. While the backend sets `X-Accel-Buffering: no` (which Nginx respects), adding explicit SSE configuration is defensive and handles edge cases.

- **Step 1: Add SSE proxy settings to `/api/` location**

Replace lines 9-15 in `frontend/nginx/default.conf`:

```nginx
# Backend API proxy
location /api/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;

    # SSE streaming support
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
}
```

Key additions:

- `proxy_http_version 1.1` — required for chunked transfer encoding
- `proxy_set_header Connection ''` — prevents hop-by-hop Connection header issues
- `proxy_buffering off` — belt-and-suspenders with `X-Accel-Buffering: no`
- `proxy_cache off` — no caching of SSE responses
- **Step 2: Commit**

```bash
git add frontend/nginx/default.conf
git commit -m "fix(nginx): add SSE streaming proxy headers for production"
```

