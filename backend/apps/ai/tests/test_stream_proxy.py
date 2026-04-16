"""Tests for build_ai_service_headers() — the auth header builder."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken

from apps.ai.services.stream_proxy import build_ai_service_headers

User = get_user_model()


class BuildAiServiceHeadersNoDatabaseTestCase(SimpleTestCase):
    """Tests that do NOT require the database."""

    @override_settings(AI_SERVICE_INTERNAL_TOKEN="test-token-abc")
    def test_returns_internal_token_header(self):
        headers = build_ai_service_headers()
        assert headers["X-AI-Internal-Token"] == "test-token-abc"

    @override_settings(AI_SERVICE_INTERNAL_TOKEN="test-token-abc")
    def test_omits_jwt_when_user_is_none(self):
        headers = build_ai_service_headers(user=None)
        assert "X-QJudge-User-Authorization" not in headers
        assert "X-AI-Internal-Token" in headers

    @override_settings(AI_SERVICE_INTERNAL_TOKEN="test-token-abc")
    def test_omits_jwt_when_user_is_anonymous(self):
        headers = build_ai_service_headers(user=AnonymousUser())
        assert "X-QJudge-User-Authorization" not in headers

    @override_settings(AI_SERVICE_INTERNAL_TOKEN="")
    def test_raises_when_token_not_configured(self):
        with self.assertRaises(RuntimeError) as cm:
            build_ai_service_headers()
        assert "AI_SERVICE_INTERNAL_TOKEN" in str(cm.exception)

    @override_settings(AI_SERVICE_INTERNAL_TOKEN="   ")
    def test_raises_when_token_is_whitespace_only(self):
        with self.assertRaises(RuntimeError):
            build_ai_service_headers()


class BuildAiServiceHeadersWithDatabaseTestCase(TestCase):
    """Tests that require the database (User model)."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="proxy_test_user",
            email="proxy@test.com",
            password="testpass123",
        )

    @override_settings(AI_SERVICE_INTERNAL_TOKEN="test-token-abc")
    def test_includes_user_jwt_when_authenticated(self):
        headers = build_ai_service_headers(user=self.user)

        assert "X-QJudge-User-Authorization" in headers
        bearer = headers["X-QJudge-User-Authorization"]
        assert bearer.startswith("Bearer ")

        # Decode the JWT and verify the user_id claim
        raw_token = bearer.removeprefix("Bearer ")
        token = AccessToken(raw_token)
        assert str(token["user_id"]) == str(self.user.pk)
