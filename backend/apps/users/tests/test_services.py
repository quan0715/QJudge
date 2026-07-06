import asyncio
import os
import sys
import types
import base64
import json
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from apps.users.auth.account_linking import link_qauth_identity
from apps.users.auth.provider_registry import get_oauth_service
from apps.users.auth.providers import GitHubOAuthService, GoogleOAuthService, NYCUOAuthService
from apps.users.models import User, UserProfile
from apps.users.services import (
    EmailAuthService,
    JWTService,
    get_auth_options,
)


def link_oauth_user(service, user_info, access_token=""):
    oauth_data = {"access_token": access_token, "user_info": user_info}
    return link_qauth_identity(
        service.normalize_identity(oauth_data),
        service.provider_token_set(oauth_data),
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
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.onboarding_completed_at = timezone.now()
        profile.display_name = "JWT User"
        profile.save(update_fields=["onboarding_completed_at", "display_name", "updated_at"])

        tokens = {"access": "a", "refresh": "r", "expires_in": 3600}
        payload = JWTService.get_user_response_data(self.user, tokens)

        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["access_token"], "a")
        self.assertEqual(payload["data"]["refresh_token"], "r")
        self.assertEqual(payload["data"]["expires_in"], 3600)
        self.assertEqual(payload["data"]["user"]["email"], self.user.email)
        self.assertEqual(payload["data"]["user"]["profile"]["display_name"], "JWT User")
        self.assertIsNotNone(payload["data"]["user"]["profile"]["onboarding_completed_at"])


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


