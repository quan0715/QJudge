"""QJudge User projection persistence for QAuth identities."""

from __future__ import annotations

import logging

from django.core.cache import cache

from ..models import User, UserProfile
from .contracts import NormalizedQAuthIdentity

logger = logging.getLogger(__name__)


def find_user_by_id(user_id: int) -> User:
    return User.objects.get(pk=user_id)


def find_or_create_user_by_email(identity: NormalizedQAuthIdentity) -> User:
    user = User.objects.filter(email=identity.email).first()
    if user is not None:
        return user
    return create_user_for_identity(identity)


def create_user_for_identity(identity: NormalizedQAuthIdentity) -> User:
    username = identity.username or (identity.email or "").split("@")[0] or "user"
    original_username = username
    counter = 1
    while User.objects.filter(username=username).exists():
        username = f"{original_username}{counter}"
        counter += 1

    return User.objects.create(
        username=username,
        email=identity.email or "",
        auth_provider=identity.provider_key,
        email_verified=True,
        is_active=True,
    )


def sync_user_projection(user: User, identity: NormalizedQAuthIdentity) -> User:
    update_fields = ["auth_provider", "email_verified"]
    user.auth_provider = identity.provider_key
    user.email_verified = True
    if identity.provider_subject:
        user.oauth_id = identity.provider_subject
        update_fields.append("oauth_id")
    user.save(update_fields=update_fields)
    _sync_oauth_avatar(user, identity.avatar_url)
    return user


def _sync_oauth_avatar(user: User, avatar_url: str) -> None:
    if not avatar_url:
        logger.info("oauth avatar skip provider=%s reason=no_avatar", user.auth_provider)
        return

    profile, _ = UserProfile.objects.get_or_create(user=user)
    if profile.avatar_source == "manual" and profile.avatar_url:
        logger.info("oauth avatar skip provider=%s reason=manual_locked", user.auth_provider)
        return

    profile.avatar_url = avatar_url
    profile.avatar_source = "oauth"
    profile.save(update_fields=["avatar_url", "avatar_source", "updated_at"])
    cache.delete(f"user_preferences:v1:{user.id}")
    logger.info("oauth avatar synced provider=%s user_id=%s", user.auth_provider, user.id)
