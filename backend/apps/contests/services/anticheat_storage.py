"""
MinIO/S3 helper utilities for anti-cheat upload and evidence access.
"""
from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urlparse, urlunparse

from django.conf import settings


def _get_boto3():
    import boto3  # type: ignore

    return boto3


def get_s3_client():
    boto3 = _get_boto3()
    kwargs: dict[str, Any] = {
        "aws_access_key_id": settings.ANTICHEAT_S3_ACCESS_KEY,
        "aws_secret_access_key": settings.ANTICHEAT_S3_SECRET_KEY,
        "region_name": settings.ANTICHEAT_S3_REGION,
    }
    if settings.ANTICHEAT_S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.ANTICHEAT_S3_ENDPOINT_URL
    return boto3.client("s3", **kwargs)


def _rewrite_presigned_url_for_browser(url: str) -> str:
    """
    Rewrite presigned URL host for browser access when MinIO uses an internal
    Docker hostname (e.g. http://minio:9000).
    """
    public_endpoint = (settings.ANTICHEAT_S3_PUBLIC_ENDPOINT_URL or "").strip()
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


def build_raw_object_key(contest_id: int, user_id: int, upload_session_id: str, ts_ms: int, seq: int) -> str:
    return (
        f"contest_{contest_id}/user_{user_id}/session_{upload_session_id}/"
        f"ts_{ts_ms}_seq_{seq:04d}.webp"
    )


def generate_put_url(
    bucket: str,
    object_key: str,
    expires_seconds: int = 300,
    content_type: str = "image/webp",
    tagging: str = "cleanup=true",
) -> str:
    client = get_s3_client()
    url = client.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": bucket,
            "Key": object_key,
            "ContentType": content_type,
            "Tagging": tagging,
        },
        ExpiresIn=expires_seconds,
    )
    return _rewrite_presigned_url_for_browser(url)


def generate_get_url(bucket: str, object_key: str, expires_seconds: int = 120) -> str:
    client = get_s3_client()
    url = client.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": bucket,
            "Key": object_key,
        },
        ExpiresIn=expires_seconds,
    )
    return _rewrite_presigned_url_for_browser(url)


def tag_object_retain(bucket: str, object_key: str) -> None:
    client = get_s3_client()
    client.put_object_tagging(
        Bucket=bucket,
        Key=object_key,
        Tagging={"TagSet": [{"Key": "retain", "Value": "true"}]},
    )
