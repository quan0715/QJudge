"""Archive manifest verification and exact-key purge helpers."""
from __future__ import annotations

import hashlib
import hmac
import json
import re
from uuid import UUID

from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.contests.models import (
    ExamEvidenceChunk,
    ExamIntegrityRun,
)
from apps.contests.services.integrity_evidence_windows import (
    IntegrityEvidenceStorageError,
    _SHA256_RE,
)


_MANIFEST_MAX_BYTES = 16 * 1024 * 1024
_PURGE_BATCH_SIZE = 500
_MAX_ARCHIVE_GENERATIONS = 1_000
_MAX_PURGE_KEYS = 100_000


def _storage_error_code(error: ClientError) -> str:
    response = getattr(error, "response", {})
    detail = response.get("Error") if type(response) is dict else None
    return str(detail.get("Code") or "") if type(detail) is dict else ""


def _read_body(response: dict[str, object]) -> bytes:
    content_length = response.get("ContentLength")
    body = response.get("Body")
    if body is None or not hasattr(body, "read"):
        raise IntegrityEvidenceStorageError("archive manifest body is invalid")
    try:
        if type(content_length) is int and (
            content_length < 0 or content_length > _MANIFEST_MAX_BYTES
        ):
            raise IntegrityEvidenceStorageError("archive manifest is too large")
        content = body.read(_MANIFEST_MAX_BYTES + 1)
    finally:
        close = getattr(body, "close", None)
        if callable(close):
            close()
    if type(content) is not bytes or len(content) > _MANIFEST_MAX_BYTES:
        raise IntegrityEvidenceStorageError("archive manifest body is invalid")
    return content


def _expected_manifest_key(run_id: UUID, generation: int) -> str:
    return f"runs/{run_id}/generation-{generation}/manifest.json"


def _expected_segment_prefix(run_id: UUID, generation: int) -> str:
    return f"runs/{run_id}/generation-{generation}/segments/"


def _read_archive_manifest(client, key: str, digest: str) -> dict:
    try:
        response = client.get_object(
            Bucket=settings.OBJECT_STORAGE_BUCKET,
            Key=key,
        )
    except (BotoCoreError, ClientError):
        raise IntegrityEvidenceStorageError(
            "archive manifest could not be read"
        ) from None
    content = _read_body(response)
    if not hmac.compare_digest(hashlib.sha256(content).hexdigest(), digest):
        raise IntegrityEvidenceStorageError("archive manifest checksum is invalid")
    try:
        payload = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise IntegrityEvidenceStorageError(
            "archive manifest payload is invalid"
        ) from None
    return payload


def _load_resident_manifest(
    client, run: ExamIntegrityRun, key: str, digest: str, *, published: bool,
) -> set[str]:
    """Validate one content-addressed Resident snapshot before selecting its keys."""
    prefix = f"runs/{run.id}/resident-revision-"
    match = re.fullmatch(
        re.escape(prefix) + r"([1-9][0-9]*)/([0-9a-f-]{36})/([0-9a-f]{64})\.json",
        key,
    )
    if (
        match is None
        or type(digest) is not str
        or not _SHA256_RE.fullmatch(digest)
        or match[3] != digest
        or type(run.schedule_revision) is not int
        or int(match[1]) > run.schedule_revision
        or (published and int(match[1]) != run.schedule_revision)
    ):
        raise IntegrityEvidenceStorageError("archive manifest identity is invalid")
    try:
        candidate = str(UUID(match[2]))
    except ValueError:
        raise IntegrityEvidenceStorageError("archive manifest identity is invalid") from None
    if candidate != match[2]:
        raise IntegrityEvidenceStorageError("archive manifest identity is invalid")
    payload = _read_archive_manifest(client, key, digest)
    if (
        type(payload) is not dict
        or type(payload.get("schema_version")) is not int
        or payload["schema_version"] != 2
        or payload.get("run_id") != str(run.id)
        or type(payload.get("resident_revision")) is not int
        or str(payload["resident_revision"]) != match[1]
        or payload.get("candidate_id") != candidate
        or type(payload.get("segments")) is not list
    ):
        raise IntegrityEvidenceStorageError("archive manifest payload is invalid")
    segments = payload["segments"]
    if len(segments) + 1 > _MAX_PURGE_KEYS:
        raise IntegrityEvidenceStorageError("integrity purge key set is too large")
    keys = {key}
    for segment in segments:
        sha256 = segment.get("sha256") if type(segment) is dict else None
        if (
            type(sha256) is not str
            or not _SHA256_RE.fullmatch(sha256)
            or segment.get("object_key")
            != f"runs/{run.id}/resident-segments/{sha256}.journal.gz"
        ):
            raise IntegrityEvidenceStorageError("archive segment identity is invalid")
        keys.add(segment["object_key"])
    return keys


