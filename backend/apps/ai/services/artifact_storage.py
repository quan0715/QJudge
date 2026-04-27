"""S3-compatible storage for AI artifacts (rubric, graded answers, etc.)."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from botocore.exceptions import ClientError
from django.conf import settings


_BUCKET_READY = False


def reset_bucket_ready_cache() -> None:
    global _BUCKET_READY
    _BUCKET_READY = False


class AIArtifactStorageError(Exception):
    """Raised when artifact storage operations fail."""


class AIArtifactNotFoundError(AIArtifactStorageError):
    """Raised when an artifact object is not found."""


@dataclass
class AIArtifactObject:
    content: bytes
    content_type: str
    size: int


def build_artifact_object_key(session_id: str, step: str, filename: str) -> str:
    """Deterministic object key: ai-artifacts/{session}/{step}/{filename}."""
    safe_session = str(session_id).strip()
    safe_step = step.strip().strip("/")
    safe_filename = filename.strip().strip("/")
    if not safe_session or not safe_step or not safe_filename:
        raise AIArtifactStorageError("session_id / step / filename must be non-empty")
    return f"{safe_session}/{safe_step}/{safe_filename}"


def compute_checksum(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _get_boto3():
    import boto3  # type: ignore

    return boto3


def _build_client(endpoint_url: str | None = None):
    boto3 = _get_boto3()
    kwargs: dict[str, Any] = {
        "aws_access_key_id": settings.OBJECT_STORAGE_ACCESS_KEY,
        "aws_secret_access_key": settings.OBJECT_STORAGE_SECRET_KEY,
        "region_name": settings.OBJECT_STORAGE_REGION,
    }
    endpoint = endpoint_url or settings.OBJECT_STORAGE_ENDPOINT_URL
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client("s3", **kwargs)


def get_artifact_s3_client():
    return _build_client()


def get_artifact_s3_public_client():
    """Client whose presigned URLs point at the browser-facing endpoint."""
    public = settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL
    return _build_client(endpoint_url=public or None)


def _ensure_bucket_exists(client) -> None:
    global _BUCKET_READY
    if _BUCKET_READY:
        return

    bucket = settings.AI_ARTIFACT_S3_BUCKET
    auto_create = getattr(settings, "OBJECT_STORAGE_AUTO_CREATE_BUCKETS", True)
    try:
        client.head_bucket(Bucket=bucket)
        _BUCKET_READY = True
        return
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", "")).strip()
        if not auto_create:
            # R2 / managed buckets: the token may not have account-wide
            # HeadBucket permission. Trust the configured bucket and surface a
            # clearer error if it really is missing on first put_object.
            if code in {"403", "AccessDenied", "Forbidden"}:
                _BUCKET_READY = True
                return
            if code in {"404", "NoSuchBucket", "NotFound"}:
                raise AIArtifactStorageError(
                    f"Artifact bucket '{bucket}' not found on object storage; "
                    "create it in the provider dashboard before retrying."
                ) from exc
            raise AIArtifactStorageError("Failed to access artifact bucket") from exc
        if code not in {"404", "NoSuchBucket", "NotFound"}:
            raise AIArtifactStorageError("Failed to access artifact bucket") from exc

    create_params: dict[str, Any] = {"Bucket": bucket}
    region = (settings.OBJECT_STORAGE_REGION or "").strip()
    if region and region != "us-east-1":
        create_params["CreateBucketConfiguration"] = {"LocationConstraint": region}

    try:
        client.create_bucket(**create_params)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", "")).strip()
        if code != "BucketAlreadyOwnedByYou":
            raise AIArtifactStorageError("Failed to create artifact bucket") from exc

    _BUCKET_READY = True


def store_artifact(content: bytes, object_key: str, content_type: str) -> None:
    client = get_artifact_s3_client()
    _ensure_bucket_exists(client)
    try:
        client.put_object(
            Bucket=settings.AI_ARTIFACT_S3_BUCKET,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )
    except ClientError as exc:
        raise AIArtifactStorageError("Failed to upload artifact") from exc


def fetch_artifact(object_key: str) -> AIArtifactObject:
    client = get_artifact_s3_client()
    try:
        response = client.get_object(
            Bucket=settings.AI_ARTIFACT_S3_BUCKET,
            Key=object_key,
        )
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", "")).strip()
        if code in {"404", "NoSuchKey", "NotFound", "NoSuchBucket"}:
            raise AIArtifactNotFoundError("Artifact not found") from exc
        raise AIArtifactStorageError("Failed to fetch artifact") from exc

    stream = response["Body"]
    try:
        payload = stream.read()
    finally:
        stream.close()

    content_type = response.get("ContentType") or "application/octet-stream"
    size = int(response.get("ContentLength") or len(payload))
    return AIArtifactObject(content=payload, content_type=content_type, size=size)


def delete_artifact(object_key: str) -> None:
    client = get_artifact_s3_client()
    try:
        client.delete_object(
            Bucket=settings.AI_ARTIFACT_S3_BUCKET,
            Key=object_key,
        )
    except ClientError as exc:
        raise AIArtifactStorageError("Failed to delete artifact") from exc


def build_presigned_download_url(object_key: str, ttl: int | None = None) -> str:
    client = get_artifact_s3_public_client()
    expires = ttl or settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS
    try:
        return client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": settings.AI_ARTIFACT_S3_BUCKET,
                "Key": object_key,
            },
            ExpiresIn=expires,
        )
    except ClientError as exc:
        raise AIArtifactStorageError("Failed to presign artifact URL") from exc
