import asyncio
import sys
import types
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from apps.users.models import User
from apps.users.services import (
    APIKeyService,
    EmailAuthService,
    JWTService,
    NYCUOAuthService,
)


class JWTServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="jwt-user",
            email="jwt@example.com",
            password="password123",
            role="student",
        )

    def test_generate_tokens_updates_last_login_and_returns_expected_fields(self):
        self.assertIsNone(self.user.last_login_at)

        tokens = JWTService.generate_tokens(self.user)
        self.user.refresh_from_db()

        self.assertIn("access", tokens)
        self.assertIn("refresh", tokens)
        self.assertIn("expires_in", tokens)
        self.assertGreater(tokens["expires_in"], 0)
        self.assertIsNotNone(self.user.last_login_at)

    def test_get_user_response_data_formats_payload(self):
        tokens = {"access": "a", "refresh": "r", "expires_in": 3600}
        payload = JWTService.get_user_response_data(self.user, tokens)

        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["access_token"], "a")
        self.assertEqual(payload["data"]["refresh_token"], "r")
        self.assertEqual(payload["data"]["expires_in"], 3600)
        self.assertEqual(payload["data"]["user"]["email"], self.user.email)


class EmailAuthServiceTests(TestCase):
    def setUp(self):
        self.active = User.objects.create_user(
            username="active-user",
            email="active@example.com",
            password="password123",
            auth_provider="email",
            is_active=True,
        )
        self.inactive = User.objects.create_user(
            username="inactive-user",
            email="inactive@example.com",
            password="password123",
            auth_provider="email",
            is_active=False,
        )

    def test_login_supports_email_and_username(self):
        by_email = EmailAuthService.login("active@example.com", "password123")
        by_username = EmailAuthService.login("active-user", "password123")
        self.assertEqual(by_email.id, self.active.id)
        self.assertEqual(by_username.id, self.active.id)

    def test_login_rejects_wrong_password_or_inactive_user(self):
        wrong_password = EmailAuthService.login("active@example.com", "wrong")
        inactive_user = EmailAuthService.login("inactive@example.com", "password123")
        unknown_user = EmailAuthService.login("missing@example.com", "password123")

        self.assertIsNone(wrong_password)
        self.assertIsNone(inactive_user)
        self.assertIsNone(unknown_user)

    @override_settings(FRONTEND_URL="http://localhost:5173")
    def test_send_verification_email_and_verify_email_success(self):
        verification_url = EmailAuthService.send_verification_email(self.active)
        self.active.refresh_from_db()

        self.assertIn("verify-email?token=", verification_url)
        self.assertIsNotNone(self.active.email_verification_token)
        self.assertIsNotNone(self.active.email_verification_expires_at)

        verified = EmailAuthService.verify_email(self.active.email_verification_token)
        self.assertIsNotNone(verified)
        self.active.refresh_from_db()
        self.assertTrue(self.active.email_verified)
        self.assertIsNone(self.active.email_verification_token)
        self.assertIsNone(self.active.email_verification_expires_at)

    def test_verify_email_returns_none_for_invalid_token(self):
        verified = EmailAuthService.verify_email("invalid-token")
        self.assertIsNone(verified)