def _load_resident_archive_manifest(client, run: ExamIntegrityRun) -> set[str]:
    keys = _load_resident_manifest(
        client, run, run.archive_manifest_key, run.archive_manifest_sha256, published=True,
    )
    # A schedule extension can reject commit after a candidate was uploaded.
    # Discover candidates, but validate every exact key/body before any deletion.
    manifests = {run.archive_manifest_key}
    try:
        pages = client.get_paginator("list_objects_v2").paginate(
            Bucket=settings.OBJECT_STORAGE_BUCKET,
            Prefix=f"runs/{run.id}/resident-revision-",
        )
        for page in pages:
            for item in page.get("Contents", []):
                key = item.get("Key")
                if type(key) is not str:
                    raise IntegrityEvidenceStorageError("archive manifest identity is invalid")
                if key in manifests:
                    continue
                if len(manifests) >= _MAX_ARCHIVE_GENERATIONS:
                    raise IntegrityEvidenceStorageError("archive manifest chain is too long")
                digest = key.rsplit("/", 1)[-1].removesuffix(".json")
                keys.update(_load_resident_manifest(client, run, key, digest, published=False))
                manifests.add(key)
                if len(keys) > _MAX_PURGE_KEYS:
                    raise IntegrityEvidenceStorageError("integrity purge key set is too large")
    except (BotoCoreError, ClientError):
        raise IntegrityEvidenceStorageError("archive candidates could not be listed") from None
    return keys


def _load_archive_manifest_chain(
    client,
    run: ExamIntegrityRun,
) -> set[str]:
    if (
        type(run.archive_manifest_key) is str
        and run.archive_manifest_key.startswith(f"runs/{run.id}/resident-revision-")
    ):
        return _load_resident_archive_manifest(client, run)
    key = run.archive_manifest_key
    digest = run.archive_manifest_sha256
    generation = run.archive_generation
    keys: set[str] = set()
    visited = set()
    loaded_key_count = 0
    if type(generation) is not int or not 1 <= generation <= _MAX_ARCHIVE_GENERATIONS:
        raise IntegrityEvidenceStorageError("archive manifest identity is invalid")
    for _ in range(_MAX_ARCHIVE_GENERATIONS):
        if (
            type(generation) is not int
            or generation < 1
            or key != _expected_manifest_key(run.id, generation)
            or type(digest) is not str
            or not _SHA256_RE.fullmatch(digest)
            or key in visited
        ):
            raise IntegrityEvidenceStorageError("archive manifest identity is invalid")
        visited.add(key)
        payload = _read_archive_manifest(client, key, digest)
        if (
            type(payload) is not dict
            or payload.get("schema_version") != 1
            or payload.get("run_id") != str(run.id)
            or payload.get("generation") != generation
            or type(payload.get("segments")) is not list
        ):
            raise IntegrityEvidenceStorageError("archive manifest payload is invalid")
        segments = payload["segments"]
        if len(segments) + 1 > _MAX_PURGE_KEYS - loaded_key_count:
            raise IntegrityEvidenceStorageError("integrity purge key set is too large")
        prefix = _expected_segment_prefix(run.id, generation)
        for segment in segments:
            object_key = segment.get("object_key") if type(segment) is dict else None
            suffix = (
                object_key[len(prefix) :]
                if type(object_key) is str and object_key.startswith(prefix)
                else ""
            )
            if not re.fullmatch(r"[0-9]{8}\.journal\.gz", suffix):
                raise IntegrityEvidenceStorageError(
                    "archive segment identity is invalid"
                )
            keys.add(object_key)
        keys.add(key)
        loaded_key_count += len(segments) + 1
        if (
            "previous_manifest" not in payload
            or "previous_manifest_sha256" not in payload
        ):
            raise IntegrityEvidenceStorageError("archive manifest chain is invalid")
        previous = payload["previous_manifest"]
        previous_digest = payload["previous_manifest_sha256"]
        if generation == 1:
            if previous is not None or previous_digest is not None:
                raise IntegrityEvidenceStorageError("archive manifest chain is invalid")
            return keys
        if (
            type(previous) is not dict
            or set(previous) != {"generation", "object_key", "sha256"}
            or previous.get("generation") != generation - 1
            or previous.get("object_key")
            != _expected_manifest_key(run.id, generation - 1)
            or type(previous.get("sha256")) is not str
            or not _SHA256_RE.fullmatch(previous["sha256"])
            or type(previous_digest) is not str
            or not hmac.compare_digest(
                previous_digest,
                previous["sha256"],
            )
        ):
            raise IntegrityEvidenceStorageError("archive manifest chain is invalid")
        generation = previous.get("generation")
        key = previous.get("object_key")
        digest = previous.get("sha256")
    raise IntegrityEvidenceStorageError("archive manifest chain is too long")