class AuthOptionsTests(SimpleTestCase):
    def test_auth_provider_options_are_not_loaded_from_settings_module(self):
        import config.settings.base as base_settings

        self.assertFalse(hasattr(base_settings, "AUTH_PROVIDER_OPTIONS"))
        self.assertFalse(hasattr(base_settings, "DEFAULT_AUTH_PROVIDER_OPTIONS"))
        self.assertFalse(hasattr(base_settings, "_load_auth_provider_options"))

    @override_settings(
        AUTH_EMAIL_PASSWORD_ENABLED=False,
        AUTH_PROVIDER_OPTIONS=[
            {
                "key": "nycu",
                "type": "oidc",
                "category": "campus",
                "display_name": "NYCU 國立陽明交通大學",
                "display_name_i18n_key": "auth.providers.nycu",
                "logo_url": "/auth-providers/nycu.svg",
                "issuer": "https://id.nycu.edu.tw",
                "token_url": "https://id.nycu.edu.tw/o/token/",
                "client_secret_env": "NYCU_OAUTH_CLIENT_SECRET",
            },
            {
                "key": "missing",
                "category": "campus",
                "display_name": "Missing University",
            },
        ],
    )
    def test_get_auth_options_returns_public_known_providers(self):
        options = get_auth_options()

        self.assertFalse(options["password_enabled"])
        self.assertEqual(
            options["providers"],
            [
                {
                    "key": "nycu",
                    "type": "oidc",
                    "category": "campus",
                    "display_name": "NYCU 國立陽明交通大學",
                    "display_name_i18n_key": "auth.providers.nycu",
                    "logo_url": "/illustrations/nycu-logo.png",
                },
                {
                    "key": "github",
                    "type": "oauth2",
                    "category": "social",
                    "display_name": "GitHub",
                    "display_name_i18n_key": "auth.providers.github",
                },
                {
                    "key": "google",
                    "type": "oidc",
                    "category": "social",
                    "display_name": "Google",
                    "display_name_i18n_key": "auth.providers.google",
                    "logo_url": "/illustrations/google-icon.svg",
                },
            ],
        )

    @patch.dict(os.environ, {"NYCU_OAUTH_CLIENT_ID": "client-id", "NYCU_OAUTH_CLIENT_SECRET": "client-secret"})
    def test_provider_connections_are_loaded_server_side_with_env_credentials(self):
        from apps.users.auth.provider_connections import load_provider_connections, resolve_provider_credentials

        raw_connections = json.dumps(
            [
                {
                    "key": "nycu",
                    "type": "oidc",
                    "issuer_url": "https://id.nycu.edu.tw",
                    "scope": "openid email profile",
                    "client_id_env": "NYCU_OAUTH_CLIENT_ID",
                    "client_secret_env": "NYCU_OAUTH_CLIENT_SECRET",
                    "claim_mapping": {
                        "subject": "sub",
                        "email": "email",
                        "name": "name",
                        "avatar_url": "picture",
                    },
                }
            ]
        )

        connections = load_provider_connections(raw=raw_connections)
        nycu = connections["nycu"]

        self.assertEqual(nycu.type, "oidc")
        self.assertEqual(nycu.issuer_url, "https://id.nycu.edu.tw")
        self.assertEqual(nycu.claim_mapping["email"], "email")
        self.assertEqual(resolve_provider_credentials(nycu), ("client-id", "client-secret"))

    def test_auth_options_never_exposes_provider_connection_details(self):
        options = get_auth_options()
        provider = next(item for item in options["providers"] if item["key"] == "github")

        self.assertEqual(
            provider,
            {
                "key": "github",
                "type": "oauth2",
                "category": "social",
                "display_name": "GitHub",
                "display_name_i18n_key": "auth.providers.github",
            },
        )


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
    @patch("apps.users.auth.providers.base.requests.get")
    @patch("apps.users.auth.providers.base.requests.post")
    def test_exchange_code_success(self, mock_post, mock_get):
        token_resp = MagicMock(status_code=200)
        token_resp.json.return_value = {"access_token": "token-123"}
        userinfo_resp = MagicMock(status_code=200)
        userinfo_resp.json.return_value = {
            "username": "nycu-user",
            "email": "nycu@example.com",
            "sub": "oauth-sub-1",
            "avatar_url": "https://id.nycu.edu.tw/avatar.png",
        }
        mock_post.return_value = token_resp
        mock_get.return_value = userinfo_resp

        data = NYCUOAuthService.exchange_code("code-123", "http://localhost/callback")

        self.assertEqual(data["access_token"], "token-123")
        self.assertEqual(data["user_info"]["username"], "nycu-user")
        self.assertEqual(data["user_info"]["oauth_id"], "oauth-sub-1")
        self.assertEqual(data["user_info"]["avatar_url"], "https://id.nycu.edu.tw/avatar.png")

    @override_settings(
        NYCU_OAUTH_TOKEN_URL="https://oauth.example.com/token",
        NYCU_OAUTH_CLIENT_ID="client-id",
        NYCU_OAUTH_CLIENT_SECRET="client-secret",
        NYCU_OAUTH_USERINFO_URL="https://oauth.example.com/userinfo",
    )
    @patch("apps.users.auth.providers.base.requests.post")
    def test_exchange_code_raises_on_token_exchange_failure(self, mock_post):
        mock_post.return_value = MagicMock(status_code=500)
        with self.assertRaisesMessage(Exception, "Failed to exchange authorization code"):
            NYCUOAuthService.exchange_code("bad-code", "http://localhost/callback")

    def test_account_linking_updates_existing_oauth_user_without_overwriting_username(self):
        existing = User.objects.create_user(
            username="legacy-name",
            email="nycu@example.com",
            password="password123",
            auth_provider="nycu",
            email_verified=False,
        )
        result = link_oauth_user(
            NYCUOAuthService,
            {
                "username": "new-name",
                "email": "nycu@example.com",
            },
        )
        existing.refresh_from_db()

        self.assertEqual(result.id, existing.id)
        self.assertEqual(existing.username, "legacy-name")
        self.assertTrue(existing.email_verified)

    def test_account_linking_creates_new_user_with_unique_username(self):
        User.objects.create_user(
            username="taken-name",
            email="other@example.com",
            password="password123",
            auth_provider="email",
        )
        user = link_oauth_user(
            NYCUOAuthService,
            {
                "username": "taken-name",
                "email": "new-nycu@example.com",
            },
        )
        self.assertNotEqual(user.username, "taken-name")
        self.assertTrue(user.username.startswith("taken-name"))
        self.assertEqual(user.auth_provider, "nycu")
        self.assertTrue(user.email_verified)


