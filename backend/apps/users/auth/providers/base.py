"""Base OAuth provider service and shared profile-linking logic."""

import logging
from abc import ABC, abstractmethod
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from ...models import ExternalIdentity, User

logger = logging.getLogger(__name__)


class BaseOAuthService(ABC):
    """Abstract base for OAuth provider services."""

    provider_name: str = ""
    authorize_url_setting: str = ""
    token_url_setting: str = ""
    userinfo_url_setting: str = ""
    client_id_setting: str = ""
    client_secret_setting: str = ""
    default_scope: str = ""

    @classmethod
    def get_authorization_url(cls, redirect_uri: str, state: str) -> str:
        params = {
            "client_id": getattr(settings, cls.client_id_setting),
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": cls.default_scope,
        }
        base = getattr(settings, cls.authorize_url_setting)
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
    def get_or_create_user(cls, oauth_data: dict) -> User:
        """Find a linked identity or same-email user, then upsert the provider link."""
        user_info = oauth_data["user_info"]
        email = user_info.get("email")
        username = user_info.get("username") or ""
        oauth_id = str(user_info.get("oauth_id") or "").strip()
        oauth_avatar_url = user_info.get("avatar_url") or cls._default_avatar_url(user_info)
        logger.info(
            "oauth profile sync provider=%s has_avatar=%s",
            cls.provider_name,
            bool(oauth_avatar_url),
        )

        linked_user = cls._find_user_by_external_identity(oauth_id)
        if linked_user is not None:
            user = linked_user
        else:
            user = cls._find_or_create_user_by_email(email, username)

        cls._sync_latest_provider_fields(user, oauth_id)
        cls._sync_oauth_avatar(user, oauth_avatar_url)
        cls._upsert_external_identity(user, user_info)
        return user

    @classmethod
    def _find_user_by_external_identity(cls, oauth_id: str) -> User | None:
        if not oauth_id:
            return None
        identity = (
            ExternalIdentity.objects.select_related("user")
            .filter(provider_key=cls.provider_name, subject=oauth_id)
            .first()
        )
        return identity.user if identity else None

    @classmethod
    def _find_or_create_user_by_email(cls, email: str | None, username: str) -> User:
        if email:
            try:
                return User.objects.get(email=email)
            except User.DoesNotExist:
                pass

        if not username:
            username = (email or "").split("@")[0] or "user"
        counter = 1
        original_username = username
        while User.objects.filter(username=username).exists():
            username = f"{original_username}{counter}"
            counter += 1

        return User.objects.create(
            username=username,
            email=email,
            auth_provider=cls.provider_name,
            email_verified=True,
            is_active=True,
        )

    @classmethod
    def _default_avatar_url(cls, user_info: dict) -> str:
        return ""

    @classmethod
    def _sync_latest_provider_fields(cls, user: User, oauth_id: str) -> None:
        update_fields = ["auth_provider", "email_verified"]
        user.auth_provider = cls.provider_name
        user.email_verified = True
        if oauth_id:
            user.oauth_id = oauth_id
            update_fields.append("oauth_id")
        user.save(update_fields=update_fields)

    @classmethod
    def _sync_oauth_avatar(cls, target_user: User, oauth_avatar_url: str) -> None:
        if not oauth_avatar_url:
            logger.info("oauth avatar skip provider=%s reason=no_avatar", cls.provider_name)
            return
        from ...models import UserProfile

        profile, _ = UserProfile.objects.get_or_create(user=target_user)
        if profile.avatar_source == "manual" and profile.avatar_url:
            logger.info("oauth avatar skip provider=%s reason=manual_locked", cls.provider_name)
            return
        profile.avatar_url = oauth_avatar_url
        profile.avatar_source = "oauth"
        profile.save(update_fields=["avatar_url", "avatar_source", "updated_at"])
        cache.delete(f"user_preferences:v1:{target_user.id}")
        logger.info("oauth avatar synced provider=%s user_id=%s", cls.provider_name, target_user.id)

    @classmethod
    def _upsert_external_identity(cls, user: User, user_info: dict) -> ExternalIdentity | None:
        subject = str(user_info.get("oauth_id") or "").strip()
        if not subject:
            return None

        email = str(user_info.get("email") or "")
        email_verified = bool(user_info.get("email_verified", True))
        defaults = {
            "user": user,
            "email": email,
            "email_verified": email_verified,
            "profile_snapshot": user_info,
            "last_login_at": timezone.now(),
        }
        identity, created = ExternalIdentity.objects.get_or_create(
            provider_key=cls.provider_name,
            subject=subject,
            defaults=defaults,
        )
        if created:
            return identity

        identity.user = user
        identity.email = email
        identity.email_verified = email_verified
        identity.profile_snapshot = user_info
        identity.last_login_at = timezone.now()
        identity.save(
            update_fields=[
                "user",
                "email",
                "email_verified",
                "profile_snapshot",
                "last_login_at",
                "updated_at",
            ]
        )
        return identity

    @classmethod
    def _exchange_token(cls, code: str, redirect_uri: str) -> str:
        return cls._exchange_token_payload(code, redirect_uri)["access_token"]

    @classmethod
    def _exchange_token_payload(cls, code: str, redirect_uri: str) -> dict:
        try:
            resp = requests.post(
                getattr(settings, cls.token_url_setting),
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": getattr(settings, cls.client_id_setting),
                    "client_secret": getattr(settings, cls.client_secret_setting),
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
                getattr(settings, cls.userinfo_url_setting),
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
