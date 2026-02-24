"""API endpoint tests for AI Service (DeepAgent v2)."""

import os

import pytest
from fastapi.testclient import TestClient

# Ensure required internal auth secrets exist before app import.
os.environ.setdefault("HMAC_SECRET", "test-hmac-secret")
os.environ.setdefault("AI_INTERNAL_TOKEN", "test-ai-internal-token")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")

from main import app


class _FakeRunner:
    """No-network runner for API contract tests."""

    async def run_stream(self, **kwargs):
        yield {"type": "run_started", "run_id": "r1", "thread_id": "t1"}
        yield {"type": "run_completed", "run_id": "r1"}

    async def resume_stream(self, **kwargs):
        yield {"type": "run_started", "run_id": "r2", "thread_id": kwargs["thread_id"]}
        yield {"type": "run_completed", "run_id": "r2"}


class _ErrorRunner:
    """Runner that raises deterministic errors for leak-safety tests."""

    async def run_stream(self, **kwargs):
        raise RuntimeError("sensitive-run-error")
        yield  # pragma: no cover

    async def resume_stream(self, **kwargs):
        raise RuntimeError("sensitive-resume-error")
        yield  # pragma: no cover


@pytest.fixture
def client():
    """Create test client with fake runner to avoid external LLM calls."""
    with TestClient(app) as test_client:
        test_client.app.state.deepagent_runner = _FakeRunner()
        yield test_client


@pytest.fixture
def error_client():
    """Create test client with error runner for failure-path assertions."""
    with TestClient(app) as test_client:
        test_client.app.state.deepagent_runner = _ErrorRunner()
        yield test_client


AUTH_HEADERS = {"X-AI-Internal-Token": "test-ai-internal-token"}


class TestHealthEndpoint:
    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert "status" in data
        assert "version" in data
        assert "checkpoint_db" in data

    def test_health_check_fields(self, client):
        response = client.get("/health")
        data = response.json()

        assert data["status"] in ["healthy", "degraded"]
        assert isinstance(data["version"], str)
        assert data["checkpoint_db"] in ["connected", "not_configured"]


class TestRootEndpoint:
    def test_root(self, client):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert "version" in data
        assert "docs" in data


class TestModelsEndpoint:
    def test_models_endpoint(self, client):
        response = client.get("/api/models")
        assert response.status_code == 200
        data = response.json()
        assert "models" in data
        assert isinstance(data["models"], list)
        assert any(m.get("is_default") for m in data["models"])


class TestChatStreamEndpoint:
    def test_stream_requires_content(self, client):
        response = client.post("/api/chat/stream", json={})
        assert response.status_code == 422

    def test_stream_requires_internal_auth(self, client):
        response = client.post(
            "/api/chat/stream",
            json={"content": "hello", "conversation": []},
        )
        assert response.status_code == 401

    def test_stream_rejects_empty_content(self, client):
        response = client.post(
            "/api/chat/stream",
            headers=AUTH_HEADERS,
            json={"content": "", "conversation": []},
        )
        assert response.status_code == 422

    def test_stream_limits_conversation_length(self, client):
        too_many_messages = [{"role": "user", "content": "m"} for _ in range(51)]
        response = client.post(
            "/api/chat/stream",
            headers=AUTH_HEADERS,
            json={"content": "hello", "conversation": too_many_messages},
        )
        assert response.status_code == 422

    def test_stream_validates_skill_existence(self, client):
        response = client.post(
            "/api/chat/stream",
            headers=AUTH_HEADERS,
            json={
                "content": "test",
                "conversation": [],
                "skill": "nonexistent-skill",
            },
        )
        assert response.status_code == 400

    def test_stream_accepts_valid_request(self, client):
        response = client.post(
            "/api/chat/stream",
            headers=AUTH_HEADERS,
            json={
                "content": "Hello",
                "conversation": [{"role": "user", "content": "Hi"}],
            },
        )
        assert response.status_code == 200

    def test_stream_accepts_valid_skill(self, client):
        response = client.post(
            "/api/chat/stream",
            headers=AUTH_HEADERS,
            json={
                "content": "Generate a contest problem",
                "conversation": [],
                "skill": "contest-problem-authoring-guide",
            },
        )
        assert response.status_code == 200

    def test_stream_failure_does_not_leak_internal_error(self, error_client):
        response = error_client.post(
            "/api/chat/stream",
            headers=AUTH_HEADERS,
            json={
                "content": "Hello",
                "conversation": [],
            },
        )
        assert response.status_code == 200
        assert "Streaming failed" in response.text
        assert "sensitive-run-error" not in response.text

    def test_resume_requires_internal_auth(self, client):
        response = client.post(
            "/api/chat/resume",
            json={
                "thread_id": "thread-1",
                "decision": "approve",
                "session_id": "s1",
                "user_id": 1,
            },
        )
        assert response.status_code == 401

    def test_resume_rejects_empty_thread_id(self, client):
        response = client.post(
            "/api/chat/resume",
            headers=AUTH_HEADERS,
            json={
                "thread_id": "",
                "decision": "approve",
                "session_id": "s1",
                "user_id": 1,
            },
        )
        assert response.status_code == 422

    def test_resume_accepts_valid_request(self, client):
        response = client.post(
            "/api/chat/resume",
            headers=AUTH_HEADERS,
            json={
                "thread_id": "thread-1",
                "decision": "approve",
                "session_id": "s1",
                "user_id": 1,
            },
        )
        assert response.status_code == 200

    def test_resume_failure_does_not_leak_internal_error(self, error_client):
        response = error_client.post(
            "/api/chat/resume",
            headers=AUTH_HEADERS,
            json={
                "thread_id": "thread-1",
                "decision": "approve",
                "session_id": "s1",
                "user_id": 1,
            },
        )
        assert response.status_code == 200
        assert "Resume failed" in response.text
        assert "sensitive-resume-error" not in response.text