class AccountLinkingTests(TestCase):
    """Test that same-email users are auto-merged across providers."""

    def test_oauth_login_records_each_external_identity_link(self):
        """A user can keep multiple provider identities linked by email."""
        from apps.users import models as user_models

        self.assertTrue(
            hasattr(user_models, "ExternalIdentity"),
            "ExternalIdentity model is required for multi-provider account links",
        )
        ExternalIdentity = user_models.ExternalIdentity

        existing = User.objects.create_user(
            username="multi-provider-user",
            email="multi-provider@example.com",
            password="password123",
            auth_provider="email",
            email_verified=False,
        )

        nycu_user = link_oauth_user(
            NYCUOAuthService,
            {
                "username": "nycu-name",
                "email": "multi-provider@example.com",
                "oauth_id": "nycu-sub-1",
            },
        )
        github_user = link_oauth_user(
            GitHubOAuthService,
            {
                "username": "gh-name",
                "email": "multi-provider@example.com",
                "oauth_id": "12345",
            },
        )

        self.assertEqual(nycu_user.id, existing.id)
        self.assertEqual(github_user.id, existing.id)
        self.assertEqual(
            set(
                ExternalIdentity.objects.filter(user=existing).values_list(
                    "provider_key",
                    "subject",
                )
            ),
            {
                ("nycu", "nycu-sub-1"),
                ("github", "12345"),
            },
        )

    def test_email_user_merged_on_oauth_login(self):
        """An existing email user logging in via NYCU OAuth gets merged."""
        existing = User.objects.create_user(
            username="email-user",
            email="shared@example.com",
            password="password123",
            auth_provider="email",
            email_verified=False,
        )
        result = link_oauth_user(
            NYCUOAuthService,
            {"username": "nycu-name", "email": "shared@example.com"},
        )
        existing.refresh_from_db()

        self.assertEqual(result.id, existing.id)
        self.assertEqual(existing.auth_provider, "nycu")
        self.assertEqual(existing.username, "email-user")
        self.assertTrue(existing.email_verified)

    def test_nycu_user_merged_on_github_login(self):
        """An existing NYCU user logging in via GitHub gets merged."""
        existing = User.objects.create_user(
            username="nycu-user",
            email="shared@example.com",
            password="password123",
            auth_provider="nycu",
        )
        result = link_oauth_user(
            GitHubOAuthService,
            {"username": "gh-user", "email": "shared@example.com", "oauth_id": "12345"},
        )
        existing.refresh_from_db()

        self.assertEqual(result.id, existing.id)
        self.assertEqual(existing.auth_provider, "github")
        self.assertEqual(existing.oauth_id, "12345")
        self.assertEqual(existing.username, "nycu-user")

    def test_github_user_merged_on_google_login(self):
        """An existing GitHub user logging in via Google gets merged."""
        existing = User.objects.create_user(
            username="gh-user",
            email="shared@example.com",
            password="password123",
            auth_provider="github",
        )
        result = link_oauth_user(
            GoogleOAuthService,
            {"username": "Google Name", "email": "shared@example.com", "oauth_id": "google-sub"},
        )
        existing.refresh_from_db()

        self.assertEqual(result.id, existing.id)
        self.assertEqual(existing.auth_provider, "google")
        self.assertEqual(existing.username, "gh-user")

    def test_manual_avatar_is_not_overwritten_by_oauth(self):
        existing = User.objects.create_user(
            username="manual-avatar-user",
            email="avatar-shared@example.com",
            password="password123",
            auth_provider="email",
        )
        existing.profile.avatar_url = "https://manual.example.com/avatar.png"
        existing.profile.avatar_source = "manual"
        existing.profile.save(update_fields=["avatar_url", "avatar_source", "updated_at"])

        result = link_oauth_user(
            GitHubOAuthService,
            {
                "username": "gh-user",
                "email": "avatar-shared@example.com",
                "oauth_id": "12345",
                "avatar_url": "https://avatars.githubusercontent.com/u/12345",
            },
        )
        self.assertEqual(result.id, existing.id)
        existing.profile.refresh_from_db()
        self.assertEqual(existing.profile.avatar_source, "manual")
        self.assertEqual(existing.profile.avatar_url, "https://manual.example.com/avatar.png")

    def test_oauth_avatar_updates_when_not_manual(self):
        existing = User.objects.create_user(
            username="oauth-avatar-user",
            email="oauth-avatar@example.com",
            password="password123",
            auth_provider="email",
        )
        existing.profile.avatar_url = "https://old.example.com/avatar.png"
        existing.profile.avatar_source = "oauth"
        existing.profile.save(update_fields=["avatar_url", "avatar_source", "updated_at"])

        result = link_oauth_user(
            GoogleOAuthService,
            {
                "username": "Google User",
                "email": "oauth-avatar@example.com",
                "oauth_id": "google-sub",
                "avatar_url": "https://lh3.googleusercontent.com/new-avatar",
            },
        )
        self.assertEqual(result.id, existing.id)
        existing.profile.refresh_from_db()
        self.assertEqual(existing.profile.avatar_source, "oauth")
        self.assertEqual(
            existing.profile.avatar_url,
            "https://lh3.googleusercontent.com/new-avatar",
        )

    def test_oauth_avatar_updates_when_manual_source_but_empty(self):
        existing = User.objects.create_user(
            username="manual-empty-avatar-user",
            email="manual-empty@example.com",
            password="password123",
            auth_provider="email",
        )
        existing.profile.avatar_url = ""
        existing.profile.avatar_source = "manual"
        existing.profile.save(update_fields=["avatar_url", "avatar_source", "updated_at"])

        result = link_oauth_user(
            GoogleOAuthService,
            {
                "username": "Google User",
                "email": "manual-empty@example.com",
                "oauth_id": "google-sub-empty",
                "avatar_url": "https://lh3.googleusercontent.com/from-oauth",
            },
        )
        self.assertEqual(result.id, existing.id)
        existing.profile.refresh_from_db()
        self.assertEqual(existing.profile.avatar_source, "oauth")
        self.assertEqual(existing.profile.avatar_url, "https://lh3.googleusercontent.com/from-oauth")


