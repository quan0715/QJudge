"""
S3-compatible helper utilities for anti-cheat upload and evidence access.
"""
from __future__ import annotations

import base64
import uuid
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse, urlunparse

from django.conf import settings


def _get_boto3():
    import boto3  # type: ignore

    return boto3


@lru_cache(maxsize=8)
def _cached_s3_client(resolved_endpoint: str) -> Any:
    """Create and cache boto3 S3 clients by endpoint.

    Client construction is relatively expensive. In hot paths like
    presigned-URL generation, reusing clients significantly reduces latency.
    """
    boto3 = _get_boto3()
    kwargs: dict[str, Any] = {
        "aws_access_key_id": settings.OBJECT_STORAGE_ACCESS_KEY,
        "aws_secret_access_key": settings.OBJECT_STORAGE_SECRET_KEY,
        "region_name": settings.OBJECT_STORAGE_REGION,
    }
    if resolved_endpoint:
        kwargs["endpoint_url"] = resolved_endpoint
    return boto3.client("s3", **kwargs)


def get_s3_client(*, endpoint_url: str | None = None):
    resolved_endpoint = endpoint_url if endpoint_url is not None else settings.OBJECT_STORAGE_ENDPOINT_URL
    endpoint_key = (resolved_endpoint or "").strip()
    return _cached_s3_client(endpoint_key)


def _rewrite_presigned_url_for_browser(url: str) -> str:
    """
    Rewrite presigned URL host for browser access when the signing endpoint and
    browser-facing endpoint differ.
    """
    public_endpoint = (settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or "").strip()
    if not public_endpoint:
        return url

    parsed = urlparse(url)
    public = urlparse(public_endpoint)
    if not public.scheme or not public.netloc:
        return url

    base_path = (public.path or "").rstrip("/")
    rewritten_path = f"{base_path}{parsed.path}" if base_path else parsed.path

    return urlunparse(
        (
            public.scheme,
            public.netloc,
            rewritten_path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )


def build_upload_session_id() -> str:
    return uuid.uuid4().hex


def build_raw_object_key(
    contest_id: int,
    user_id: int,
    upload_session_id: str,
    ts_ms: int,
    seq: int,
    module: str = "screen_share",
) -> str:
    module_segment = (module or "screen_share").strip() or "screen_share"
    return (
        f"contest_{contest_id}/user_{user_id}/session_{upload_session_id}/{module_segment}/"
        f"ts_{ts_ms}_seq_{seq:04d}.webp"
    )


def generate_put_url(
    bucket: str,
    object_key: str,
    expires_seconds: int = 300,
    content_type: str = "image/webp",
    client: Any | None = None,
) -> str:
    # Presigned URLs must be signed against the same public host clients will call.
    if client is None:
        client = get_s3_client(endpoint_url=(settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or "").strip() or None)
    params = {
        "Bucket": bucket,
        "Key": object_key,
        "ContentType": content_type,
    }
    url = client.generate_presigned_url(
        ClientMethod="put_object",
        Params=params,
        ExpiresIn=expires_seconds,
    )
    return url


def generate_evidence_chunk_put_url(
    bucket: str,
    object_key: str,
    *,
    content_type: str,
    byte_size: int,
    sha256: str,
    expires_seconds: int = 300,
    client: Any | None = None,
) -> tuple[str, str]:
    """Presign one direct chunk PUT with the standard S3 SHA-256 checksum."""

    checksum = base64.b64encode(bytes.fromhex(sha256)).decode("ascii")
    if client is None:
        client = get_s3_client(
            endpoint_url=(
                settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or ""
            ).strip() or None
        )
    url = client.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": bucket,
            "Key": object_key,
            "ContentType": content_type,
            "ContentLength": byte_size,
            "ChecksumSHA256": checksum,
        },
        ExpiresIn=expires_seconds,
    )
    return url, checksum


def generate_get_url(
    bucket: str,
    object_key: str,
    expires_seconds: int = 120,
    client: Any | None = None,
) -> str:
    # Presigned URLs must be signed against the same public host clients will call.
    if client is None:
        client = get_s3_client(endpoint_url=(settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or "").strip() or None)
    url = client.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": bucket,
            "Key": object_key,
        },
        ExpiresIn=expires_seconds,
    )
    return url
