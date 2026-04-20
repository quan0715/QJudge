"""Django signals for the AI app."""
from __future__ import annotations

import logging

from django.db.models.signals import pre_delete
from django.dispatch import receiver

from .models import AIArtifact
from .services import artifact_storage

logger = logging.getLogger(__name__)


@receiver(pre_delete, sender=AIArtifact)
def _delete_minio_object_on_artifact_delete(sender, instance: AIArtifact, **kwargs) -> None:
    """Remove the backing MinIO object when an AIArtifact row is deleted.

    Fires for both direct deletes and ``CASCADE`` from AISession deletion,
    so MinIO stays in sync with the database. Storage failures are logged
    but never raised — losing the DB row is worse than leaking an object,
    and a bucket retention policy can pick up any orphans later.
    """
    object_key = instance.object_key
    if not object_key:
        return
    try:
        artifact_storage.delete_artifact(object_key)
    except artifact_storage.AIArtifactStorageError as exc:
        logger.warning(
            "MinIO cleanup failed for artifact %s (key=%s): %s",
            instance.pk,
            object_key,
            exc,
        )