class NYCUOAuthServiceTests(TestCase):
    @override_settings(
        NYCU_OAUTH_CLIENT_ID="client-id",
        NYCU_OAUTH_AUTHORIZE_URL="https://oauth.example.com/authorize",
    )
    def test_get_authorization_url(self):
        url = NYCUOAuthService.get_authorization_url(
            "http://localhost/callback",
            "state-123",
        )
        self.assertIn("https://oauth.example.com/authorize?", url)
        self.assertIn("client_id=client-id", url)
        self.assertIn("state=state-123", url)

    @override_settings(
        NYCU_OAUTH_TOKEN_URL="https://oauth.example.com/token",
        NYCU_OAUTH_CLIENT_ID="client-id",
        NYCU_OAUTH_CLIENT_SECRET="client-secret",
        NYCU_OAUTH_USERINFO_URL="https://oauth.example.com/userinfo",
    )
    @patch("apps.users.services.requests.get")
    @patch("apps.users.services.requests.post")
    def test_exchange_code_success(self, mock_post, mock_get):
        token_resp = MagicMock(status_code=200)
        token_resp.json.return_value = {"access_token": "token-123"}
        userinfo_resp = MagicMock(status_code=200)
        userinfo_resp.json.return_value = {
            "username": "nycu-user",
            "email": "nycu@example.com",
            "sub": "oauth-sub-1",
        }
        mock_post.return_value = token_resp
        mock_get.return_value = userinfo_resp

        data = NYCUOAuthService.exchange_code("code-123", "http://localhost/callback")

        self.assertEqual(data["access_token"], "token-123")
        self.assertEqual(data["user_info"]["username"], "nycu-user")
        self.assertEqual(data["user_info"]["oauth_id"], "oauth-sub-1")

    @override_settings(
        NYCU_OAUTH_TOKEN_URL="https://oauth.example.com/token",
        NYCU_OAUTH_CLIENT_ID="client-id",
        NYCU_OAUTH_CLIENT_SECRET="client-secret",
        NYCU_OAUTH_USERINFO_URL="https://oauth.example.com/userinfo",
    )
    @patch("apps.users.services.requests.post")
    def test_exchange_code_raises_on_token_exchange_failure(self, mock_post):
        mock_post.return_value = MagicMock(status_code=500)
        with self.assertRaisesMessage(Exception, "Failed to exchange authorization code"):
            NYCUOAuthService.exchange_code("bad-code", "http://localhost/callback")

    def test_get_or_create_user_updates_existing_oauth_user(self):
        existing = User.objects.create_user(
            username="legacy-name",
            email="nycu@example.com",
            password="password123",
            auth_provider="nycu-oauth",
            email_verified=False,
        )
        result = NYCUOAuthService.get_or_create_user(
            {
                "user_info": {
                    "username": "new-name",
                    "email": "nycu@example.com",
                }
            }
        )
        existing.refresh_from_db()

        self.assertEqual(result.id, existing.id)
        self.assertEqual(existing.username, "new-name")
        self.assertTrue(existing.email_verified)

    def test_get_or_create_user_creates_new_user_with_unique_username(self):
        User.objects.create_user(
            username="taken-name",
            email="other@example.com",
            password="password123",
            auth_provider="email",
        )
        user = NYCUOAuthService.get_or_create_user(
            {
                "user_info": {
                    "username": "taken-name",
                    "email": "new-nycu@example.com",
                }
            }
        )
        self.assertNotEqual(user.username, "taken-name")
        self.assertTrue(user.username.startswith("taken-name"))
        self.assertEqual(user.auth_provider, "nycu-oauth")
        self.assertTrue(user.email_verified)


class APIKeyServiceTests(TestCase):
    def test_calculate_cost_uses_model_pricing(self):
        haiku_cost = APIKeyService.calculate_cost(1_000_000, 1_000_000, "haiku")
        sonnet_cost = APIKeyService.calculate_cost(1_000_000, 1_000_000, "sonnet")
        unknown_cost = APIKeyService.calculate_cost(1_000_000, 1_000_000, "unknown")

        self.assertEqual(haiku_cost, 480)
        self.assertEqual(sonnet_cost, 1800)
        self.assertEqual(unknown_cost, haiku_cost)

    def test_validate_anthropic_key_success(self):
        class FakeMessages:
            @staticmethod
            def create(**kwargs):
                return {"ok": True}

        class FakeClient:
            def __init__(self, api_key):
                self.api_key = api_key
                self.messages = FakeMessages()

        fake_module = types.SimpleNamespace(Anthropic=FakeClient)

        with patch.dict(sys.modules, {"anthropic": fake_module}):
            valid, error = APIKeyService.validate_anthropic_key("sk-test")

        self.assertTrue(valid)
        self.assertEqual(error, "")

    def test_validate_anthropic_key_invalid(self):
        class FakeMessages:
            @staticmethod
            def create(**kwargs):
                raise Exception("authentication failed")

        class FakeClient:
            def __init__(self, api_key):
                self.api_key = api_key
                self.messages = FakeMessages()

        fake_module = types.SimpleNamespace(Anthropic=FakeClient)

        with patch.dict(sys.modules, {"anthropic": fake_module}):
            valid, error = APIKeyService.validate_anthropic_key("invalid")

        self.assertFalse(valid)
        self.assertEqual(error, "Invalid API key")
