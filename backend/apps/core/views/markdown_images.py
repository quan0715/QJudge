"""Markdown image upload/read APIs."""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from django.conf import settings
from django.http import HttpResponse
from django.urls import reverse
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services import (
    MarkdownImageNotFoundError,
    MarkdownImageStorageError,
    build_markdown_image_object_key,
    fetch_markdown_image,
    is_valid_markdown_image_object_key,
    store_markdown_image,
)

SUPPORTED_IMAGE_FORMATS = {
    "PNG": ("png", "image/png"),
    "JPEG": ("jpg", "image/jpeg"),
    "WEBP": ("webp", "image/webp"),
    "GIF": ("gif", "image/gif"),
}


def _build_alt_text(file_name: str) -> str:
    """Build markdown image alt text from original file name."""
    stem = Path(file_name).stem.strip()
    if not stem:
        return "image"
    normalized = stem.replace("[", "").replace("]", "").replace("(", "").replace(")", "")
    return normalized[:80] or "image"


def _build_image_url(request, object_key: str) -> str:
    path = reverse("markdown-image-read", kwargs={"object_key": object_key})
    base_url = (settings.MARKDOWN_IMAGE_PUBLIC_BASE_URL or "").strip()
    if base_url:
        return f"{base_url.rstrip('/')}{path}"
    return request.build_absolute_uri(path)


class MarkdownImageUploadView(APIView):
    """Upload image and return markdown-ready URL."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"error": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

        max_bytes = int(settings.MARKDOWN_IMAGE_MAX_BYTES)
        if uploaded.size > max_bytes:
            return Response(
                {"error": f"File is too large (max {max_bytes} bytes)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = uploaded.read()
        if not payload:
            return Response({"error": "Uploaded file is empty"}, status=status.HTTP_400_BAD_REQUEST)

        if len(payload) > max_bytes:
            return Response(
                {"error": f"File is too large (max {max_bytes} bytes)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with Image.open(BytesIO(payload)) as image:
                image.verify()
            with Image.open(BytesIO(payload)) as image:
                image_format = (image.format or "").upper()
        except (UnidentifiedImageError, OSError):
            return Response(
                {"error": "Unsupported image file"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if image_format not in SUPPORTED_IMAGE_FORMATS:
            return Response(
                {"error": "Unsupported image format. Use png/jpg/jpeg/webp/gif"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        extension, content_type = SUPPORTED_IMAGE_FORMATS[image_format]
        object_key = build_markdown_image_object_key(extension)

        try:
            store_markdown_image(
                content=payload,
                object_key=object_key,
                content_type=content_type,
            )
        except MarkdownImageStorageError:
            return Response(
                {"error": "Failed to upload image"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        image_url = _build_image_url(request, object_key)
        alt = _build_alt_text(uploaded.name)

        return Response(
            {
                "url": image_url,
                "markdown": f"![{alt}]({image_url})",
                "content_type": content_type,
                "size": len(payload),
            },
            status=status.HTTP_201_CREATED,
        )


class MarkdownImageReadView(APIView):
    """Read markdown image through backend proxy."""

    permission_classes = [permissions.AllowAny]
    authentication_classes: list = []

    def get(self, request, object_key: str):
        if not is_valid_markdown_image_object_key(object_key):
            return Response({"error": "Image not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            image = fetch_markdown_image(object_key)
        except MarkdownImageNotFoundError:
            return Response({"error": "Image not found"}, status=status.HTTP_404_NOT_FOUND)
        except MarkdownImageStorageError:
            return Response(
                {"error": "Failed to read image"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        response = HttpResponse(image.content, content_type=image.content_type)
        response["Content-Length"] = str(image.size)
        response["Cache-Control"] = "public, max-age=31536000, immutable"
        return response
