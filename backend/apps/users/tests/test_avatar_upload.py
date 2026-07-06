"""Tests for /api/v1/users/me/avatar endpoint."""

from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import UserProfile

User = get_user_model()


def _make_png_bytes() -> bytes:
    buffer = BytesIO()
    image = Image.new("RGB", (8, 8), color=(255, 0, 0))
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class UserAvatarUploadViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="avatar_user",
            email="avatar@example.com",
            password="testpass123",
        )
        self.url = "/api/v1/users/me/avatar"

    def test_upload_avatar_requires_auth(self):
        payload = _make_png_bytes()
        file_obj = BytesIO(payload)
        file_obj.name = "avatar.png"
        response = self.client.post(self.url, {"file": file_obj}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("apps.users.views.avatar.store_markdown_image")
    @patch("apps.users.views.avatar.build_markdown_image_object_key")
    def test_upload_avatar_success(self, mock_key, mock_store):
        self.client.force_authenticate(user=self.user)
        mock_key.return_value = "markdown/2026/03/0123456789abcdef0123456789abcdef.png"

        payload = _make_png_bytes()
        file_obj = BytesIO(payload)
        file_obj.name = "avatar.png"
        response = self.client.post(self.url, {"file": file_obj}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertIn("/api/v1/markdown/images/markdown/2026/03/", response.data["data"]["avatar_url"])
        self.assertEqual(response.data["data"]["content_type"], "image/png")
        self.assertEqual(response.data["data"]["size"], len(payload))
        mock_store.assert_called_once()

        profile = UserProfile.objects.get(user=self.user)
        self.assertEqual(profile.avatar_source, "manual")
        self.assertEqual(profile.avatar_url, response.data["data"]["avatar_url"])

    def test_upload_avatar_rejects_non_image(self):
        self.client.force_authenticate(user=self.user)
        file_obj = BytesIO(b"not-image")
        file_obj.name = "avatar.txt"
        response = self.client.post(self.url, {"file": file_obj}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "UNSUPPORTED_IMAGE")
