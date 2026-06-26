"""NYCU OAuth provider."""

from .base import BaseOAuthService
from .profile import extract_avatar_url


class NYCUOAuthService(BaseOAuthService):
    provider_key = "nycu"
    provider_name = "nycu-oauth"
    authorize_url_setting = "NYCU_OAUTH_AUTHORIZE_URL"
    token_url_setting = "NYCU_OAUTH_TOKEN_URL"
    userinfo_url_setting = "NYCU_OAUTH_USERINFO_URL"
    client_id_setting = "NYCU_OAUTH_CLIENT_ID"
    client_secret_setting = "NYCU_OAUTH_CLIENT_SECRET"
    default_scope = "profile"

    @classmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        return {
            "username": raw.get("username"),
            "email": raw.get("email"),
            "oauth_id": raw.get("sub") or raw.get("id"),
            "avatar_url": extract_avatar_url(raw),
            "email_verified": raw.get("email_verified", True),
        }
