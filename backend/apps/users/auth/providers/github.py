"""GitHub OAuth provider."""

import logging

import requests

from .base import BaseOAuthService
from .profile import extract_avatar_url

logger = logging.getLogger(__name__)
GITHUB_USER_EMAILS_URL = "https://api.github.com/user/emails"


class GitHubOAuthService(BaseOAuthService):
    provider_key = "github"

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
            "email_verified": False,
        }

    @classmethod
    def _fetch_user_info(cls, access_token: str) -> dict:
        """Use GitHub's verified primary email for account linking."""
        info = super()._fetch_user_info(access_token)
        try:
            resp = requests.get(
                GITHUB_USER_EMAILS_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
                timeout=(5, 15),
            )
            resp.raise_for_status()
            primary = next(
                (email["email"] for email in resp.json()
                 if email.get("primary") and email.get("verified") is True),
                None,
            )
            if primary:
                info["email"] = primary
                info["email_verified"] = True
        except requests.RequestException:
            logger.warning("Failed to fetch GitHub user emails")

        return info