class OAuthProviderRegistryTests(TestCase):
    def test_get_oauth_service_returns_known_providers(self):
        self.assertIs(get_oauth_service("nycu"), NYCUOAuthService)
        self.assertIs(get_oauth_service("github"), GitHubOAuthService)
        self.assertIs(get_oauth_service("google"), GoogleOAuthService)

    def test_get_oauth_service_returns_none_for_unknown(self):
        self.assertIsNone(get_oauth_service("facebook"))
        self.assertIsNone(get_oauth_service(""))


class GitHubOAuthServiceTests(TestCase):
    @override_settings(
        GITHUB_OAUTH_CLIENT_ID="gh-client-id",
        GITHUB_OAUTH_AUTHORIZE_URL="https://github.com/login/oauth/authorize",
    )
    def test_get_authorization_url(self):
        url = GitHubOAuthService.get_authorization_url(
            "http://localhost/callback", "state-gh"
        )
        self.assertIn("https://github.com/login/oauth/authorize?", url)
        self.assertIn("client_id=gh-client-id", url)
        self.assertIn("state=state-gh", url)
        self.assertIn("scope=read", url)

    @override_settings(
        GITHUB_OAUTH_TOKEN_URL="https://github.com/login/oauth/access_token",
        GITHUB_OAUTH_CLIENT_ID="gh-client-id",
        GITHUB_OAUTH_CLIENT_SECRET="gh-secret",
        GITHUB_OAUTH_USERINFO_URL="https://api.github.com/user",
        GITHUB_OAUTH_USER_EMAILS_URL="https://api.github.com/user/emails",
    )
    @patch("apps.users.auth.providers.base.requests.get")
    @patch("apps.users.auth.providers.base.requests.post")
    def test_exchange_code_fetches_private_email(self, mock_post, mock_get):
        token_resp = MagicMock(status_code=200)
        token_resp.json.return_value = {"access_token": "gh-token"}
        mock_post.return_value = token_resp

        # First GET = /user (no email), second GET = /user/emails
        userinfo_resp = MagicMock(status_code=200)
        userinfo_resp.json.return_value = {
            "login": "octocat",
            "id": 1,
            "email": None,
            "avatar_url": "https://avatars.githubusercontent.com/u/1",
        }
        emails_resp = MagicMock(status_code=200)
        emails_resp.json.return_value = [
            {"email": "secondary@example.com", "primary": False, "verified": True},
            {"email": "octocat@github.com", "primary": True, "verified": True},
        ]
        mock_get.side_effect = [userinfo_resp, emails_resp]

        data = GitHubOAuthService.exchange_code("gh-code", "http://localhost/callback")

        self.assertEqual(data["user_info"]["username"], "octocat")
        self.assertEqual(data["user_info"]["email"], "octocat@github.com")
        self.assertEqual(data["user_info"]["oauth_id"], "1")
        self.assertEqual(data["user_info"]["avatar_url"], "https://avatars.githubusercontent.com/u/1")


