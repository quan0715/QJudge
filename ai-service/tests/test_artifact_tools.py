"""Tests for session-private artifact LangChain tools."""
from __future__ import annotations

import asyncio
import os
import sys
import types

os.environ.setdefault("AI_INTERNAL_TOKEN", "test-ai-internal-token")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-deepseek-key")

_deepseek_stub = types.ModuleType("langchain_deepseek")


class _ChatDeepSeekStub:  # pragma: no cover - import stub only
    pass


_deepseek_stub.ChatDeepSeek = _ChatDeepSeekStub
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)

from services.artifact_tools import build_artifact_tools  # noqa: E402


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _tool(tools, name):
    for t in tools:
        if t.name == name:
            return t
    raise AssertionError(f"tool {name} not found")


class _StubResponse:
    def __init__(self, status_code=200, json_data=None, content=b""):
        self.status_code = status_code
        self._json = json_data if json_data is not None else {}
        self.content = content
        self.text = ""

    def json(self):
        return self._json


class _StubClient:
    """Minimal drop-in replacement for httpx.AsyncClient used in these tools."""

    def __init__(self, responses):
        # responses: list of dicts with keys {method, url_contains, status, json, content}
        self._responses = list(responses)
        self.calls: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    def _next(self, method, url):
        assert self._responses, f"no stub response queued for {method} {url}"
        spec = self._responses.pop(0)
        assert spec["method"] == method, (spec, method)
        if "url_contains" in spec:
            assert spec["url_contains"] in url, (spec, url)
        return _StubResponse(
            status_code=spec.get("status", 200),
            json_data=spec.get("json"),
            content=spec.get("content", b""),
        )

    async def post(self, url, json=None, headers=None):
        self.calls.append({"method": "POST", "url": url, "json": json, "headers": headers})
        return self._next("POST", url)

    async def get(self, url, params=None, headers=None):
        self.calls.append({"method": "GET", "url": url, "params": params, "headers": headers})
        return self._next("GET", url)


def _patch_httpx(monkeypatch, stub):
    import services.artifact_tools as mod

    class _Factory:
        def __init__(self, *a, **kw):
            self._stub = stub

        async def __aenter__(self):
            return self._stub

        async def __aexit__(self, *a):
            return None

    monkeypatch.setattr(mod.httpx, "AsyncClient", _Factory)
    return stub


def _tools(session_id="sess-1", run_id="run-1"):
    return build_artifact_tools(
        session_id=session_id,
        run_id=run_id,
        backend_base_url="http://backend",
        internal_token="test-token",
    )


def test_write_posts_expected_payload(monkeypatch):
    stub = _StubClient([
        {
            "method": "POST",
            "url_contains": "/_internal/artifacts/",
            "status": 201,
            "json": {"id": "a-1", "step": "rubric", "filename": "rubric.json"},
        }
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write")
    result = _run(tool.coroutine(
        step="rubric",
        filename="rubric.json",
        content='{"v": 1}',
        content_type="application/json",
    ))
    assert result["id"] == "a-1"
    call = stub.calls[0]
    assert call["json"]["session_id"] == "sess-1"
    assert call["json"]["run_id"] == "run-1"
    assert call["json"]["step"] == "rubric"
    assert call["headers"]["X-AI-Internal-Token"] == "test-token"


def test_write_returns_error_on_400(monkeypatch):
    stub = _StubClient([
        {"method": "POST", "status": 400, "json": {"detail": "bad filename"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write")
    result = _run(tool.coroutine(
        step="rubric", filename="../bad", content="x",
    ))
    assert result["is_error"] is True
    assert result["status"] == 400


def test_list_filters_and_returns_results(monkeypatch):
    stub = _StubClient([
        {
            "method": "GET",
            "url_contains": "/_internal/artifacts/",
            "status": 200,
            "json": [{"id": "a-1"}, {"id": "a-2"}],
        }
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_list")
    result = _run(tool.coroutine(step="rubric"))
    assert [a["id"] for a in result["artifacts"]] == ["a-1", "a-2"]
    call = stub.calls[0]
    assert call["params"]["session_id"] == "sess-1"
    assert call["params"]["step"] == "rubric"


def test_read_fetches_content_after_listing(monkeypatch):
    stub = _StubClient([
        {
            "method": "GET",
            "url_contains": "/_internal/artifacts/",
            "status": 200,
            "json": [
                {
                    "id": "a-1",
                    "step": "rubric",
                    "filename": "rubric.json",
                    "content_type": "application/json",
                }
            ],
        },
        {
            "method": "GET",
            "url_contains": "/a-1/content/",
            "status": 200,
            "content": b'{"a":1}',
        },
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_read")
    result = _run(tool.coroutine(step="rubric", filename="rubric.json"))
    assert result["content"] == '{"a":1}'
    assert result["metadata"]["id"] == "a-1"


def test_read_missing_returns_error(monkeypatch):
    stub = _StubClient([
        {"method": "GET", "status": 200, "json": []},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_read")
    result = _run(tool.coroutine(step="rubric", filename="missing.json"))
    assert result["is_error"] is True


def test_tools_without_session_return_error():
    tools = build_artifact_tools(
        session_id=None,
        run_id=None,
        backend_base_url="http://backend",
        internal_token="t",
    )
    for name in ("artifact_write", "artifact_list", "artifact_read"):
        tool = _tool(tools, name)
        if name == "artifact_write":
            result = _run(tool.coroutine(step="s", filename="f", content="c"))
        elif name == "artifact_list":
            result = _run(tool.coroutine())
        else:
            result = _run(tool.coroutine(step="s", filename="f"))
        assert result["is_error"] is True
        assert "session_id" in result["detail"]
