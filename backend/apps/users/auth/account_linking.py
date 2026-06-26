"""QAuth identity to QJudge user projection linking."""

from __future__ import annotations

import logging
from typing import Any

from .contracts import NormalizedQAuthIdentity, ProviderTokenSet
from .external_accounts import find_user_id_by_external_identity, upsert_external_identity
from .user_projection import (
    create_user_for_identity,
    find_or_create_user_by_email,
    find_user_by_id,
    sync_user_projection,
)

logger = logging.getLogger(__name__)


def link_qauth_identity(
    identity: NormalizedQAuthIdentity,
    token_set: ProviderTokenSet | None = None,
) -> Any:
    """Link a normalized QAuth identity to a QJudge user projection."""
    if token_set:
        logger.debug("qauth provider token set received provider=%s", identity.provider_key)

    linked_user_id = find_user_id_by_external_identity(identity)
    if linked_user_id is not None:
        user = find_user_by_id(linked_user_id)
    elif identity.email:
        user = find_or_create_user_by_email(identity)
    else:
        user = create_user_for_identity(identity)

    sync_user_projection(user, identity)
    upsert_external_identity(user.id, identity)
    return user
