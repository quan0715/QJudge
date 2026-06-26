"""Google OAuth provider."""

import logging

import requests

from .base import BaseOAuthService
from .profile import (
    decode_jwt_payload_without_verify,
    extract_avatar_url,
    merge_missing_profile_fields,
)

logger = logging.getLogger(__name__)


class GoogleOAuthService(BaseOAuthService):
    provider_key = "google"
    authorize_url_setting = "GOOGLE_OAUTH_AUTHORIZE_URL"
    token_url_setting = "GOOGLE_OAUTH_TOKEN_URL"
    userinfo_url_setting = "GOOGLE_OAUTH_USERINFO_URL"
    client_id_setting = "GOOGLE_OAUTH_CLIENT_ID"
    client_secret_setting = "GOOGLE_OAUTH_CLIENT_SECRET"
    default_scope = "openid email profile"

    @classmethod
    def exchange_code(cls, code: str, redirect_uri: str) -> dict:
        """Exchange code and merge profile hints from id_token when needed."""
        token_data = cls._exchange_token_payload(code, redirect_uri)
        access_token = token_data["access_token"]
        user_info = cls._fetch_user_info(access_token)

        id_token = str(token_data.get("id_token", ""))
        id_token_claims = decode_jwt_payload_without_verify(str(token_data.get("id_token", "")))
        logger.info(
            "google oauth token received has_id_token=%s userinfo_keys=%s id_token_claim_keys=%s",
            bool(token_data.get("id_token")),
            sorted(list(user_info.keys())),
            sorted(list(id_token_claims.keys())),
        )

        merge_missing_profile_fields(user_info, id_token_claims)
        if not user_info.get("avatar_url") and id_token:
            merge_missing_profile_fields(user_info, cls._fetch_tokeninfo_profile(id_token))
        if not user_info.get("avatar_url"):
            merge_missing_profile_fields(user_info, cls._fetch_openid_userinfo_profile(access_token))

        logger.info(
            "google oauth final profile has_avatar=%s has_email=%s has_sub=%s",
            bool(user_info.get("avatar_url")),
            bool(user_info.get("email")),
            bool(user_info.get("oauth_id")),
        )

        return {
            "access_token": access_token,
            "user_info": user_info,
        }

    @classmethod
    def _fetch_tokeninfo_profile(cls, id_token: str) -> dict:
        try:
            resp = requests.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_token},
                timeout=(5, 15),
            )
        except requests.RequestException:
            logger.warning("google oauth tokeninfo fetch failed")
            return {}

        raw = resp.json() if resp.status_code == 200 else {}
        logger.info(
            "google oauth tokeninfo status=%s has_avatar=%s keys=%s",
            resp.status_code,
            bool(extract_avatar_url(raw)),
            sorted(list(raw.keys())),
        )
        return raw

    @classmethod
    def _fetch_openid_userinfo_profile(cls, access_token: str) -> dict:
        try:
            resp = requests.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=(5, 15),
            )
        except requests.RequestException:
            logger.warning("google oauth alt_userinfo fetch failed")
            return {}

        raw = resp.json() if resp.status_code == 200 else {}
        logger.info(
            "google oauth alt_userinfo status=%s has_avatar=%s keys=%s",
            resp.status_code,
            bool(extract_avatar_url(raw)),
            sorted(list(raw.keys())),
        )
        return raw

    @classmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        name = raw.get("name") or raw.get("email", "").split("@")[0]
        return {
            "username": name,
            "email": raw.get("email"),
            "oauth_id": raw.get("sub"),
            "avatar_url": extract_avatar_url(raw),
            "email_verified": raw.get("email_verified", True),
        }
