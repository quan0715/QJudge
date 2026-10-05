"""QAuth identity to QJudge user projection linking."""

from __future__ import annotations

from typing import Any

from .contracts import NormalizedQAuthIdentity
from .external_accounts import find_user_id_by_external_identity, upsert_external_identity
from .user_projection import (
    find_or_create_user_by_email,
    find_user_by_id,
    sync_user_projection,
)


def link_qauth_identity(identity: NormalizedQAuthIdentity) -> Any:
    """Link a normalized QAuth identity to a QJudge user projection."""
    if not identity.provider_subject:
        raise ValueError("OAuth provider did not supply a subject")

    linked_user_id = find_user_id_by_external_identity(identity)
    if linked_user_id is not None:
        user = find_user_by_id(linked_user_id)
    elif identity.email and identity.email_verified:
        user = find_or_create_user_by_email(identity)
    else:
        raise ValueError("A verified email is required to create or link an account")

    sync_user_projection(user, identity)
    upsert_external_identity(user.id, identity)
    return user
