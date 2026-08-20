"""NYCU OAuth provider."""

from .base import BaseOAuthService
from .profile import extract_avatar_url


class NYCUOAuthService(BaseOAuthService):
    provider_key = "nycu"

    @classmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        return {
            "username": raw.get("username"),
            "email": raw.get("email"),
            "oauth_id": raw.get("sub") or raw.get("id"),
            "avatar_url": extract_avatar_url(raw),
            "email_verified": raw.get("email_verified", True),
        }
