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
            # NYCU's profile API returns the SSO username, not an OIDC sub.
            "oauth_id": raw.get("sub") or raw.get("id") or raw.get("username"),
            "avatar_url": extract_avatar_url(raw),
            # The profile API omits email_verified; NYCU itself verifies the
            # institutional address, so only an explicit false is unverified.
            "email_verified": raw.get("email_verified", True) is True,
        }
