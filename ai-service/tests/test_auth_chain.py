"""Tests for auth chain: validate_internal_auth + RequestContext JWT extraction."""

import os

import pytest
from fastapi.testclient import TestClient

# Ensure required env vars before app import.
os.environ.setdefault("AI_INTERNAL_TOKEN", "test-ai-internal-token")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")

from config import get_settings  # noqa: E402
from main import app  # noqa: E402

# Use whatever token the running environment has configured.
_CONFIGURED_TOKEN = get_settings().ai_internal_token.strip()
AUTH_HEADERS = {"X-AI-Internal-Token": _CONFIGURED_TOKEN}
VALID_BODY = {"content": "Hello", "conversation": []}


class _CapturingRunner:
    """Runner that captures request_context from each call."""

    def __init__(self):
        self.captured_contexts = []

    async def run_stream(self, **kwargs):
        self.captured_contexts.append(kwargs.get("request_context"))
        yield {"type": "run_started", "run_id": "r1", "thread_id": "t1"}
        yield {"type": "run_completed", "run_id": "r1"}

    async def resume_stream(self, **kwargs):
        self.captured_contexts.append(kwargs.get("request_context"))
        yield {"type": "run_started", "run_id": "r2", "thread_id": kwargs["thread_id"]}
        yield {"type": "run_completed", "run_id": "r2"}


@pytest.fixture
def capturing_client():
    runner = _CapturingRunner()
    with TestClient(app) as c:
        c.app.state.deepagent_runner = runner
        c._runner = runner  # expose for assertions
        yield c


# ============================================================
# validate_internal_auth edge cases
# ============================================================


class TestValidateInternalAuth:
    def test_rejects_wrong_token(self, capturing_client):
        response = capturing_client.post(
            "/api/chat/stream",
            json=VALID_BODY,
            headers={"X-AI-Internal-Token": "wrong-token"},
        )
        assert response.status_code == 401

    def test_rejects_empty_token_value(self, capturing_client):
        response = capturing_client.post(
            "/api/chat/stream",
            json=VALID_BODY,
            headers={"X-AI-Internal-Token": ""},
        )
        assert response.status_code == 401

    def test_rejects_missing_token_header(self, capturing_client):
        response = capturing_client.post(
            "/api/chat/stream",
            json=VALID_BODY,
        )
        assert response.status_code == 401


# ============================================================
# RequestContext JWT extraction
# ============================================================


class TestRequestContextExtraction:
    def test_user_authorization_extracted_from_header(self, capturing_client):
        runner = capturing_client._runner
        headers = {
            **AUTH_HEADERS,
            "X-QJudge-User-Authorization": "Bearer eyJhbGciOi.test.jwt",
        }
        response = capturing_client.post(
            "/api/chat/stream",
            json=VALID_BODY,
            headers=headers,
        )
        assert response.status_code == 200
        assert len(runner.captured_contexts) == 1
        ctx = runner.captured_contexts[0]
        assert ctx is not None
        assert ctx.user_authorization == "Bearer eyJhbGciOi.test.jwt"

    def test_user_authorization_is_none_when_header_absent(self, capturing_client):
        runner = capturing_client._runner
        response = capturing_client.post(
            "/api/chat/stream",
            json=VALID_BODY,
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 200
        assert len(runner.captured_contexts) == 1
        ctx = runner.captured_contexts[0]
        assert ctx is not None
        assert ctx.user_authorization is None

    def test_resume_also_extracts_user_authorization(self, capturing_client):
        runner = capturing_client._runner
        headers = {
            **AUTH_HEADERS,
            "X-QJudge-User-Authorization": "Bearer resume-jwt-tok",
        }
        response = capturing_client.post(
            "/api/chat/resume",
            json={
                "thread_id": "thread-1",
                "decision": "approve",
            },
            headers=headers,
        )
        assert response.status_code == 200
        assert len(runner.captured_contexts) == 1
        ctx = runner.captured_contexts[0]
        assert ctx.user_authorization == "Bearer resume-jwt-tok"
