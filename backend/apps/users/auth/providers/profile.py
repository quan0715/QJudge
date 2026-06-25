"""Shared helpers for normalizing OAuth/OIDC profile payloads."""

import base64
import json
from collections.abc import Iterable


def extract_avatar_url(raw: dict) -> str:
    """Extract avatar URL from common provider payload variants."""
    candidates = [
        raw.get("avatar_url"),
        raw.get("avatarUrl"),
        raw.get("picture"),
        raw.get("photo"),
        raw.get("photo_url"),
        raw.get("photoUrl"),
        raw.get("image_url"),
        raw.get("imageUrl"),
    ]

    for key in ("image", "picture"):
        image_obj = raw.get(key)
        if isinstance(image_obj, dict):
            candidates.extend([image_obj.get("url"), image_obj.get("href")])

    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return ""


def decode_jwt_payload_without_verify(token: str) -> dict:
    """Decode JWT payload without signature verification for profile hints only."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return {}
        padding = "=" * (-len(parts[1]) % 4)
        decoded = base64.urlsafe_b64decode(parts[1] + padding)
        parsed = json.loads(decoded.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def merge_missing_profile_fields(profile: dict, *fallbacks: dict) -> dict:
    """Fill missing normalized profile fields from provider fallback payloads."""
    for raw in _valid_fallbacks(fallbacks):
        email = raw.get("email")
        if not profile.get("email") and email:
            profile["email"] = email
        if not profile.get("oauth_id"):
            profile["oauth_id"] = raw.get("sub") or raw.get("id") or profile.get("oauth_id", "")
        if not profile.get("username"):
            profile["username"] = (
                raw.get("name")
                or raw.get("preferred_username")
                or raw.get("username")
                or _email_local_part(profile.get("email") or email)
            )
        if not profile.get("avatar_url"):
            profile["avatar_url"] = extract_avatar_url(raw) or profile.get("avatar_url", "")
        if "email_verified" not in profile and "email_verified" in raw:
            profile["email_verified"] = bool(raw.get("email_verified"))
    return profile


def _valid_fallbacks(fallbacks: Iterable[dict]) -> Iterable[dict]:
    for raw in fallbacks:
        if isinstance(raw, dict) and raw:
            yield raw


def _email_local_part(email: str | None) -> str:
    return (email or "").split("@")[0]
