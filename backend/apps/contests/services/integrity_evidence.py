"""Incident-only evidence projection, direct upload, and exact-key purge."""
from __future__ import annotations

import base64
import hmac
from uuid import UUID, NAMESPACE_URL, uuid5

from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvidenceChunk,
    ExamEvent,
    ExamIntegrityRun,
    IntegrityBatchAdmission,
)
from apps.contests.services.anticheat_storage import (
    generate_evidence_chunk_put_url,
    get_s3_client,
)
from apps.contests.services.integrity_evidence_descriptors import (
    _chunk_object_key,
    _descriptor_fields_match,
    _descriptor_identity,
    _descriptor_overlaps,
    _enforce_incident_source_budget,
    _merged_association_metadata,
    _row_identity,
    _validate_descriptor_chain,
    _validate_persisted_chain_neighbors,
)
from apps.contests.services.integrity_evidence_purge import (
    _delete_exact_keys,
    _load_archive_manifest_chain,
    _persist_purge_receipt,
    _purge_receipt_keys,
    _storage_error_code,
    _verify_exact_keys_absent,
)
from apps.contests.services.integrity_evidence_windows import (
    EvidenceDelivery,
    EvidenceRetainWindow,
    IntegrityEvidenceRejected,
    IntegrityEvidenceStorageError,
    _SOURCE_KINDS,
    _TERMINAL_CHUNK_STATUSES,
    _UNAVAILABLE_MARKERS_KEY,
    _UNAVAILABLE_MARKER_VERSION,
    _evidence_retain_windows_for_events,
    _nonnegative_int,
    _participant_incident_events,
    _source_has_terminal_coverage,
    _unavailable_marker_signature,
    _unavailable_markers_from_events,
)

# Re-exported: existing importers resolve these names through this module.
from apps.contests.services.integrity_evidence_status import (  # noqa: F401
    evidence_chunks_for_event,
    evidence_status_for_event,
    evidence_statuses_for_events,
)
from apps.contests.services.integrity_evidence_windows import (  # noqa: F401
    _enabled_sources,
    evidence_retain_windows,
)


def _retain_command(
    run: ExamIntegrityRun,
    window: EvidenceRetainWindow,
) -> dict[str, object]:
    identity = ":".join(
        (
            str(run.id),
            str(window.incident_id),
            str(window.event_id),
            ",".join(window.sources),
            str(window.start_at_ms),
            str(window.end_at_ms),
        )
    )
    return {
        "command_id": str(uuid5(NAMESPACE_URL, f"qjudge:retain-evidence:{identity}")),
        "incident_id": str(window.incident_id),
        "event_id": str(window.event_id),
        "sources": list(window.sources),
        "start_at_ms": window.start_at_ms,
        "end_at_ms": window.end_at_ms,
    }


def build_evidence_delivery(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    now_ms: int,
    upload_scope=None,
) -> EvidenceDelivery:
    """Return the replay-safe pending retain projection and release watermark."""

    if type(now_ms) is not int or now_ms < 0:
        raise ValueError("now_ms must be a nonnegative integer")
    events = (_owned_evidence_events(run, participant, upload_scope) if upload_scope is not None
        else list(_participant_incident_events(run, participant)))
    windows = _evidence_retain_windows_for_events(
        run,
        events,
        after_ms=0,
    )
    unavailable_markers = _unavailable_markers_from_events(events)
    chunks = list(
        ExamEvidenceChunk.objects.filter(
            integrity_run=run,
            participant=participant,
        )
    )
    if upload_scope is not None:
        event_ids = {event.pk for event in events}
        chunks = [chunk for chunk in chunks if chunk.exam_event_id in event_ids]
    unresolved = []
    for window in windows:
        unresolved_sources = tuple(
            source
            for source in window.sources
            if not _source_has_terminal_coverage(
                run,
                window,
                chunks,
                unavailable_markers,
                source,
            )
        )
        if unresolved_sources:
            unresolved.append(
                EvidenceRetainWindow(
                    incident_id=window.incident_id,
                    event_id=window.event_id,
                    sources=unresolved_sources,
                    start_at_ms=window.start_at_ms,
                    end_at_ms=window.end_at_ms,
                    max_segment_ms=window.max_segment_ms,
                )
            )
    policy = run.policy_snapshot if type(run.policy_snapshot) is dict else {}
    evidence_policy = policy.get("evidence")
    minimum_buffer_ms = (
        _nonnegative_int(evidence_policy.get("minimum_local_buffer_ms"))
        if type(evidence_policy) is dict
        else None
    )
    if minimum_buffer_ms is None:
        minimum_buffer_ms = 60_000
    release_before_ms = max(0, now_ms - minimum_buffer_ms)
    if unresolved:
        release_before_ms = min(
            release_before_ms,
            min(window.start_at_ms for window in unresolved),
        )
    return EvidenceDelivery(
        pending_commands=tuple(_retain_command(run, window) for window in unresolved),
        release_before_ms=release_before_ms,
    )


