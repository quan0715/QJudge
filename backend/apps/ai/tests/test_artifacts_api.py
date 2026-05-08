"""Tests for AI artifact REST endpoints (internal + user)."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIArtifact, AISession

User = get_user_model()


INTERNAL_TOKEN = "test-internal-token"


def _auth_headers():
    return {"HTTP_X_AI_INTERNAL_TOKEN": INTERNAL_TOKEN}


@override_settings(
    AI_SERVICE_INTERNAL_TOKEN=INTERNAL_TOKEN,
    AI_ARTIFACT_MAX_BYTES=1024,
)
class ArtifactInternalEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="teacher",
            email="teacher@example.com",
            password="pw",
        )
        self.session = AISession.objects.create(
            session_id="11111111-1111-1111-1111-111111111111",
            user=self.user,
        )
        self.url = "/api/v1/ai/_internal/artifacts/"

    def _write_payload(self, **overrides):
        payload = {
            "session_id": self.session.session_id,
            "step": "rubric",
            "filename": "rubric.json",
            "content": '{"hello": "world"}',
            "content_type": "application/json",
            "metadata": {"artifact_type": "rubric"},
        }
        payload.update(overrides)
        return payload

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_create_requires_internal_token(self, mock_store):
        resp = self.client.post(self.url, self._write_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        mock_store.assert_not_called()

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_create_rejects_wrong_token(self, mock_store):
        resp = self.client.post(
            self.url,
            self._write_payload(),
            format="json",
            HTTP_X_AI_INTERNAL_TOKEN="nope",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        mock_store.assert_not_called()

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_create_writes_artifact_and_record(self, mock_store):
        resp = self.client.post(
            self.url,
            self._write_payload(),
            format="json",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["step"], "rubric")
        self.assertEqual(resp.data["filename"], "rubric.json")
        self.assertEqual(resp.data["session_id"], self.session.session_id)
        self.assertTrue(resp.data["object_key"].endswith("/rubric/rubric.json"))
        self.assertEqual(resp.data["size_bytes"], len('{"hello": "world"}'))
        self.assertTrue(resp.data["checksum"])
        self.assertEqual(AIArtifact.objects.filter(session=self.session).count(), 1)
        mock_store.assert_called_once()

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_create_upserts_same_session_step_filename(self, mock_store):
        self.client.post(
            self.url,
            self._write_payload(content="v1"),
            format="json",
            **_auth_headers(),
        )
        resp = self.client.post(
            self.url,
            self._write_payload(content="v2-longer"),
            format="json",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AIArtifact.objects.filter(session=self.session).count(), 1)
        artifact = AIArtifact.objects.get(session=self.session)
        self.assertEqual(artifact.size_bytes, len("v2-longer"))

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_create_rejects_oversize(self, mock_store):
        big = "x" * 2048
        resp = self.client.post(
            self.url,
            self._write_payload(content=big),
            format="json",
            **_auth_headers(),
        )
        self.assertEqual(
            resp.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, resp.data
        )
        mock_store.assert_not_called()

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_create_rejects_invalid_filename(self, mock_store):
        resp = self.client.post(
            self.url,
            self._write_payload(filename="../etc/passwd"),
            format="json",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        mock_store.assert_not_called()

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_create_rejects_unknown_session(self, mock_store):
        resp = self.client.post(
            self.url,
            self._write_payload(session_id="00000000-0000-0000-0000-000000000000"),
            format="json",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        mock_store.assert_not_called()

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_list_filters_by_session_and_step(self, _mock_store):
        self.client.post(
            self.url,
            self._write_payload(step="rubric", filename="rubric.json"),
            format="json",
            **_auth_headers(),
        )
        self.client.post(
            self.url,
            self._write_payload(step="calibration", filename="calibration.md"),
            format="json",
            **_auth_headers(),
        )

        resp = self.client.get(
            f"{self.url}?session_id={self.session.session_id}",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 2)

        resp = self.client.get(
            f"{self.url}?session_id={self.session.session_id}&step=rubric",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["step"], "rubric")

    def test_list_requires_session_id(self):
        resp = self.client.get(self.url, **_auth_headers())
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_list_filters_by_filename_only(self, _mock_store):
        """?session_id=X&filename=Y returns matching artifacts across steps."""
        self.client.post(
            self.url,
            self._write_payload(step="grade", filename="grade.csv", content="a"),
            format="json",
            **_auth_headers(),
        )
        self.client.post(
            self.url,
            self._write_payload(step="rubric", filename="rubric.md", content="b"),
            format="json",
            **_auth_headers(),
        )

        resp = self.client.get(
            f"{self.url}?session_id={self.session.session_id}&filename=grade.csv",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["filename"], "grade.csv")

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_list_filename_only_returns_multiple_steps(self, _mock_store):
        """Same filename in two steps → both returned when filtering by filename."""
        self.client.post(
            self.url,
            self._write_payload(step="grade", filename="grade.csv", content="v1"),
            format="json",
            **_auth_headers(),
        )
        self.client.post(
            self.url,
            self._write_payload(step="backup", filename="grade.csv", content="v2"),
            format="json",
            **_auth_headers(),
        )

        resp = self.client.get(
            f"{self.url}?session_id={self.session.session_id}&filename=grade.csv",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 2)
        steps = {a["step"] for a in resp.data}
        self.assertEqual(steps, {"grade", "backup"})

    @patch(
        "apps.ai.artifact_views.artifact_storage.store_artifact",
    )
    @patch(
        "apps.ai.artifact_views.artifact_storage.fetch_artifact",
    )
    def test_content_returns_raw_bytes(self, mock_fetch, _mock_store):
        from apps.ai.services.artifact_storage import AIArtifactObject

        create = self.client.post(
            self.url,
            self._write_payload(content='{"a": 1}'),
            format="json",
            **_auth_headers(),
        )
        artifact_id = create.data["id"]

        mock_fetch.return_value = AIArtifactObject(
            content=b'{"a": 1}',
            content_type="application/json",
            size=8,
        )
        resp = self.client.get(
            f"{self.url}{artifact_id}/content/",
            **_auth_headers(),
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp["Content-Type"], "application/json")
        self.assertEqual(resp.content, b'{"a": 1}')


@override_settings(AI_SERVICE_INTERNAL_TOKEN=INTERNAL_TOKEN)
class ArtifactUserEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = User.objects.create_user(
            username="u1", email="u1@e.com", password="pw"
        )
        self.user2 = User.objects.create_user(
            username="u2", email="u2@e.com", password="pw"
        )
        self.session1 = AISession.objects.create(
            session_id="11111111-1111-1111-1111-111111111111",
            user=self.user1,
        )
        self.session2 = AISession.objects.create(
            session_id="22222222-2222-2222-2222-222222222222",
            user=self.user2,
        )
        AIArtifact.objects.create(
            session=self.session1,
            step="rubric",
            filename="rubric.json",
            object_key=f"{self.session1.session_id}/rubric/rubric.json",
            content_type="application/json",
            size_bytes=10,
            checksum="a" * 64,
            metadata={"artifact_type": "rubric"},
        )
        AIArtifact.objects.create(
            session=self.session2,
            step="rubric",
            filename="rubric.json",
            object_key=f"{self.session2.session_id}/rubric/rubric.json",
            content_type="application/json",
            size_bytes=10,
            checksum="b" * 64,
            metadata={"artifact_type": "rubric"},
        )

    def test_user_only_sees_own_artifacts(self):
        self.client.force_authenticate(user=self.user1)
        resp = self.client.get("/api/v1/ai/artifacts/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["session_id"], self.session1.session_id)

    def test_user_cannot_read_other_users_artifact(self):
        self.client.force_authenticate(user=self.user1)
        other = AIArtifact.objects.get(session=self.session2)
        resp = self.client.get(f"/api/v1/ai/artifacts/{other.id}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonymous_blocked(self):
        resp = self.client.get("/api/v1/ai/artifacts/")
        self.assertIn(
            resp.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    @patch("apps.ai.artifact_views.artifact_storage.build_presigned_download_url")
    def test_download_returns_presigned_url(self, mock_presign):
        mock_presign.return_value = "https://object-storage.example/signed"
        self.client.force_authenticate(user=self.user1)
        own = AIArtifact.objects.get(session=self.session1)
        resp = self.client.get(f"/api/v1/ai/artifacts/{own.id}/download/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["url"], "https://object-storage.example/signed")

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_upload_csv_creates_user_upload_artifact(self, mock_store):
        self.client.force_authenticate(user=self.user1)
        upload = SimpleUploadedFile(
            "scores.csv",
            b"id,score\n1,100\n",
            content_type="text/csv",
        )
        resp = self.client.post(
            "/api/v1/ai/artifacts/upload/",
            {"session_id": self.session1.session_id, "file": upload},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["step"], "user_upload")
        self.assertEqual(resp.data["filename"], "scores.csv")
        self.assertEqual(resp.data["session_id"], self.session1.session_id)
        mock_store.assert_called_once()

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_upload_pdf_creates_user_upload_artifact(self, mock_store):
        self.client.force_authenticate(user=self.user1)
        upload = SimpleUploadedFile(
            "OS-2025-Midterm-2-QA.pdf",
            b"%PDF-1.7\n",
            content_type="application/pdf",
        )
        resp = self.client.post(
            "/api/v1/ai/artifacts/upload/",
            {"session_id": self.session1.session_id, "file": upload},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["step"], "user_upload")
        self.assertEqual(resp.data["filename"], "OS-2025-Midterm-2-QA.pdf")
        self.assertEqual(resp.data["content_type"], "application/pdf")
        mock_store.assert_called_once()

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_upload_csv_accepts_custom_step_for_session_artifact(self, mock_store):
        self.client.force_authenticate(user=self.user1)
        upload = SimpleUploadedFile(
            "grade.csv",
            b"exam_answer_id,score\n1,\n",
            content_type="text/csv",
        )
        resp = self.client.post(
            "/api/v1/ai/artifacts/upload/",
            {"session_id": self.session1.session_id, "step": "grade", "file": upload},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["step"], "grade")
        self.assertEqual(resp.data["filename"], "grade.csv")
        mock_store.assert_called_once()

    def test_upload_rejects_invalid_step(self):
        self.client.force_authenticate(user=self.user1)
        upload = SimpleUploadedFile(
            "grade.csv",
            b"exam_answer_id,score\n1,\n",
            content_type="text/csv",
        )
        resp = self.client.post(
            "/api/v1/ai/artifacts/upload/",
            {"session_id": self.session1.session_id, "step": "../grade", "file": upload},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("apps.ai.artifact_views.artifact_storage.store_artifact")
    def test_upload_json_creates_user_upload_artifact(self, mock_store):
        self.client.force_authenticate(user=self.user1)
        upload = SimpleUploadedFile(
            "task_manifest.json",
            b'{"schema_version":1}',
            content_type="application/json",
        )
        resp = self.client.post(
            "/api/v1/ai/artifacts/upload/",
            {"session_id": self.session1.session_id, "file": upload},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["step"], "user_upload")
        self.assertEqual(resp.data["filename"], "task_manifest.json")
        self.assertEqual(resp.data["content_type"], "application/json")
        self.assertEqual(resp.data["session_id"], self.session1.session_id)
        mock_store.assert_called_once()

    def test_upload_rejects_non_csv_md_json(self):
        self.client.force_authenticate(user=self.user1)
        upload = SimpleUploadedFile(
            "notes.txt",
            b"hello",
            content_type="text/plain",
        )
        resp = self.client.post(
            "/api/v1/ai/artifacts/upload/",
            {"session_id": self.session1.session_id, "file": upload},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_rejects_other_users_session(self):
        self.client.force_authenticate(user=self.user1)
        upload = SimpleUploadedFile(
            "scores.csv",
            b"id,score\n1,100\n",
            content_type="text/csv",
        )
        resp = self.client.post(
            "/api/v1/ai/artifacts/upload/",
            {"session_id": self.session2.session_id, "file": upload},
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
