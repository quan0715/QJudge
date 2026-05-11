"""Current-user avatar upload views."""

from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.urls import reverse
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.services import (
    MarkdownImageStorageError,
    build_markdown_image_object_key,
    store_markdown_image,
)

from .common import SchemaAPIView


class UserAvatarUploadView(SchemaAPIView):
    """Upload current user's avatar and return public URL."""

    permission_classes = [IsAuthenticated]
    serializer_class = serializers.Serializer
    parser_classes = [MultiPartParser, FormParser]

    SUPPORTED_IMAGE_FORMATS = {
        "PNG": ("png", "image/png"),
        "JPEG": ("jpg", "image/jpeg"),
        "WEBP": ("webp", "image/webp"),
        "GIF": ("gif", "image/gif"),
    }

    MAX_IMAGE_PIXELS = 24_000_000

    def _build_image_url(self, request, object_key: str) -> str:
        path = reverse("markdown-image-read", kwargs={"object_key": object_key})
        base_url = (settings.MARKDOWN_IMAGE_PUBLIC_BASE_URL or "").strip()
        if base_url:
            return f"{base_url.rstrip('/')}{path}"
        return request.build_absolute_uri(path)

    def _build_alt_text(self, file_name: str) -> str:
        stem = Path(file_name).stem.strip()
        if not stem:
            return "avatar"
        normalized = stem.replace("[", "").replace("]", "").replace("(", "").replace(")", "")
        return normalized[:80] or "avatar"

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response(
                {
                    "success": False,
                    "error": {"code": "FILE_REQUIRED", "message": "file is required"},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_bytes = int(getattr(settings, "MARKDOWN_IMAGE_MAX_BYTES", 5 * 1024 * 1024))
        if uploaded.size > max_bytes:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "FILE_TOO_LARGE",
                        "message": f"File is too large (max {max_bytes} bytes)",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = uploaded.read()
        if not payload:
            return Response(
                {
                    "success": False,
                    "error": {"code": "EMPTY_FILE", "message": "Uploaded file is empty"},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with Image.open(BytesIO(payload)) as image:
                image.verify()
            with Image.open(BytesIO(payload)) as image:
                image_format = (image.format or "").upper()
                width, height = image.size
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            return Response(
                {
                    "success": False,
                    "error": {"code": "UNSUPPORTED_IMAGE", "message": "Unsupported image file"},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if width * height > self.MAX_IMAGE_PIXELS:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "IMAGE_TOO_LARGE",
                        "message": "Image dimensions exceed allowed pixel count",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if image_format not in self.SUPPORTED_IMAGE_FORMATS:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "UNSUPPORTED_IMAGE_FORMAT",
                        "message": "Unsupported image format. Use png/jpg/jpeg/webp/gif",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        extension, content_type = self.SUPPORTED_IMAGE_FORMATS[image_format]
        object_key = build_markdown_image_object_key(extension)

        try:
            store_markdown_image(content=payload, object_key=object_key, content_type=content_type)
        except MarkdownImageStorageError:
            return Response(
                {
                    "success": False,
                    "error": {"code": "UPLOAD_FAILED", "message": "Failed to upload image"},
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        image_url = self._build_image_url(request, object_key)

        from ..models import UserProfile

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.avatar_url = image_url
        profile.avatar_source = "manual"
        profile.save(update_fields=["avatar_url", "avatar_source", "updated_at"])
        cache.delete(f"user_preferences:v1:{request.user.id}")

        return Response(
            {
                "success": True,
                "data": {
                    "avatar_url": image_url,
                    "content_type": content_type,
                    "size": len(payload),
                    "alt": self._build_alt_text(uploaded.name),
                },
                "message": "頭像已上傳",
            },
            status=status.HTTP_201_CREATED,
        )


__all__ = [
    "UserAvatarUploadView",
    "build_markdown_image_object_key",
    "store_markdown_image",
]