def _lock_evidence_scope(run, participant, upload_scope):
    """Caller owns an atomic block; release no authorization lock before writing."""
    from .exam_schedule import lock_exam_runs
    from .integrity_upload_grants import admit_checkpoint

    Contest.objects.select_for_update().get(pk=run.contest_id)
    lock_exam_runs(run.contest_id)
    run = ExamIntegrityRun.objects.select_for_update().get(pk=run.pk)
    participant = ContestParticipant.objects.select_for_update().get(
        pk=participant.pk, contest_id=run.contest_id)
    if upload_scope is None:
        raise PermissionDenied("Resident evidence requires the trusted upload scope.")
    run, participant, _ = admit_checkpoint(run.contest, participant, upload_scope, None,
        request_device=upload_scope["device_id"], has_evidence=True)
    return run, participant


def _resident_event_owner(run, participant, event):
    """Historical ownership comes only from the immutable gateway admission."""
    if (event.integrity_run_id != run.pk or event.contest_id != run.contest_id
            or event.user_id != participant.user_id):
        return None
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    integrity = metadata.get("integrity", {})
    if not isinstance(integrity, dict) or integrity.get("late_unverified") is True:
        return None
    try:
        batch_id = UUID(str(metadata.get("receipt_batch_id")))
    except (ValueError, TypeError):
        return None
    admission = IntegrityBatchAdmission.objects.filter(run=run, participant=participant,
        batch_id=batch_id, late_unverified=False).first()
    if admission is None or integrity.get("device_id") != admission.device_id:
        return None
    owner = {"device_id": admission.device_id, "attempt_id": str(admission.attempt_id)}
    if integrity.get("attempt_id", owner["attempt_id"]) != owner["attempt_id"]:
        return None
    return owner


def _require_evidence_owner(run, participant, upload_scope, event, chunk=None):
    owner = _resident_event_owner(run, participant, event)
    expected = None if upload_scope is None else {
        "device_id": upload_scope["device_id"], "attempt_id": str(upload_scope["attempt_id"])}
    if owner is None or owner != expected:
        raise PermissionDenied("Evidence device or attempt scope mismatch.")
    if chunk is not None:
        metadata = chunk.metadata if isinstance(chunk.metadata, dict) else {}
        if (chunk.integrity_run_id != run.pk or chunk.participant_id != participant.pk
                or metadata.get("integrity_upload_scope", owner) != owner):
            raise PermissionDenied("Evidence chunk ownership mismatch.")
    return owner


def _owned_evidence_events(run, participant, upload_scope):
    events = _participant_incident_events(run, participant)
    owner = {"device_id": upload_scope["device_id"], "attempt_id": str(upload_scope["attempt_id"])}
    return [event for event in events if _resident_event_owner(run, participant, event) == owner]


