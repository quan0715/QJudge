"""Tests for MinIO object cleanup on AIArtifact / AISession delete."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.ai.models import AIArtifact, AISession
from apps.ai.services import artifact_storage

User = get_user_model()


class ArtifactCleanupSignalTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="cleanup_u",
            email="cleanup@e.com",
            password="pw",
        )
        self.session = AISession.objects.create(
            session_id="c0ffeec0-ffee-c0ff-eec0-ffeec0ffeec0",
            user=self.user,
        )

    def _make_artifact(self, **overrides):
        defaults = dict(
            session=self.session,
            step="rubric",
            filename="rubric.json",
            object_key=f"{self.session.session_id}/rubric/rubric.json",
            content_type="application/json",
            size_bytes=10,
            checksum="a" * 64,
            metadata={},
        )
        defaults.update(overrides)
        return AIArtifact.objects.create(**defaults)

    @patch("apps.ai.signals.artifact_storage.delete_artifact")
    def test_direct_delete_removes_minio_object(self, mock_delete):
        artifact = self._make_artifact()
        object_key = artifact.object_key

        artifact.delete()

        mock_delete.assert_called_once_with(object_key)

    @patch("apps.ai.signals.artifact_storage.delete_artifact")
    def test_session_cascade_removes_all_artifact_minio_objects(self, mock_delete):
        a = self._make_artifact(step="rubric", filename="rubric.json")
        b = self._make_artifact(
            step="calibration",
            filename="calibration_report.md",
            object_key=f"{self.session.session_id}/calibration/calibration_report.md",
        )

        self.session.delete()

        keys = sorted(call.args[0] for call in mock_delete.call_args_list)
        self.assertEqual(
            keys,
            sorted([a.object_key, b.object_key]),
        )
        self.assertFalse(AIArtifact.objects.filter(pk__in=[a.pk, b.pk]).exists())

    @patch("apps.ai.signals.artifact_storage.delete_artifact")
    def test_storage_failure_does_not_block_db_delete(self, mock_delete):
        mock_delete.side_effect = artifact_storage.AIArtifactStorageError("boom")
        artifact = self._make_artifact()
        pk = artifact.pk

        # Must not raise, and must still remove the DB row.
        artifact.delete()

        self.assertFalse(AIArtifact.objects.filter(pk=pk).exists())

    @patch("apps.ai.signals.artifact_storage.delete_artifact")
    def test_empty_object_key_skips_storage(self, mock_delete):
        artifact = self._make_artifact(object_key="")

        artifact.delete()

        mock_delete.assert_not_called()
