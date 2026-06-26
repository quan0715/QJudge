"""External provider account persistence for QAuth linking."""

from __future__ import annotations

from django.utils import timezone

from ..models import ExternalIdentity
from .contracts import NormalizedQAuthIdentity


def find_user_id_by_external_identity(identity: NormalizedQAuthIdentity) -> int | None:
    if not identity.provider_subject:
        return None

    external_identity = (
        ExternalIdentity.objects.filter(
            provider_key=identity.provider_key,
            subject=identity.provider_subject,
        )
        .only("user_id")
        .first()
    )
    return external_identity.user_id if external_identity else None


def upsert_external_identity(
    user_id: int,
    identity: NormalizedQAuthIdentity,
) -> ExternalIdentity | None:
    if not identity.provider_subject:
        return None

    external_identity, _ = ExternalIdentity.objects.update_or_create(
        provider_key=identity.provider_key,
        subject=identity.provider_subject,
        defaults={
            "user_id": user_id,
            "email": identity.email or "",
            "email_verified": True,
            "profile_snapshot": identity.raw_profile,
            "last_login_at": timezone.now(),
        },
    )
    return external_identity