def create_evidence_manifest(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    event: ExamEvent,
    descriptors: list[dict[str, object]],
    *,
    upload_scope=None,
) -> list[dict[str, object]]:
    """Upsert selected physical chunks and return checksum-bound PUT actions."""

    _validate_descriptor_chain(descriptors)
    inventory = {
        (
            descriptor["source"],
            descriptor["recording_session_id"],
            descriptor["chunk_seq"],
        ): descriptor
        for descriptor in descriptors
    }
    with transaction.atomic():
        locked_run, participant = _lock_evidence_scope(run, participant, upload_scope)
        event = ExamEvent.objects.select_for_update().get(pk=event.pk)
        owner = _require_evidence_owner(locked_run, participant, upload_scope, event)
        if (
            locked_run.session_state not in {"active", "draining"}
            or locked_run.data_state != ExamIntegrityRun.DataState.OPEN
        ):
            raise IntegrityEvidenceRejected("evidence_run_not_accepting_uploads")
        ContestParticipant.objects.select_for_update().only("pk").get(
            pk=participant.pk,
            contest_id=locked_run.contest_id,
        )
        windows = [
            window
            for window in _evidence_retain_windows_for_events(
                locked_run,
                _owned_evidence_events(locked_run, participant, upload_scope),
                after_ms=0,
            )
            if window.incident_id == event.incident_id
        ]
        required_sources = {source for window in windows for source in window.sources}
        for descriptor in descriptors:
            if descriptor["source"] not in required_sources:
                raise IntegrityEvidenceRejected("evidence_source_disabled")
        selected = [
            descriptor
            for descriptor in descriptors
            if _descriptor_overlaps(descriptor, windows)
        ]
        existing_rows = list(
            ExamEvidenceChunk.objects.select_for_update().filter(
                integrity_run=locked_run,
                participant=participant,
            )
        )
        _enforce_incident_source_budget(
            locked_run,
            event,
            selected,
            existing_rows,
        )
        # Five-second MediaRecorder chunks are independently decodable. Their
        # hash links verify any immediate neighbor that is available, but do
        # not promote unrelated recording history into incident evidence.
        for descriptor in selected:
            submitted_predecessor = inventory.get(
                (
                    descriptor["source"],
                    descriptor["recording_session_id"],
                    int(descriptor["chunk_seq"]) - 1,
                )
            )
            _validate_persisted_chain_neighbors(
                locked_run,
                participant,
                descriptor,
                submitted_predecessor,
                existing_rows,
            )
        existing_by_identity = {_row_identity(row): row for row in existing_rows}
        rows: list[ExamEvidenceChunk] = []
        for descriptor in selected:
            lookup = {
                "integrity_run": locked_run,
                "participant": participant,
                "source": descriptor["source"],
                "recording_session_id": descriptor["recording_session_id"],
                "chunk_seq": descriptor["chunk_seq"],
            }
            row = existing_by_identity.get(_descriptor_identity(descriptor))
            if row is not None:
                _require_evidence_owner(locked_run, participant, upload_scope, row.exam_event, row)
            if row is not None and not _descriptor_fields_match(
                row,
                descriptor,
            ):
                raise IntegrityEvidenceRejected("evidence_chunk_identity_conflict")
            if row is None:
                row = ExamEvidenceChunk.objects.create(
                    **lookup,
                    contest=locked_run.contest,
                    exam_event=event,
                    incident_id=event.incident_id,
                    is_init_chunk=descriptor["is_init_chunk"],
                    start_at_ms=descriptor["start_at_ms"],
                    end_at_ms=descriptor["end_at_ms"],
                    object_key=_chunk_object_key(
                        locked_run,
                        participant,
                        event,
                        descriptor,
                    ),
                    content_type=descriptor["content_type"],
                    codec=descriptor["codec"],
                    byte_size=descriptor["byte_size"],
                    sha256=descriptor["sha256"],
                    previous_sha256=descriptor["previous_sha256"],
                    metadata={**_merged_association_metadata(
                        None,
                        event,
                        descriptor,
                    ), **({"integrity_upload_scope": owner} if owner else {})},
                )
            else:
                metadata = _merged_association_metadata(
                    row,
                    event,
                    descriptor,
                )
                if owner:
                    metadata["integrity_upload_scope"] = owner
                if metadata != row.metadata:
                    row.metadata = metadata
                    row.save(update_fields=["metadata"])
            rows.append(row)
        rows.sort(
            key=lambda row: (
                row.source,
                str(row.recording_session_id),
                row.chunk_seq,
            ),
        )
        client = get_s3_client(
            endpoint_url=(settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or "").strip()
            or None
        )
        upload_ttl_seconds = settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS
        if type(upload_ttl_seconds) is not int or upload_ttl_seconds < 1:
            raise IntegrityEvidenceStorageError("evidence upload signing failed")
        uploads = []
        for row in rows:
            if row.status in _TERMINAL_CHUNK_STATUSES:
                put_url = None
                required_headers: dict[str, str] = {}
            else:
                try:
                    put_url, checksum = generate_evidence_chunk_put_url(
                        settings.OBJECT_STORAGE_BUCKET,
                        row.object_key,
                        content_type=row.content_type,
                        byte_size=row.byte_size,
                        sha256=row.sha256,
                        expires_seconds=upload_ttl_seconds,
                        client=client,
                    )
                except (BotoCoreError, ClientError, ValueError):
                    raise IntegrityEvidenceStorageError(
                        "evidence upload signing failed"
                    ) from None
                metadata = dict(row.metadata) if type(row.metadata) is dict else {}
                metadata["upload_url_expires_at_ms"] = (
                    int(timezone.now().timestamp() * 1000) + upload_ttl_seconds * 1000
                )
                row.metadata = metadata
                row.save(update_fields=["metadata"])
                required_headers = {
                    "Content-Type": row.content_type,
                    "x-amz-checksum-sha256": checksum,
                }
            uploads.append(
                {
                    "chunk_id": str(row.id),
                    "chunk_seq": row.chunk_seq,
                    "source": row.source,
                    "object_key": row.object_key,
                    "status": row.status,
                    "put_url": put_url,
                    "required_headers": required_headers,
                }
            )
        return uploads


