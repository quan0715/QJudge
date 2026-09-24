"""S3-backed storage for markdown editor images."""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from botocore.exceptions import ClientError
from django.conf import settings
from django.utils import timezone

OBJECT_KEY_PATTERN = re.compile(
    r"^markdown/\d{4}/\d{2}/[0-9a-f]{32}\.(?:png|jpe?g|webp|gif)$"
)

class MarkdownImageStorageError(Exception):
    """Raised when markdown image storage operations fail."""


class MarkdownImageNotFoundError(MarkdownImageStorageError):
    """Raised when a markdown image object is not found."""


@dataclass
class MarkdownImageObject:
    """A markdown image object fetched from S3."""

    content: bytes
    content_type: str
    size: int


def is_valid_markdown_image_object_key(object_key: str) -> bool:
    """Validate markdown image object key format."""
    return bool(OBJECT_KEY_PATTERN.fullmatch(object_key))


def build_markdown_image_object_key(extension: str, now: datetime | None = None) -> str:
    """Build deterministic object key path for markdown images."""
    current = now or timezone.now()
    safe_extension = extension.lower().lstrip(".")
    return (
        f"markdown/{current:%Y}/{current:%m}/"
        f"{uuid.uuid4().hex}.{safe_extension}"
    )


def _get_boto3():
    import boto3  # type: ignore

    return boto3


def get_markdown_image_s3_client():
    """Build boto3 S3 client for markdown images."""
    boto3 = _get_boto3()
    kwargs: dict[str, Any] = {
        "aws_access_key_id": settings.OBJECT_STORAGE_ACCESS_KEY,
        "aws_secret_access_key": settings.OBJECT_STORAGE_SECRET_KEY,
        "region_name": settings.OBJECT_STORAGE_REGION,
    }
    if settings.OBJECT_STORAGE_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.OBJECT_STORAGE_ENDPOINT_URL
    return boto3.client("s3", **kwargs)


def store_markdown_image(content: bytes, object_key: str, content_type: str) -> None:
    """Upload markdown image bytes to S3."""
    client = get_markdown_image_s3_client()
    try:
        client.put_object(
            Bucket=settings.MARKDOWN_IMAGE_S3_BUCKET,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )
    except ClientError as exc:
        raise MarkdownImageStorageError("Failed to upload markdown image") from exc


def fetch_markdown_image(object_key: str) -> MarkdownImageObject:
    """Fetch markdown image bytes + metadata from S3."""
    client = get_markdown_image_s3_client()
    try:
        response = client.get_object(
            Bucket=settings.MARKDOWN_IMAGE_S3_BUCKET,
            Key=object_key,
        )
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", "")).strip()
        if code in {"404", "NoSuchKey", "NotFound", "NoSuchBucket"}:
            raise MarkdownImageNotFoundError("Markdown image not found") from exc
        raise MarkdownImageStorageError("Failed to fetch markdown image") from exc

    stream = response["Body"]
    try:
        payload = stream.read()
    finally:
        stream.close()

    content_type = response.get("ContentType") or "application/octet-stream"
    size = int(response.get("ContentLength") or len(payload))
    return MarkdownImageObject(content=payload, content_type=content_type, size=size)
