"""API tests for markdown image upload/read endpoints."""
from __future__ import annotations

from io import BytesIO
from unittest.mock import patch

from PIL import Image
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.services import (
    MarkdownImageNotFoundError,
    MarkdownImageObject,
)

User = get_user_model()


def _make_png_bytes() -> bytes:
    buffer = BytesIO()
    image = Image.new("RGB", (8, 8), color=(255, 0, 0))
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@override_settings(MARKDOWN_IMAGE_MAX_BYTES=1024 * 1024)
class MarkdownImageApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="markdown_uploader",
            email="markdown_uploader@example.com",
            password="password",
            role="teacher",
        )

    @patch("apps.core.views.markdown_images.store_markdown_image")
    @patch(
        "apps.core.views.markdown_images.build_markdown_image_object_key",
        return_value="markdown/2026/03/0123456789abcdef0123456789abcdef.png",
    )
    def test_upload_image_success(self, _mock_key, mock_store):
        self.client.force_authenticate(user=self.user)

        image_content = _make_png_bytes()
        file_obj = BytesIO(image_content)
        file_obj.name = "graph.png"

        response = self.client.post(
            "/api/v1/markdown/images/",
            {"file": file_obj},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["content_type"], "image/png")
        self.assertEqual(response.data["size"], len(image_content))
        self.assertIn("/api/v1/markdown/images/markdown/2026/03/", response.data["url"])
        self.assertEqual(
            response.data["markdown"],
            f"![graph]({response.data['url']})",
        )
        mock_store.assert_called_once()

    @override_settings(MARKDOWN_IMAGE_PUBLIC_BASE_URL="https://q-judge-dev.quan.wtf")
    @patch("apps.core.views.markdown_images.store_markdown_image")
    @patch(
        "apps.core.views.markdown_images.build_markdown_image_object_key",
        return_value="markdown/2026/03/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
    )
    def test_upload_image_uses_public_base_url(self, _mock_key, _mock_store):
        self.client.force_authenticate(user=self.user)
        file_obj = BytesIO(_make_png_bytes())
        file_obj.name = "public.png"
        response = self.client.post(
            "/api/v1/markdown/images/",
            {"file": file_obj},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["url"],
            "https://q-judge-dev.quan.wtf/api/v1/markdown/images/markdown/2026/03/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
        )

    def test_upload_requires_authentication(self):
        file_obj = BytesIO(_make_png_bytes())
        file_obj.name = "public.png"
        response = self.client.post(
            "/api/v1/markdown/images/",
            {"file": file_obj},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_upload_rejects_non_image(self):
        self.client.force_authenticate(user=self.user)
        file_obj = BytesIO(b"not-an-image")
        file_obj.name = "notes.txt"

        response = self.client.post(
            "/api/v1/markdown/images/",
            {"file": file_obj},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Unsupported image", response.data["error"])

    @override_settings(MARKDOWN_IMAGE_MAX_BYTES=10)
    def test_upload_rejects_oversized_image(self):
        self.client.force_authenticate(user=self.user)
        file_obj = BytesIO(_make_png_bytes())
        file_obj.name = "oversized.png"

        response = self.client.post(
            "/api/v1/markdown/images/",
            {"file": file_obj},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("File is too large", response.data["error"])

    @patch("apps.core.views.markdown_images.fetch_markdown_image")
    def test_read_image_public_success(self, mock_fetch):
        mock_fetch.return_value = MarkdownImageObject(
            content=b"abc",
            content_type="image/png",
            size=3,
        )

        response = self.client.get(
            "/api/v1/markdown/images/markdown/2026/03/0123456789abcdef0123456789abcdef.png"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(response.content, b"abc")

    def test_read_image_rejects_invalid_object_key(self):
        response = self.client.get("/api/v1/markdown/images/../../etc/passwd")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("apps.core.views.markdown_images.fetch_markdown_image")
    def test_read_image_returns_404_when_not_found(self, mock_fetch):
        mock_fetch.side_effect = MarkdownImageNotFoundError("not found")
        response = self.client.get(
            "/api/v1/markdown/images/markdown/2026/03/0123456789abcdef0123456789abcdef.png"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