def complete_evidence_chunk(
    chunk: ExamEvidenceChunk,
    *,
    upload_scope=None,
) -> ExamEvidenceChunk:
    with transaction.atomic():
        run, participant = _lock_evidence_scope(chunk.integrity_run, chunk.participant, upload_scope)
        chunk = ExamEvidenceChunk.objects.select_for_update().get(pk=chunk.pk)
        _require_evidence_owner(run, participant, upload_scope, chunk.exam_event, chunk)
        if chunk.status == ExamEvidenceChunk.Status.VERIFIED:
            return chunk
    client = get_s3_client()
    try:
        head = client.head_object(
            Bucket=settings.OBJECT_STORAGE_BUCKET,
            Key=chunk.object_key,
            ChecksumMode="ENABLED",
        )
    except ClientError as error:
        if _storage_error_code(error) in {
            "404",
            "NoSuchKey",
            "NotFound",
            "NoSuchBucket",
        }:
            raise IntegrityEvidenceRejected("evidence_object_not_found") from None
        raise IntegrityEvidenceStorageError(
            "evidence storage validation failed"
        ) from None
    except BotoCoreError:
        raise IntegrityEvidenceStorageError(
            "evidence storage validation failed"
        ) from None

    expected_checksum = base64.b64encode(bytes.fromhex(chunk.sha256)).decode("ascii")
    length_matches = (
        type(head.get("ContentLength")) is int
        and head["ContentLength"] == chunk.byte_size
    )
    checksum = head.get("ChecksumSHA256")
    checksum_matches = type(checksum) is str and hmac.compare_digest(
        checksum, expected_checksum
    )
    now = timezone.now()
    mismatch = not length_matches or not checksum_matches
    with transaction.atomic():
        run, participant = _lock_evidence_scope(run, participant, upload_scope)
        locked = ExamEvidenceChunk.objects.select_for_update().get(pk=chunk.pk)
        owner = _require_evidence_owner(run, participant, upload_scope, locked.exam_event, locked)
        if locked.status == ExamEvidenceChunk.Status.VERIFIED:
            return locked
        if mismatch:
            locked.status = ExamEvidenceChunk.Status.FAILED
            locked.save(update_fields=["status"])
        else:
            locked.status = ExamEvidenceChunk.Status.VERIFIED
            locked.uploaded_at = now
            locked.verified_at = now
            metadata = dict(locked.metadata) if type(locked.metadata) is dict else {}
            if owner:
                metadata["integrity_upload_scope"] = owner
            metadata["storage_head"] = {
                "byte_size": locked.byte_size,
                "checksum_sha256": expected_checksum,
            }
            locked.metadata = metadata
            locked.save(
                update_fields=[
                    "status",
                    "uploaded_at",
                    "verified_at",
                    "metadata",
                ]
            )
    if mismatch:
        raise IntegrityEvidenceRejected("evidence_checksum_mismatch")
    return locked


def report_evidence_unavailable(
    chunk: ExamEvidenceChunk,
    *,
    reason: str,
    upload_scope=None,
) -> ExamEvidenceChunk:
    with transaction.atomic():
        run, participant = _lock_evidence_scope(chunk.integrity_run, chunk.participant, upload_scope)
        locked = ExamEvidenceChunk.objects.select_for_update().get(pk=chunk.pk)
        owner = _require_evidence_owner(run, participant, upload_scope, locked.exam_event, locked)
        if locked.status == ExamEvidenceChunk.Status.VERIFIED:
            raise IntegrityEvidenceRejected("verified_evidence_cannot_be_unavailable")
        metadata = dict(locked.metadata) if type(locked.metadata) is dict else {}
        if owner:
            metadata["integrity_upload_scope"] = owner
        metadata["unavailable_reason"] = reason
        metadata["unavailable_reported_at"] = timezone.now().isoformat()
        locked.status = ExamEvidenceChunk.Status.UNAVAILABLE
        locked.metadata = metadata
        locked.save(update_fields=["status", "metadata"])
        return locked