class GoogleOAuthServiceTests(TestCase):
    @staticmethod
    def _make_jwt(payload: dict) -> str:
        header = {"alg": "none", "typ": "JWT"}
        h = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
        p = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        return f"{h}.{p}."

    @override_settings(
        GOOGLE_OAUTH_CLIENT_ID="google-client-id",
        GOOGLE_OAUTH_AUTHORIZE_URL="https://accounts.google.com/o/oauth2/v2/auth",
    )
    def test_get_authorization_url(self):
        url = GoogleOAuthService.get_authorization_url(
            "http://localhost/callback", "state-g"
        )
        self.assertIn("https://accounts.google.com/o/oauth2/v2/auth?", url)
        self.assertIn("client_id=google-client-id", url)
        self.assertIn("scope=openid", url)

    @override_settings(
        GOOGLE_OAUTH_TOKEN_URL="https://oauth2.googleapis.com/token",
        GOOGLE_OAUTH_CLIENT_ID="google-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="google-secret",
        GOOGLE_OAUTH_USERINFO_URL="https://www.googleapis.com/oauth2/v3/userinfo",
    )
    @patch("apps.users.auth.providers.base.requests.get")
    @patch("apps.users.auth.providers.base.requests.post")
    def test_exchange_code_success(self, mock_post, mock_get):
        token_resp = MagicMock(status_code=200)
        token_resp.json.return_value = {"access_token": "google-token"}
        mock_post.return_value = token_resp

        userinfo_resp = MagicMock(status_code=200)
        userinfo_resp.json.return_value = {
            "sub": "google-sub-123",
            "email": "user@gmail.com",
            "name": "Test User",
            "picture": "https://lh3.googleusercontent.com/avatar",
        }
        mock_get.return_value = userinfo_resp

        data = GoogleOAuthService.exchange_code("g-code", "http://localhost/callback")

        self.assertEqual(data["user_info"]["username"], "Test User")
        self.assertEqual(data["user_info"]["email"], "user@gmail.com")
        self.assertEqual(data["user_info"]["oauth_id"], "google-sub-123")
        self.assertEqual(
            data["user_info"]["avatar_url"],
            "https://lh3.googleusercontent.com/avatar",
        )

    @override_settings(
        GOOGLE_OAUTH_TOKEN_URL="https://oauth2.googleapis.com/token",
        GOOGLE_OAUTH_CLIENT_ID="google-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="google-secret",
        GOOGLE_OAUTH_USERINFO_URL="https://www.googleapis.com/oauth2/v3/userinfo",
    )
    @patch("apps.users.auth.providers.base.requests.get")
    @patch("apps.users.auth.providers.base.requests.post")
    def test_exchange_code_falls_back_to_id_token_picture(self, mock_post, mock_get):
        id_token = self._make_jwt(
            {
                "sub": "google-sub-xyz",
                "email": "fallback@gmail.com",
                "name": "Fallback User",
                "picture": "https://lh3.googleusercontent.com/fallback-avatar",
            }
        )
        token_resp = MagicMock(status_code=200)
        token_resp.json.return_value = {
            "access_token": "google-token",
            "id_token": id_token,
        }
        mock_post.return_value = token_resp

        # userinfo without picture/name; should be filled from id_token claims.
        userinfo_resp = MagicMock(status_code=200)
        userinfo_resp.json.return_value = {
            "sub": "google-sub-xyz",
            "email": "fallback@gmail.com",
        }
        mock_get.return_value = userinfo_resp

        data = GoogleOAuthService.exchange_code("g-code", "http://localhost/callback")

        self.assertEqual(data["user_info"]["oauth_id"], "google-sub-xyz")
        self.assertEqual(data["user_info"]["email"], "fallback@gmail.com")
        self.assertEqual(data["user_info"]["username"], "fallback")
        self.assertEqual(
            data["user_info"]["avatar_url"],
            "https://lh3.googleusercontent.com/fallback-avatar",
        )

    @override_settings(
        GOOGLE_OAUTH_TOKEN_URL="https://oauth2.googleapis.com/token",
        GOOGLE_OAUTH_CLIENT_ID="google-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="google-secret",
        GOOGLE_OAUTH_USERINFO_URL="https://www.googleapis.com/oauth2/v3/userinfo",
    )
    @patch("apps.users.auth.providers.base.requests.get")
    @patch("apps.users.auth.providers.base.requests.post")
    def test_exchange_code_falls_back_to_tokeninfo_picture(self, mock_post, mock_get):
        id_token = self._make_jwt(
            {
                "sub": "google-sub-tokeninfo",
                "email": "tokeninfo@gmail.com",
            }
        )
        token_resp = MagicMock(status_code=200)
        token_resp.json.return_value = {
            "access_token": "google-token",
            "id_token": id_token,
        }
        mock_post.return_value = token_resp

        userinfo_resp = MagicMock(status_code=200)
        userinfo_resp.json.return_value = {
            "sub": "google-sub-tokeninfo",
            "email": "tokeninfo@gmail.com",
        }
        tokeninfo_resp = MagicMock(status_code=200)
        tokeninfo_resp.json.return_value = {
            "sub": "google-sub-tokeninfo",
            "email": "tokeninfo@gmail.com",
            "name": "Tokeninfo User",
            "picture": "https://lh3.googleusercontent.com/tokeninfo-avatar",
        }
        mock_get.side_effect = [userinfo_resp, tokeninfo_resp]

        data = GoogleOAuthService.exchange_code("g-code", "http://localhost/callback")

        self.assertEqual(data["user_info"]["oauth_id"], "google-sub-tokeninfo")
        self.assertEqual(data["user_info"]["email"], "tokeninfo@gmail.com")
        self.assertEqual(data["user_info"]["username"], "tokeninfo")
        self.assertEqual(
            data["user_info"]["avatar_url"],
            "https://lh3.googleusercontent.com/tokeninfo-avatar",
        )
