import json
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest

from apps.users.auth.options import get_auth_options
from apps.users.auth.provider_connections import load_provider_connections, resolve_provider_credentials
from apps.users.auth.providers.base import OAuthProviderConfigurationError
from apps.users.auth.providers.nycu import NYCUOAuthService


def test_get_auth_options_returns_only_configured_registered_provider_metadata(settings, monkeypatch):
    settings.AUTH_EMAIL_PASSWORD_ENABLED = False
    settings.QAUTH_PROVIDER_CONNECTIONS_JSON = json.dumps(
        [
            {
                "key": "nycu",
                "type": "oidc",
                "authorization_url": "https://id.nycu.edu.tw/o/authorize/",
                "token_url": "https://id.nycu.edu.tw/o/token/",
                "userinfo_url": "https://id.nycu.edu.tw/api/profile/",
                "scope": "profile",
                "client_id_env": "NYCU_OAUTH_CLIENT_ID",
                "client_secret_env": "NYCU_OAUTH_CLIENT_SECRET",
            }
        ]
    )
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_ID", "client-id")
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_SECRET", "client-secret")

    options = get_auth_options()

    assert options == {
        "password_enabled": False,
        "providers": [
            {
                "key": "nycu",
                "type": "oidc",
                "category": "campus",
                "display_name": "NYCU 國立陽明交通大學",
                "display_name_i18n_key": "auth.providers.nycu",
                "logo_url": "/illustrations/nycu-logo.png",
            },
        ],
    }


def test_get_auth_options_hides_registered_providers_without_a_connection(settings):
    settings.AUTH_EMAIL_PASSWORD_ENABLED = False
    settings.QAUTH_PROVIDER_CONNECTIONS_JSON = "[]"

    assert get_auth_options() == {
        "password_enabled": False,
        "providers": [],
    }


def test_get_auth_options_exposes_password_as_credentials_provider(settings):
    settings.AUTH_EMAIL_PASSWORD_ENABLED = True

    options = get_auth_options()

    assert options["password_enabled"] is True
    assert options["providers"][0] == {
        "key": "password",
        "type": "credentials",
        "category": "password",
        "display_name": "Password credentials",
        "display_name_i18n_key": "auth.providers.password",
    }


def test_provider_connections_resolve_credentials_from_env_refs(monkeypatch):
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_ID", "client-id")
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_SECRET", "client-secret")
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

    assert nycu.type == "oidc"
    assert nycu.issuer_url == "https://id.nycu.edu.tw"
    assert nycu.claim_mapping["email"] == "email"
    assert resolve_provider_credentials(nycu) == ("client-id", "client-secret")


def test_base_oauth_service_uses_provider_connection_for_authorization_url(settings, monkeypatch):
    settings.QAUTH_PROVIDER_CONNECTIONS_JSON = json.dumps(
        [
            {
                "key": "nycu",
                "type": "oidc",
                "authorization_url": "https://sso.example.edu/oauth/authorize",
                "scope": "openid email profile",
                "client_id_env": "NYCU_OAUTH_CLIENT_ID",
                "client_secret_env": "NYCU_OAUTH_CLIENT_SECRET",
            }
        ]
    )
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_ID", "connection-client-id")
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_SECRET", "connection-client-secret")

    url = NYCUOAuthService.get_authorization_url("https://app.example.edu/callback", "state-123")
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == "https://sso.example.edu/oauth/authorize"
    assert query["client_id"] == ["connection-client-id"]
    assert query["redirect_uri"] == ["https://app.example.edu/callback"]
    assert query["state"] == ["state-123"]
    assert query["scope"] == ["openid email profile"]


def test_base_oauth_service_rejects_credentials_without_a_connection(settings, monkeypatch):
    settings.QAUTH_PROVIDER_CONNECTIONS_JSON = "[]"
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_ID", "legacy-client-id")
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_SECRET", "legacy-client-secret")

    with pytest.raises(OAuthProviderConfigurationError, match="not configured"):
        NYCUOAuthService.get_authorization_url("https://app.example.edu/callback", "state-123")


def test_base_oauth_service_uses_provider_connection_for_token_exchange(settings, monkeypatch):
    settings.QAUTH_PROVIDER_CONNECTIONS_JSON = json.dumps(
        [
            {
                "key": "nycu",
                "type": "oidc",
                "token_url": "https://sso.example.edu/oauth/token",
                "client_id_env": "NYCU_OAUTH_CLIENT_ID",
                "client_secret_env": "NYCU_OAUTH_CLIENT_SECRET",
            }
        ]
    )
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_ID", "connection-client-id")
    monkeypatch.setenv("NYCU_OAUTH_CLIENT_SECRET", "connection-client-secret")

    with patch("apps.users.auth.providers.base.requests.post") as post:
        post.return_value.status_code = 200
        post.return_value.json.return_value = {"access_token": "provider-token"}

        payload = NYCUOAuthService._exchange_token_payload("code-123", "https://app.example.edu/callback")

    assert payload == {"access_token": "provider-token"}
    post.assert_called_once()
    assert post.call_args.args[0] == "https://sso.example.edu/oauth/token"
    assert post.call_args.kwargs["data"]["client_id"] == "connection-client-id"
    assert post.call_args.kwargs["data"]["client_secret"] == "connection-client-secret"