def report_evidence_unavailable_projection(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    event: ExamEvent,
    *,
    source: str,
    reason: str,
    upload_scope=None,
) -> tuple[dict[str, object], ...]:
    """Record server-signed terminal coverage when no media chunk exists."""

    if type(source) is not str or source not in _SOURCE_KINDS:
        raise IntegrityEvidenceRejected("evidence_source_disabled")
    if type(reason) is not str or not 1 <= len(reason) <= 256:
        raise IntegrityEvidenceRejected("invalid_evidence_unavailable_reason")
    with transaction.atomic():
        locked_run, participant = _lock_evidence_scope(run, participant, upload_scope)
        if (
            locked_run.session_state not in {"active", "draining"}
            or locked_run.data_state != ExamIntegrityRun.DataState.OPEN
        ):
            raise IntegrityEvidenceRejected("evidence_run_not_accepting_uploads")
        ContestParticipant.objects.select_for_update().only("pk").get(
            pk=participant.pk,
            contest_id=locked_run.contest_id,
        )
        locked_event = (
            ExamEvent.objects.select_for_update()
            .filter(
                pk=event.pk,
                integrity_run=locked_run,
                contest_id=locked_run.contest_id,
                user_id=participant.user_id,
                incident_id=event.incident_id,
            )
            .first()
        )
        if locked_event is None or locked_event.incident_id is None:
            raise IntegrityEvidenceRejected("evidence_projection_not_found")
        _require_evidence_owner(locked_run, participant, upload_scope, locked_event)
        events = list(_owned_evidence_events(locked_run, participant, upload_scope))
        windows = [
            window
            for window in _evidence_retain_windows_for_events(
                locked_run,
                events,
                after_ms=0,
            )
            if (
                window.incident_id == locked_event.incident_id
                and window.event_id == locked_event.id
                and source in window.sources
            )
        ]
        if not windows:
            raise IntegrityEvidenceRejected("evidence_source_disabled")

        metadata = (
            dict(locked_event.metadata) if type(locked_event.metadata) is dict else {}
        )
        existing = _unavailable_markers_from_events([locked_event])
        existing_by_window = {
            (
                marker["run_id"],
                marker["participant_id"],
                marker["incident_id"],
                marker["event_id"],
                marker["source"],
                marker["start_at_ms"],
                marker["end_at_ms"],
            ): marker
            for marker in existing
        }
        for window in windows:
            identity = (
                str(locked_run.id),
                participant.id,
                str(window.incident_id),
                window.event_id,
                source,
                window.start_at_ms,
                window.end_at_ms,
            )
            if identity in existing_by_window:
                continue
            payload = {
                "version": _UNAVAILABLE_MARKER_VERSION,
                "run_id": str(locked_run.id),
                "participant_id": participant.id,
                "incident_id": str(window.incident_id),
                "event_id": window.event_id,
                "source": source,
                "start_at_ms": window.start_at_ms,
                "end_at_ms": window.end_at_ms,
                "reason": reason,
            }
            existing_by_window[identity] = payload

        stored_markers = []
        for marker in sorted(
            existing_by_window.values(),
            key=lambda item: (
                str(item["incident_id"]),
                item["event_id"],
                item["source"],
                item["start_at_ms"],
                item["end_at_ms"],
            ),
        ):
            stored_markers.append(
                {
                    **marker,
                    "signature": _unavailable_marker_signature(marker),
                }
            )
        metadata[_UNAVAILABLE_MARKERS_KEY] = stored_markers
        locked_event.metadata = metadata
        locked_event.save(update_fields=["metadata"])
        return tuple(
            marker
            for marker in existing_by_window.values()
            if (
                marker["run_id"] == str(locked_run.id)
                and marker["participant_id"] == participant.id
                and marker["incident_id"] == str(locked_event.incident_id)
                and marker["event_id"] == locked_event.id
                and marker["source"] == source
            )
        )


def purge_integrity_data(run: ExamIntegrityRun) -> None:
    """Delete only verified manifest keys and exact chunk keys for one Run."""

    client = get_s3_client()
    receipt = _purge_receipt_keys(run)
    if receipt is None:
        archive_keys = sorted(_load_archive_manifest_chain(client, run))
        evidence_keys = _persist_purge_receipt(run, archive_keys)
    else:
        archive_keys, evidence_keys = receipt
    _delete_exact_keys(
        client,
        settings.OBJECT_STORAGE_BUCKET,
        archive_keys,
    )
    _delete_exact_keys(
        client,
        settings.OBJECT_STORAGE_BUCKET,
        evidence_keys,
    )
    _verify_exact_keys_absent(
        client,
        settings.OBJECT_STORAGE_BUCKET,
        archive_keys,
    )
    _verify_exact_keys_absent(
        client,
        settings.OBJECT_STORAGE_BUCKET,
        evidence_keys,
    )
    with transaction.atomic():
        ExamEvidenceChunk.objects.filter(integrity_run=run).delete()
