"""Base OAuth provider service and QAuth identity normalization."""

import logging
from abc import ABC, abstractmethod
from urllib.parse import urlencode

import requests

from ..contracts import NormalizedQAuthIdentity, ProviderTokenSet
from ..provider_connections import load_provider_connections, resolve_provider_credentials

logger = logging.getLogger(__name__)


class OAuthProviderConfigurationError(RuntimeError):
    """Raised when a registered OAuth provider has no complete QAuth connection."""


class BaseOAuthService(ABC):
    """Abstract base for OAuth provider services."""

    provider_key: str = ""

    @classmethod
    def get_authorization_url(cls, redirect_uri: str, state: str) -> str:
        client_id, _ = cls._client_credentials()
        params = {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": cls._scope(),
        }
        base = cls._provider_url("authorization_url")
        return f"{base}?{urlencode(params)}"

    @classmethod
    def exchange_code(cls, code: str, redirect_uri: str) -> dict:
        """Exchange authorization code into access token and normalized user info."""
        access_token = cls._exchange_token(code, redirect_uri)
        user_info = cls._fetch_user_info(access_token)
        return {
            "access_token": access_token,
            "user_info": user_info,
        }

    @classmethod
    def normalize_identity(cls, oauth_data: dict) -> NormalizedQAuthIdentity:
        """Convert provider callback data into a QAuth identity contract."""
        user_info = oauth_data["user_info"]
        oauth_id = str(user_info.get("oauth_id") or "").strip()
        oauth_avatar_url = user_info.get("avatar_url") or cls._default_avatar_url(user_info)
        logger.info(
            "oauth profile sync provider=%s has_avatar=%s",
            cls.provider_key,
            bool(oauth_avatar_url),
        )

        return NormalizedQAuthIdentity(
            provider_key=cls.provider_key,
            provider_subject=oauth_id,
            email=user_info.get("email"),
            username=user_info.get("username") or "",
            display_name=user_info.get("name") or user_info.get("username") or "",
            avatar_url=oauth_avatar_url,
            raw_profile=user_info,
        )

    @classmethod
    def provider_token_set(cls, oauth_data: dict) -> ProviderTokenSet:
        """Return transient provider tokens from callback data."""
        return ProviderTokenSet(access_token=oauth_data.get("access_token", ""))

    @classmethod
    def _default_avatar_url(cls, user_info: dict) -> str:
        return ""

    @classmethod
    def _exchange_token(cls, code: str, redirect_uri: str) -> str:
        return cls._exchange_token_payload(code, redirect_uri)["access_token"]

    @classmethod
    def _exchange_token_payload(cls, code: str, redirect_uri: str) -> dict:
        client_id, client_secret = cls._client_credentials()
        try:
            resp = requests.post(
                cls._provider_url("token_url"),
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
                headers={"Accept": "application/json"},
                timeout=(5, 15),
            )
        except requests.RequestException as exc:
            raise Exception("Failed to connect to OAuth token endpoint") from exc

        if resp.status_code != 200:
            raise Exception("Failed to exchange authorization code")

        token_data = resp.json()
        if not token_data.get("access_token"):
            raise Exception("Failed to exchange authorization code")
        return token_data

    @classmethod
    def _fetch_user_info(cls, access_token: str) -> dict:
        try:
            resp = requests.get(
                cls._provider_url("userinfo_url"),
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=(5, 15),
            )
        except requests.RequestException as exc:
            raise Exception("Failed to connect to OAuth userinfo endpoint") from exc

        if resp.status_code != 200:
            raise Exception("Failed to get user information")

        return cls._parse_user_info(resp.json())

    @classmethod
    @abstractmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        """Return normalized user info with username, email, oauth_id, avatar_url."""
        ...

    @classmethod
    def _provider_connection(cls):
        connection = load_provider_connections().get(cls.provider_key)
        if connection is None:
            raise OAuthProviderConfigurationError(
                f"OAuth provider {cls.provider_key!r} is not configured",
            )
        return connection

    @classmethod
    def _provider_url(cls, connection_attr: str) -> str:
        value = getattr(cls._provider_connection(), connection_attr, "")
        if not value:
            raise OAuthProviderConfigurationError(
                f"OAuth provider {cls.provider_key!r} requires {connection_attr}",
            )
        return value

    @classmethod
    def _client_credentials(cls) -> tuple[str, str]:
        connection = cls._provider_connection()
        client_id, client_secret = resolve_provider_credentials(connection)
        if not client_id or not client_secret:
            raise OAuthProviderConfigurationError(
                f"OAuth provider {cls.provider_key!r} requires client credentials",
            )
        return client_id, client_secret

    @classmethod
    def _scope(cls) -> str:
        scope = cls._provider_connection().scope
        if not scope:
            raise OAuthProviderConfigurationError(
                f"OAuth provider {cls.provider_key!r} requires scope",
            )
        return scope

    @classmethod
    def is_configured(cls) -> bool:
        """Return whether this provider can complete a server-side OAuth flow."""
        try:
            cls._provider_url("authorization_url")
            cls._provider_url("token_url")
            cls._provider_url("userinfo_url")
            cls._client_credentials()
            cls._scope()
        except OAuthProviderConfigurationError:
            return False
        return True
