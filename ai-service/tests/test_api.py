"""API endpoint tests for AI Service.

Run with: pytest tests/ -v
"""

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_check(self, client):
        """Health endpoint should return status."""
        response = client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert "status" in data
        assert "skills_loaded" in data
        assert "version" in data

    def test_health_check_fields(self, client):
        """Health response should have all required fields."""
        response = client.get("/health")
        data = response.json()

        assert data["status"] in ["healthy", "degraded", "unhealthy"]
        assert data["claude_api"] in ["connected", "disconnected", "unknown"]
        assert isinstance(data["skills_loaded"], int)
        assert isinstance(data["version"], str)


class TestRootEndpoint:
    """Tests for / endpoint."""

    def test_root(self, client):
        """Root endpoint should return service info."""
        response = client.get("/")
        assert response.status_code == 200

        data = response.json()
        assert "service" in data
        assert "version" in data
        assert "docs" in data


class TestChatStreamEndpoint:
    """Tests for /api/chat/stream endpoint."""

    def test_stream_requires_conversation(self, client):
        """Stream should require conversation field."""
        response = client.post("/api/chat/stream", json={})
        assert response.status_code == 422

    def test_stream_validates_skill_existence(self, client):
        """Stream should validate skill exists."""
        response = client.post(
            "/api/chat/stream",
            json={
                "conversation": [{"role": "user", "content": "test"}],
                "skill": "nonexistent-skill"
            }
        )
        assert response.status_code == 400

    def test_stream_accepts_valid_request(self, client):
        """Stream should accept valid request structure."""
        # This will fail without Claude API key, but should validate structure
        response = client.post(
            "/api/chat/stream",
            json={
                "conversation": [
                    {"role": "user", "content": "Hello"}
                ]
            }
        )
        # Will return 200 (SSE stream) or 500 if Claude SDK not available
        assert response.status_code in [200, 500]

    def test_stream_validates_skill_parameter(self, client):
        """Stream should validate skill parameter format."""
        response = client.post(
            "/api/chat/stream",
            json={
                "conversation": [{"role": "user", "content": "test"}],
                "skill": "parse-problem-request"  # Valid skill
            }
        )
        # Should succeed or fail on Claude call, not validation
        assert response.status_code in [200, 500]

    def test_stream_accepts_session_id(self, client):
        """Stream should accept session_id for resuming."""
        response = client.post(
            "/api/chat/stream",
            json={
                "conversation": [{"role": "user", "content": "test"}],
                "session_id": "test-session-123"
            }
        )
        # Should accept session_id parameter
        assert response.status_code in [200, 500]
