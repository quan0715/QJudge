"""GitHub OAuth provider."""

import logging

import requests
from django.conf import settings

from .base import BaseOAuthService
from .profile import extract_avatar_url

logger = logging.getLogger(__name__)


class GitHubOAuthService(BaseOAuthService):
    provider_name = "github"
    authorize_url_setting = "GITHUB_OAUTH_AUTHORIZE_URL"
    token_url_setting = "GITHUB_OAUTH_TOKEN_URL"
    userinfo_url_setting = "GITHUB_OAUTH_USERINFO_URL"
    client_id_setting = "GITHUB_OAUTH_CLIENT_ID"
    client_secret_setting = "GITHUB_OAUTH_CLIENT_SECRET"
    default_scope = "read:user user:email"

    @classmethod
    def _default_avatar_url(cls, user_info: dict) -> str:
        oauth_id = str(user_info.get("oauth_id") or "").strip()
        return f"https://avatars.githubusercontent.com/u/{oauth_id}" if oauth_id else ""

    @classmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        return {
            "username": raw.get("login"),
            "email": raw.get("email"),
            "oauth_id": str(raw.get("id", "")),
            "avatar_url": extract_avatar_url(raw),
            "email_verified": raw.get("email_verified", True),
        }

    @classmethod
    def _fetch_user_info(cls, access_token: str) -> dict:
        """Also fetch private email from GitHub /user/emails when needed."""
        info = super()._fetch_user_info(access_token)

        if not info.get("email"):
            try:
                resp = requests.get(
                    getattr(
                        settings,
                        "GITHUB_OAUTH_USER_EMAILS_URL",
                        "https://api.github.com/user/emails",
                    ),
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json",
                    },
                    timeout=(5, 15),
                )
                if resp.status_code == 200:
                    emails = resp.json()
                    primary = next(
                        (
                            email["email"]
                            for email in emails
                            if email.get("primary") and email.get("verified")
                        ),
                        None,
                    )
                    if primary:
                        info["email"] = primary
                        info["email_verified"] = True
            except requests.RequestException:
                logger.warning("Failed to fetch GitHub user emails")

        return info
