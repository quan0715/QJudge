"""Tests for classroom cover upload endpoint."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom
from apps.users.models import User


def _make_png_bytes() -> bytes:
    buffer = BytesIO()
    image = Image.new("RGB", (8, 8), color=(255, 0, 0))
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _png_file(name: str = "cover.png") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, _make_png_bytes(), content_type="image/png")


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="cover_owner", email="cover_owner@example.com", password="pass123"
    )


@pytest.fixture
def other_user() -> User:
    return User.objects.create_user(
        username="cover_other", email="cover_other@example.com", password="pass123"
    )


@pytest.fixture
def classroom(owner: User) -> Classroom:
    return Classroom.objects.create(
        name="Test Room", owner=owner, invite_code="COVER01"
    )


@pytest.mark.django_db
class TestClassroomCoverUpload:
    """Tests for POST /api/v1/classrooms/{uuid}/cover/"""

    def _url(self, classroom: Classroom) -> str:
        return f"/api/v1/classrooms/{classroom.uuid}/cover/"

    @patch("apps.classrooms.views.store_markdown_image")
    @patch(
        "apps.classrooms.views.build_markdown_image_object_key",
        return_value="classroom/cover-1.png",
    )
    def test_upload_cover_success(
        self,
        _mock_key,
        _mock_store,
        api_client: APIClient,
        owner: User,
        classroom: Classroom,
    ):
        api_client.force_authenticate(user=owner)
        resp = api_client.post(
            self._url(classroom),
            {"file": _png_file()},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert "cover_url" in resp.data

        classroom.refresh_from_db()
        assert classroom.cover_url == resp.data["cover_url"]

    def test_upload_cover_requires_auth(
        self, api_client: APIClient, classroom: Classroom
    ):
        resp = api_client.post(
            self._url(classroom),
            {"file": _png_file()},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_upload_cover_non_owner_forbidden(
        self, api_client: APIClient, other_user: User, classroom: Classroom
    ):
        api_client.force_authenticate(user=other_user)
        resp = api_client.post(
            self._url(classroom),
            {"file": _png_file()},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN, (
            f"Expected 403 but got {resp.status_code}: {resp.data}"
        )

    def test_upload_cover_missing_file(
        self, api_client: APIClient, owner: User, classroom: Classroom
    ):
        api_client.force_authenticate(user=owner)
        resp = api_client.post(
            self._url(classroom),
            {},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data["success"] is False

    def test_upload_cover_invalid_format(
        self, api_client: APIClient, owner: User, classroom: Classroom
    ):
        api_client.force_authenticate(user=owner)
        bad = SimpleUploadedFile("cover.txt", b"not-an-image", content_type="text/plain")
        resp = api_client.post(
            self._url(classroom),
            {"file": bad},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(MARKDOWN_IMAGE_MAX_BYTES=10)
    def test_upload_cover_too_large(
        self, api_client: APIClient, owner: User, classroom: Classroom
    ):
        api_client.force_authenticate(user=owner)
        resp = api_client.post(
            self._url(classroom),
            {"file": _png_file()},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