def _delete_exact_keys(client, bucket: str, keys: list[str]) -> None:
    for offset in range(0, len(keys), _PURGE_BATCH_SIZE):
        batch = keys[offset : offset + _PURGE_BATCH_SIZE]
        try:
            response = client.delete_objects(
                Bucket=bucket,
                Delete={
                    "Objects": [{"Key": key} for key in batch],
                    "Quiet": True,
                },
            )
        except (BotoCoreError, ClientError):
            raise IntegrityEvidenceStorageError(
                "integrity object deletion failed"
            ) from None
        if type(response) is dict and response.get("Errors"):
            raise IntegrityEvidenceStorageError("integrity object deletion failed")


def _verify_exact_keys_absent(
    client,
    bucket: str,
    keys: list[str],
) -> None:
    for key in keys:
        try:
            client.head_object(
                Bucket=bucket,
                Key=key,
            )
        except ClientError as error:
            if _storage_error_code(error) in {
                "404",
                "NoSuchKey",
                "NotFound",
                "NoSuchBucket",
            }:
                continue
            raise IntegrityEvidenceStorageError(
                "integrity object purge verification failed"
            ) from None
        except BotoCoreError:
            raise IntegrityEvidenceStorageError(
                "integrity object purge verification failed"
            ) from None
        raise IntegrityEvidenceStorageError("integrity object remains after purge")


def _purge_receipt_keys(
    run: ExamIntegrityRun,
) -> tuple[list[str], list[str]] | None:
    metrics = run.metrics
    receipt = metrics.get("integrity_purge") if type(metrics) is dict else None
    if type(receipt) is not dict:
        return None
    archive_keys = receipt.get("archive_object_keys")
    evidence_keys = receipt.get("evidence_object_keys")
    canonical_objects = {
        "archive": archive_keys,
        "evidence": evidence_keys,
    }
    if (
        receipt.get("manifest_key") != run.archive_manifest_key
        or receipt.get("manifest_sha256") != run.archive_manifest_sha256
        or type(archive_keys) is not list
        or type(evidence_keys) is not list
        or not 1 <= len(archive_keys) + len(evidence_keys) <= _MAX_PURGE_KEYS
        or any(
            type(key) is not str or not key for key in [*archive_keys, *evidence_keys]
        )
        or len(set(archive_keys)) != len(archive_keys)
        or len(set(evidence_keys)) != len(evidence_keys)
    ):
        raise IntegrityEvidenceStorageError("integrity purge receipt is invalid")
    expected_digest = hashlib.sha256(
        json.dumps(
            canonical_objects,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    if not hmac.compare_digest(
        str(receipt.get("object_keys_sha256") or ""),
        expected_digest,
    ):
        raise IntegrityEvidenceStorageError("integrity purge receipt is invalid")
    return archive_keys, evidence_keys


def _persist_purge_receipt(
    run: ExamIntegrityRun,
    archive_keys: list[str],
) -> list[str]:
    with transaction.atomic():
        locked = ExamIntegrityRun.objects.select_for_update().get(pk=run.pk)
        if (
            locked.session_state not in {
                ExamIntegrityRun.SessionState.ARCHIVED,
                ExamIntegrityRun.SessionState.CLOSED,
            }
            or locked.data_state != ExamIntegrityRun.DataState.ARCHIVED
            or locked.archive_manifest_key != run.archive_manifest_key
            or locked.archive_manifest_sha256 != run.archive_manifest_sha256
        ):
            raise IntegrityEvidenceStorageError("archive manifest changed during purge")
        evidence_rows = list(
            ExamEvidenceChunk.objects.filter(integrity_run=locked).only(
                "object_key",
                "metadata",
            )
        )
        now_ms = int(timezone.now().timestamp() * 1000)
        for evidence_row in evidence_rows:
            metadata = (
                evidence_row.metadata if type(evidence_row.metadata) is dict else {}
            )
            expires_at_ms = metadata.get("upload_url_expires_at_ms")
            if expires_at_ms is None:
                continue
            if type(expires_at_ms) is not int or expires_at_ms < 0:
                raise IntegrityEvidenceStorageError("evidence upload lease is invalid")
            if expires_at_ms > now_ms:
                raise IntegrityEvidenceStorageError(
                    "evidence upload lease is still active"
                )
        evidence_keys = sorted(
            {
                evidence_row.object_key
                for evidence_row in evidence_rows
                if evidence_row.object_key
            }
        )
        if len(archive_keys) + len(evidence_keys) > _MAX_PURGE_KEYS:
            raise IntegrityEvidenceStorageError("integrity purge key set is too large")
        metrics = dict(locked.metrics) if type(locked.metrics) is dict else {}
        metrics["integrity_purge"] = {
            "manifest_key": run.archive_manifest_key,
            "manifest_sha256": run.archive_manifest_sha256,
            "archive_object_keys": archive_keys,
            "evidence_object_keys": evidence_keys,
            "object_keys_sha256": hashlib.sha256(
                json.dumps(
                    {
                        "archive": archive_keys,
                        "evidence": evidence_keys,
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                    sort_keys=True,
                ).encode("utf-8")
            ).hexdigest(),
        }
        locked.metrics = metrics
        locked.save(update_fields=["metrics"])
        run.metrics = metrics
        return evidence_keys
