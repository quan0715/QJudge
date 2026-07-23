"""Incident-only evidence projection, direct upload, and exact-key purge."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
from dataclasses import dataclass
from typing import Iterable
from uuid import UUID, NAMESPACE_URL, uuid5

from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.contests.models import (
    ContestParticipant,
    ExamEvidenceChunk,
    ExamEvent,
    ExamIntegrityRun,
)
from apps.contests.services.anticheat_storage import (
    generate_evidence_chunk_put_url,
    get_s3_client,
)


_SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
_SOURCE_KINDS = frozenset(
    {
        ExamEvidenceChunk.Source.SCREEN,
        ExamEvidenceChunk.Source.WEBCAM,
    }
)
_TERMINAL_CHUNK_STATUSES = frozenset(
    {
        ExamEvidenceChunk.Status.VERIFIED,
        ExamEvidenceChunk.Status.UNAVAILABLE,
    }
)
_MANIFEST_MAX_BYTES = 10 * 1024 * 1024
_PURGE_BATCH_SIZE = 500
_MAX_ARCHIVE_GENERATIONS = 1_000
_MAX_PURGE_KEYS = 100_000


class IntegrityEvidenceRejected(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class IntegrityEvidenceStorageError(RuntimeError):
    pass


@dataclass(frozen=True)
class EvidenceRetainWindow:
    incident_id: UUID
    event_id: int
    sources: tuple[str, ...]
    start_at_ms: int
    end_at_ms: int
    max_segment_ms: int


@dataclass(frozen=True)
class EvidenceDelivery:
    pending_commands: tuple[dict[str, object], ...]
    release_before_ms: int


@dataclass(frozen=True)
class _RawWindow:
    incident_id: UUID
    event_id: int
    source: str
    start_at_ms: int
    end_at_ms: int
    max_segment_ms: int


def _nonnegative_int(value: object) -> int | None:
    if type(value) is not int or value < 0:
        return None
    return value


def _event_definition(
    run: ExamIntegrityRun,
    event: ExamEvent,
) -> dict[str, object] | None:
    snapshot = run.registry_snapshot
    if (
        type(snapshot) is not dict
        or snapshot.get("version") != run.registry_version
        or type(snapshot.get("definitions")) is not dict
    ):
        return None
    definitions = snapshot["definitions"]
    metadata = event.metadata if type(event.metadata) is dict else {}
    integrity = metadata.get("integrity")
    definition_id = (
        integrity.get("definition_id")
        if type(integrity) is dict
        else None
    )
    if type(definition_id) is str:
        definition = definitions.get(definition_id)
        if type(definition) is dict:
            return definition
    for definition in definitions.values():
        if type(definition) is not dict:
            continue
        signals = definition.get("signals")
        if (
            type(signals) is dict
            and event.event_type in {
                value for value in signals.values() if type(value) is str
            }
        ):
            return definition
    return None


def _source_enabled(
    run: ExamIntegrityRun,
    event: ExamEvent,
    source: str,
) -> bool:
    policy = run.policy_snapshot
    if type(policy) is not dict:
        return False
    device_policy = policy.get("device_policy")
    if type(device_policy) is not dict:
        return False
    metadata = event.metadata if type(event.metadata) is dict else {}
    device_kind = metadata.get("device_kind")
    if type(device_kind) is str and device_kind:
        devices: Iterable[object] = (device_policy.get(device_kind),)
    else:
        devices = device_policy.values()
    for device in devices:
        if type(device) is not dict or device.get("enabled") is not True:
            continue
        sources = device.get("sources")
        source_policy = (
            sources.get(source)
            if type(sources) is dict
            else None
        )
        if type(source_policy) is dict and source_policy.get("enabled") is True:
            return True
    return False


def _raw_window(
    run: ExamIntegrityRun,
    event: ExamEvent,
) -> tuple[_RawWindow, ...]:
    if (
        event.incident_id is None
        or event.client_occurred_at_ms is None
        or event.integrity_run_id != run.id
    ):
        return ()
    definition = _event_definition(run, event)
    if definition is None:
        return ()
    evidence = definition.get("evidence")
    if type(evidence) is not dict or evidence.get("mode") != "incident_window":
        return ()
    raw_sources = evidence.get("sources")
    before_ms = _nonnegative_int(evidence.get("before_ms"))
    after_ms = _nonnegative_int(evidence.get("after_ms"))
    max_segment_ms = _nonnegative_int(evidence.get("max_segment_ms"))
    if (
        type(raw_sources) is not list
        or before_ms is None
        or after_ms is None
        or max_segment_ms is None
        or max_segment_ms < 1
    ):
        return ()
    anchor_ms = _nonnegative_int(event.client_occurred_at_ms)
    if anchor_ms is None:
        return ()
    start_at_ms = max(0, anchor_ms - before_ms)
    end_at_ms = anchor_ms + after_ms
    if end_at_ms <= start_at_ms:
        return ()
    resolved = []
    for source in raw_sources:
        if (
            type(source) is str
            and source in _SOURCE_KINDS
            and _source_enabled(run, event, source)
        ):
            resolved.append(
                _RawWindow(
                    incident_id=event.incident_id,
                    event_id=event.id,
                    source=source,
                    start_at_ms=start_at_ms,
                    end_at_ms=end_at_ms,
                    max_segment_ms=max_segment_ms,
                )
            )
    return tuple(resolved)


def _evidence_retain_windows_for_events(
    run: ExamIntegrityRun,
    events: Iterable[ExamEvent],
    after_ms: int,
) -> list[EvidenceRetainWindow]:
    if type(after_ms) is not int or after_ms < 0:
        raise ValueError("after_ms must be a nonnegative integer")
    registry = run.registry_snapshot
    if (
        type(registry) is not dict
        or registry.get("version") != run.registry_version
        or type(registry.get("definitions")) is not dict
    ):
        raise IntegrityEvidenceRejected("invalid_frozen_registry")
    policy = run.policy_snapshot
    if (
        type(policy) is not dict
        or type(policy.get("device_policy")) is not dict
    ):
        raise IntegrityEvidenceRejected("invalid_frozen_policy")
    by_source: dict[str, list[_RawWindow]] = {}
    for event in events:
        for window in _raw_window(run, event):
            by_source.setdefault(window.source, []).append(window)

    projected: list[tuple[UUID, int, str, int, int, int]] = []
    for source, source_windows in sorted(by_source.items()):
        source_windows.sort(
            key=lambda item: (
                item.start_at_ms,
                item.end_at_ms,
                str(item.incident_id),
                item.event_id,
            )
        )
        components: list[tuple[int, int, int, list[_RawWindow]]] = []
        for window in source_windows:
            if not components or window.start_at_ms > components[-1][1]:
                components.append(
                    (
                        window.start_at_ms,
                        window.end_at_ms,
                        min(window.max_segment_ms, 60_000),
                        [window],
                    )
                )
                continue
            start, end, max_segment, associations = components[-1]
            components[-1] = (
                start,
                max(end, window.end_at_ms),
                min(max_segment, window.max_segment_ms, 60_000),
                [*associations, window],
            )

        for start, end, max_segment, associations in components:
            segment_start = start
            while segment_start < end:
                segment_end = min(end, segment_start + max_segment)
                if segment_end > after_ms:
                    for association in associations:
                        projected.append(
                            (
                                association.incident_id,
                                association.event_id,
                                source,
                                segment_start,
                                segment_end,
                                max_segment,
                            )
                        )
                segment_start = segment_end

    combined: dict[
        tuple[UUID, int, int, int, int],
        set[str],
    ] = {}
    for incident_id, event_id, source, start, end, max_segment in projected:
        combined.setdefault(
            (incident_id, event_id, start, end, max_segment),
            set(),
        ).add(source)
    return [
        EvidenceRetainWindow(
            incident_id=incident_id,
            event_id=event_id,
            sources=tuple(sorted(sources)),
            start_at_ms=start,
            end_at_ms=end,
            max_segment_ms=max_segment,
        )
        for (
            incident_id,
            event_id,
            start,
            end,
            max_segment,
        ), sources in sorted(
            combined.items(),
            key=lambda item: (
                item[0][2],
                item[0][3],
                str(item[0][0]),
                item[0][1],
            ),
        )
    ]


def evidence_retain_windows(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    after_ms: int,
) -> list[EvidenceRetainWindow]:
    """Rebuild retain windows from normalized events and the frozen registry."""

    events = (
        ExamEvent.objects.filter(
            integrity_run=run,
            contest_id=run.contest_id,
            user_id=participant.user_id,
            incident_id__isnull=False,
        )
        .order_by("client_occurred_at_ms", "id")
    )
    return _evidence_retain_windows_for_events(run, events, after_ms)


def _metadata_ids(metadata: object, key: str) -> tuple[object, ...]:
    if type(metadata) is not dict:
        return ()
    values = metadata.get(key)
    return tuple(values) if type(values) is list else ()


def _chunk_matches_window(
    chunk: ExamEvidenceChunk,
    window: EvidenceRetainWindow,
) -> bool:
    incident_ids = _metadata_ids(chunk.metadata, "incident_ids")
    return bool(
        chunk.source in window.sources
        and chunk.end_at_ms >= window.start_at_ms
        and chunk.start_at_ms <= window.end_at_ms
        and (
            chunk.incident_id == window.incident_id
            or str(window.incident_id) in incident_ids
        )
    )


def _source_has_terminal_coverage(
    window: EvidenceRetainWindow,
    chunks: list[ExamEvidenceChunk],
    source: str,
) -> bool:
    cursor = window.start_at_ms
    intervals = sorted(
        (
            max(chunk.start_at_ms, window.start_at_ms),
            min(chunk.end_at_ms, window.end_at_ms),
        )
        for chunk in chunks
        if (
            chunk.source == source
            and chunk.status in _TERMINAL_CHUNK_STATUSES
            and _chunk_matches_window(chunk, window)
        )
    )
    for start_at_ms, end_at_ms in intervals:
        if start_at_ms > cursor:
            return False
        cursor = max(cursor, end_at_ms)
        if cursor >= window.end_at_ms:
            return True
    return False


def _window_is_complete(
    window: EvidenceRetainWindow,
    chunks: list[ExamEvidenceChunk],
) -> bool:
    return all(
        _source_has_terminal_coverage(window, chunks, source)
        for source in window.sources
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
        "command_id": str(
            uuid5(NAMESPACE_URL, f"qjudge:retain-evidence:{identity}")
        ),
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
) -> EvidenceDelivery:
    """Return the replay-safe pending retain projection and release watermark."""

    if type(now_ms) is not int or now_ms < 0:
        raise ValueError("now_ms must be a nonnegative integer")
    windows = evidence_retain_windows(run, participant, after_ms=0)
    chunks = list(
        ExamEvidenceChunk.objects.filter(
            integrity_run=run,
            participant=participant,
        )
    )
    unresolved = [
        window
        for window in windows
        if not _window_is_complete(window, chunks)
    ]
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
        pending_commands=tuple(
            _retain_command(run, window) for window in unresolved
        ),
        release_before_ms=release_before_ms,
    )


def _validate_descriptor_chain(
    descriptors: list[dict[str, object]],
) -> None:
    groups: dict[tuple[str, UUID], list[dict[str, object]]] = {}
    identities = set()
    for descriptor in descriptors:
        identity = (
            descriptor["source"],
            descriptor["recording_session_id"],
            descriptor["chunk_seq"],
        )
        if identity in identities:
            raise IntegrityEvidenceRejected("duplicate_evidence_chunk")
        identities.add(identity)
        groups.setdefault(
            (
                str(descriptor["source"]),
                descriptor["recording_session_id"],
            ),
            [],
        ).append(descriptor)
    for group in groups.values():
        group.sort(key=lambda item: int(item["chunk_seq"]))
        if sum(bool(item["is_init_chunk"]) for item in group) > 1:
            raise IntegrityEvidenceRejected(
                "evidence_chunk_chain_mismatch"
            )
        for descriptor in group:
            if (
                descriptor["is_init_chunk"]
                and descriptor["previous_sha256"]
            ) or (
                not descriptor["is_init_chunk"]
                and not descriptor["previous_sha256"]
            ):
                raise IntegrityEvidenceRejected(
                    "evidence_chunk_chain_mismatch"
                )
        for previous, current in zip(group, group[1:]):
            if int(current["chunk_seq"]) != int(previous["chunk_seq"]) + 1:
                continue
            if current["previous_sha256"] != previous["sha256"]:
                raise IntegrityEvidenceRejected(
                    "evidence_chunk_chain_mismatch"
                )


def _descriptor_overlaps(
    descriptor: dict[str, object],
    windows: list[EvidenceRetainWindow],
) -> bool:
    return any(
        descriptor["source"] in window.sources
        and int(descriptor["end_at_ms"]) >= window.start_at_ms
        and int(descriptor["start_at_ms"]) <= window.end_at_ms
        for window in windows
    )


def _descriptor_fields_match(
    row: ExamEvidenceChunk,
    descriptor: dict[str, object],
) -> bool:
    metadata = row.metadata if type(row.metadata) is dict else {}
    return bool(
        row.is_init_chunk is descriptor["is_init_chunk"]
        and row.start_at_ms == descriptor["start_at_ms"]
        and row.end_at_ms == descriptor["end_at_ms"]
        and row.content_type == descriptor["content_type"]
        and row.codec == descriptor["codec"]
        and row.byte_size == descriptor["byte_size"]
        and row.sha256 == descriptor["sha256"]
        and row.previous_sha256 == descriptor["previous_sha256"]
        and metadata.get("local_descriptor_id")
        == descriptor["local_descriptor_id"]
    )


def _descriptor_identity(
    descriptor: dict[str, object],
) -> tuple[str, UUID, int]:
    return (
        str(descriptor["source"]),
        descriptor["recording_session_id"],
        int(descriptor["chunk_seq"]),
    )


def _row_identity(
    row: ExamEvidenceChunk,
) -> tuple[str, UUID, int]:
    return (
        row.source,
        row.recording_session_id,
        row.chunk_seq,
    )


def _chunk_associated_with_incident(
    row: ExamEvidenceChunk,
    incident_id: UUID,
) -> bool:
    return bool(
        row.incident_id == incident_id
        or str(incident_id)
        in _metadata_ids(row.metadata, "incident_ids")
    )


def _enforce_incident_source_budget(
    run: ExamIntegrityRun,
    event: ExamEvent,
    descriptors: list[dict[str, object]],
    existing_rows: list[ExamEvidenceChunk],
) -> None:
    policy = run.policy_snapshot
    evidence = policy.get("evidence") if type(policy) is dict else None
    cap_bytes = (
        _nonnegative_int(evidence.get("local_cap_bytes_per_source"))
        if type(evidence) is dict
        else None
    )
    if cap_bytes is None or cap_bytes < 1:
        raise IntegrityEvidenceRejected("invalid_frozen_policy")
    existing_by_identity = {
        _row_identity(row): row for row in existing_rows
    }
    for source in {
        str(descriptor["source"]) for descriptor in descriptors
    }:
        bytes_by_identity = {
            _row_identity(row): row.byte_size
            for row in existing_rows
            if (
                row.source == source
                and _chunk_associated_with_incident(
                    row,
                    event.incident_id,
                )
            )
        }
        for descriptor in descriptors:
            if descriptor["source"] != source:
                continue
            identity = _descriptor_identity(descriptor)
            row = existing_by_identity.get(identity)
            bytes_by_identity[identity] = (
                row.byte_size
                if row is not None
                else int(descriptor["byte_size"])
            )
        if sum(bytes_by_identity.values()) > cap_bytes:
            raise IntegrityEvidenceRejected(
                "evidence_incident_source_limit_exceeded"
            )


def _validate_persisted_chain_neighbors(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    descriptor: dict[str, object],
    submitted_predecessor: dict[str, object] | None,
) -> None:
    chunk_seq = int(descriptor["chunk_seq"])
    neighbor_sequences = {chunk_seq + 1}
    if chunk_seq > 0:
        neighbor_sequences.add(chunk_seq - 1)
    neighbors = {
        row.chunk_seq: row
        for row in ExamEvidenceChunk.objects.select_for_update().filter(
            integrity_run=run,
            participant=participant,
            source=descriptor["source"],
            recording_session_id=descriptor["recording_session_id"],
            chunk_seq__in=neighbor_sequences,
        )
    }
    previous = neighbors.get(chunk_seq - 1)
    following = neighbors.get(chunk_seq + 1)
    if descriptor["is_init_chunk"]:
        another_init_exists = (
            ExamEvidenceChunk.objects.select_for_update()
            .filter(
                integrity_run=run,
                participant=participant,
                source=descriptor["source"],
                recording_session_id=descriptor[
                    "recording_session_id"
                ],
                is_init_chunk=True,
            )
            .exclude(chunk_seq=descriptor["chunk_seq"])
            .exists()
        )
        if (
            previous is not None
            or submitted_predecessor is not None
            or another_init_exists
        ):
            raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
    elif previous is None and submitted_predecessor is None:
        raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
    if (
        submitted_predecessor is not None
        and descriptor["previous_sha256"]
        != submitted_predecessor["sha256"]
    ):
        raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
    if (
        previous is not None
        and descriptor["previous_sha256"] != previous.sha256
    ):
        raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
    if (
        following is not None
        and following.previous_sha256 != descriptor["sha256"]
    ):
        raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")


def _merged_association_metadata(
    row: ExamEvidenceChunk | None,
    event: ExamEvent,
    descriptor: dict[str, object],
) -> dict[str, object]:
    metadata = (
        dict(row.metadata)
        if row is not None and type(row.metadata) is dict
        else {}
    )
    primary_incident = row.incident_id if row is not None else event.incident_id
    primary_event_id = row.exam_event_id if row is not None else event.id
    incident_ids = [
        str(value)
        for value in _metadata_ids(metadata, "incident_ids")
        if type(value) is str
    ]
    event_ids = [
        value
        for value in _metadata_ids(metadata, "event_ids")
        if type(value) is int
    ]
    for value in (str(primary_incident), str(event.incident_id)):
        if value not in incident_ids:
            incident_ids.append(value)
    for value in (primary_event_id, event.id):
        if value not in event_ids:
            event_ids.append(value)
    metadata.update(
        {
            "incident_ids": incident_ids,
            "event_ids": event_ids,
            "local_descriptor_id": descriptor["local_descriptor_id"],
        }
    )
    return metadata


def _chunk_object_key(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    event: ExamEvent,
    descriptor: dict[str, object],
) -> str:
    return (
        f"integrity/{run.contest_id}/{run.id}/{participant.id}/"
        f"{event.incident_id}/{descriptor['source']}/"
        f"{descriptor['recording_session_id']}/{descriptor['chunk_seq']}.webm"
    )


def create_evidence_manifest(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    event: ExamEvent,
    descriptors: list[dict[str, object]],
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
        locked_run = (
            ExamIntegrityRun.objects.select_for_update()
            .select_related("contest")
            .get(pk=run.pk)
        )
        if (
            locked_run.compute_state
            not in {
                ExamIntegrityRun.ComputeState.RUNNING,
                ExamIntegrityRun.ComputeState.STOPPING,
            }
            or locked_run.data_state != ExamIntegrityRun.DataState.OPEN
        ):
            raise IntegrityEvidenceRejected(
                "evidence_run_not_accepting_uploads"
            )
        ContestParticipant.objects.select_for_update().only("pk").get(
            pk=participant.pk,
            contest_id=locked_run.contest_id,
        )
        windows = [
            window
            for window in evidence_retain_windows(
                locked_run,
                participant,
                after_ms=0,
            )
            if window.incident_id == event.incident_id
        ]
        required_sources = {
            source for window in windows for source in window.sources
        }
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
            )
        existing_by_identity = {
            _row_identity(row): row for row in existing_rows
        }
        rows: list[ExamEvidenceChunk] = []
        for descriptor in selected:
            lookup = {
                "integrity_run": locked_run,
                "participant": participant,
                "source": descriptor["source"],
                "recording_session_id": descriptor[
                    "recording_session_id"
                ],
                "chunk_seq": descriptor["chunk_seq"],
            }
            row = existing_by_identity.get(_descriptor_identity(descriptor))
            if row is not None and not _descriptor_fields_match(
                row,
                descriptor,
            ):
                raise IntegrityEvidenceRejected(
                    "evidence_chunk_identity_conflict"
                )
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
                    metadata=_merged_association_metadata(
                        None,
                        event,
                        descriptor,
                    ),
                )
            else:
                metadata = _merged_association_metadata(
                    row,
                    event,
                    descriptor,
                )
                if metadata != row.metadata:
                    row.metadata = metadata
                    row.save(update_fields=["metadata"])
            rows.append(row)
        client = get_s3_client(
            endpoint_url=(
                settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or ""
            ).strip() or None
        )
        upload_ttl_seconds = (
            settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS
        )
        if (
            type(upload_ttl_seconds) is not int
            or upload_ttl_seconds < 1
        ):
            raise IntegrityEvidenceStorageError(
                "evidence upload signing failed"
            )
        uploads = []
        for row in rows:
            if row.status in _TERMINAL_CHUNK_STATUSES:
                put_url = None
                required_headers: dict[str, str] = {}
            else:
                try:
                    put_url, checksum = generate_evidence_chunk_put_url(
                        settings.ANTICHEAT_RAW_BUCKET,
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
                metadata = (
                    dict(row.metadata)
                    if type(row.metadata) is dict
                    else {}
                )
                metadata["upload_url_expires_at_ms"] = (
                    int(timezone.now().timestamp() * 1000)
                    + upload_ttl_seconds * 1000
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


def _storage_error_code(error: ClientError) -> str:
    response = getattr(error, "response", {})
    detail = response.get("Error") if type(response) is dict else None
    return str(detail.get("Code") or "") if type(detail) is dict else ""


def complete_evidence_chunk(
    chunk: ExamEvidenceChunk,
) -> ExamEvidenceChunk:
    if chunk.status == ExamEvidenceChunk.Status.VERIFIED:
        return chunk
    client = get_s3_client()
    try:
        head = client.head_object(
            Bucket=settings.ANTICHEAT_RAW_BUCKET,
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
            raise IntegrityEvidenceRejected(
                "evidence_object_not_found"
            ) from None
        raise IntegrityEvidenceStorageError(
            "evidence storage validation failed"
        ) from None
    except BotoCoreError:
        raise IntegrityEvidenceStorageError(
            "evidence storage validation failed"
        ) from None

    expected_checksum = base64.b64encode(
        bytes.fromhex(chunk.sha256)
    ).decode("ascii")
    length_matches = (
        type(head.get("ContentLength")) is int
        and head["ContentLength"] == chunk.byte_size
    )
    checksum = head.get("ChecksumSHA256")
    checksum_matches = (
        type(checksum) is str
        and hmac.compare_digest(checksum, expected_checksum)
    )
    now = timezone.now()
    mismatch = not length_matches or not checksum_matches
    with transaction.atomic():
        locked = ExamEvidenceChunk.objects.select_for_update().get(pk=chunk.pk)
        if locked.status == ExamEvidenceChunk.Status.VERIFIED:
            return locked
        if mismatch:
            locked.status = ExamEvidenceChunk.Status.FAILED
            locked.save(update_fields=["status"])
        else:
            locked.status = ExamEvidenceChunk.Status.VERIFIED
            locked.uploaded_at = now
            locked.verified_at = now
            metadata = (
                dict(locked.metadata)
                if type(locked.metadata) is dict
                else {}
            )
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
) -> ExamEvidenceChunk:
    with transaction.atomic():
        locked = ExamEvidenceChunk.objects.select_for_update().get(pk=chunk.pk)
        if locked.status == ExamEvidenceChunk.Status.VERIFIED:
            raise IntegrityEvidenceRejected(
                "verified_evidence_cannot_be_unavailable"
            )
        metadata = (
            dict(locked.metadata)
            if type(locked.metadata) is dict
            else {}
        )
        metadata["unavailable_reason"] = reason
        metadata["unavailable_reported_at"] = timezone.now().isoformat()
        locked.status = ExamEvidenceChunk.Status.UNAVAILABLE
        locked.metadata = metadata
        locked.save(update_fields=["status", "metadata"])
        return locked


def _unavailable_evidence_summary() -> dict[str, object]:
    return {"evidence_status": "unavailable", "evidence_sources": {}}


def _chunk_associated_with_event(
    chunk: ExamEvidenceChunk,
    event: ExamEvent,
) -> bool:
    return bool(
        chunk.exam_event_id == event.id
        or chunk.incident_id == event.incident_id
        or event.id in _metadata_ids(chunk.metadata, "event_ids")
        or str(event.incident_id)
        in _metadata_ids(chunk.metadata, "incident_ids")
    )


def _evidence_summary_from_loaded(
    run: ExamIntegrityRun,
    incident_windows: list[EvidenceRetainWindow],
    candidates: list[ExamEvidenceChunk],
) -> dict[str, object]:
    required = {
        source
        for window in incident_windows
        for source in window.sources
    }
    if run.data_state == ExamIntegrityRun.DataState.PURGED:
        return {
            "evidence_status": "unavailable",
            "evidence_sources": {
                source: {"status": "unavailable", "chunks": 0}
                for source in sorted(required)
            },
        }
    source_summary = {}
    for source in sorted(required):
        chunks = [chunk for chunk in candidates if chunk.source == source]
        statuses = {chunk.status for chunk in chunks}
        source_windows = [
            window
            for window in incident_windows
            if source in window.sources
        ]
        fully_covered = all(
            _source_has_terminal_coverage(window, chunks, source)
            for window in source_windows
        )
        if (
            fully_covered
            and statuses == {ExamEvidenceChunk.Status.VERIFIED}
        ):
            source_status = "complete"
        elif not chunks:
            source_status = "pending"
        elif statuses & {
            ExamEvidenceChunk.Status.REQUESTED,
            ExamEvidenceChunk.Status.UPLOADED,
        }:
            source_status = "pending"
        elif statuses <= {
            ExamEvidenceChunk.Status.FAILED,
            ExamEvidenceChunk.Status.UNAVAILABLE,
        }:
            source_status = "unavailable"
        else:
            source_status = "partial"
        source_summary[source] = {
            "status": source_status,
            "chunks": len(chunks),
        }
    statuses = {
        item["status"] for item in source_summary.values()
    }
    if not statuses:
        overall = "unavailable"
    elif "pending" in statuses:
        overall = "pending"
    elif statuses == {"complete"}:
        overall = "complete"
    elif statuses == {"unavailable"}:
        overall = "unavailable"
    else:
        overall = "partial"
    return {
        "evidence_status": overall,
        "evidence_sources": source_summary,
    }


def evidence_status_for_event(event: ExamEvent) -> dict[str, object]:
    if event.integrity_run_id is None or event.incident_id is None:
        return _unavailable_evidence_summary()
    try:
        run = event.integrity_run
    except ExamIntegrityRun.DoesNotExist:
        return _unavailable_evidence_summary()
    participant = (
        ContestParticipant.objects.filter(
            contest_id=event.contest_id,
            user_id=event.user_id,
        )
        .only("id", "user_id")
        .first()
    )
    if participant is None:
        return _unavailable_evidence_summary()
    windows = evidence_retain_windows(run, participant, after_ms=0)
    chunks = list(
        ExamEvidenceChunk.objects.filter(
            integrity_run=run,
            participant=participant,
        )
    )
    return _evidence_summary_from_loaded(
        run,
        [
            window
            for window in windows
            if window.incident_id == event.incident_id
        ],
        [
            chunk
            for chunk in chunks
            if _chunk_associated_with_event(chunk, event)
        ],
    )


def evidence_statuses_for_events(
    events: Iterable[ExamEvent],
) -> dict[int, dict[str, object]]:
    """Build event evidence summaries with two shared queries."""

    event_list = list(events)
    summaries = {
        event.id: _unavailable_evidence_summary()
        for event in event_list
    }
    groups: dict[
        tuple[UUID, int, int],
        tuple[ExamIntegrityRun, list[ExamEvent]],
    ] = {}
    for event in event_list:
        if event.integrity_run_id is None or event.incident_id is None:
            continue
        try:
            run = event.integrity_run
        except ExamIntegrityRun.DoesNotExist:
            continue
        key = (run.id, event.contest_id, event.user_id)
        if key not in groups:
            groups[key] = (run, [])
        groups[key][1].append(event)
    if not groups:
        return summaries

    contest_ids = {key[1] for key in groups}
    user_ids = {key[2] for key in groups}
    participants = list(
        ContestParticipant.objects.filter(
            contest_id__in=contest_ids,
            user_id__in=user_ids,
        ).only("id", "contest_id", "user_id")
    )
    participants_by_identity = {
        (participant.contest_id, participant.user_id): participant
        for participant in participants
    }
    active_groups = {
        key: (run, group_events, participant)
        for key, (run, group_events) in groups.items()
        if (
            participant := participants_by_identity.get(
                (key[1], key[2])
            )
        )
        is not None
    }
    if not active_groups:
        return summaries

    chunks_by_group: dict[
        tuple[UUID, int],
        list[ExamEvidenceChunk],
    ] = {}
    participant_ids = {
        participant.id
        for _, _, participant in active_groups.values()
    }
    run_ids = {key[0] for key in active_groups}
    for chunk in ExamEvidenceChunk.objects.filter(
        integrity_run_id__in=run_ids,
        participant_id__in=participant_ids,
    ):
        chunks_by_group.setdefault(
            (chunk.integrity_run_id, chunk.participant_id),
            [],
        ).append(chunk)

    for key, (run, group_events, participant) in active_groups.items():
        windows = _evidence_retain_windows_for_events(
            run,
            group_events,
            after_ms=0,
        )
        chunks = chunks_by_group.get((run.id, participant.id), [])
        summary_cache: dict[
            tuple[UUID, frozenset[UUID]],
            dict[str, object],
        ] = {}
        windows_by_incident: dict[
            UUID,
            list[EvidenceRetainWindow],
        ] = {}
        for window in windows:
            windows_by_incident.setdefault(
                window.incident_id,
                [],
            ).append(window)
        chunks_by_incident: dict[
            str,
            dict[UUID, ExamEvidenceChunk],
        ] = {}
        chunks_by_event: dict[
            int,
            dict[UUID, ExamEvidenceChunk],
        ] = {}
        for chunk in chunks:
            incident_ids = {
                str(chunk.incident_id),
                *(
                    value
                    for value in _metadata_ids(
                        chunk.metadata,
                        "incident_ids",
                    )
                    if type(value) is str
                ),
            }
            event_ids = {
                chunk.exam_event_id,
                *(
                    value
                    for value in _metadata_ids(
                        chunk.metadata,
                        "event_ids",
                    )
                    if type(value) is int
                ),
            }
            for incident_id in incident_ids:
                chunks_by_incident.setdefault(
                    incident_id,
                    {},
                )[chunk.id] = chunk
            for event_id in event_ids:
                chunks_by_event.setdefault(event_id, {})[chunk.id] = chunk
        for event in group_events:
            candidates = dict(
                chunks_by_incident.get(str(event.incident_id), {})
            )
            candidates.update(chunks_by_event.get(event.id, {}))
            cache_key = (
                event.incident_id,
                frozenset(candidates),
            )
            summary = summary_cache.get(cache_key)
            if summary is None:
                summary = _evidence_summary_from_loaded(
                    run,
                    windows_by_incident.get(event.incident_id, []),
                    list(candidates.values()),
                )
                summary_cache[cache_key] = summary
            summaries[event.id] = summary
    return summaries


def _read_body(response: dict[str, object]) -> bytes:
    content_length = response.get("ContentLength")
    if type(content_length) is int and content_length > _MANIFEST_MAX_BYTES:
        raise IntegrityEvidenceStorageError("archive manifest is too large")
    body = response.get("Body")
    if body is None or not hasattr(body, "read"):
        raise IntegrityEvidenceStorageError("archive manifest body is invalid")
    content = body.read(_MANIFEST_MAX_BYTES + 1)
    if type(content) is not bytes or len(content) > _MANIFEST_MAX_BYTES:
        raise IntegrityEvidenceStorageError("archive manifest body is invalid")
    return content


def _expected_manifest_key(run_id: UUID, generation: int) -> str:
    return f"runs/{run_id}/generation-{generation}/manifest.json"


def _expected_segment_prefix(run_id: UUID, generation: int) -> str:
    return f"runs/{run_id}/generation-{generation}/segments/"


def _load_archive_manifest_chain(
    client,
    run: ExamIntegrityRun,
) -> set[str]:
    key = run.archive_manifest_key
    digest = run.archive_manifest_sha256
    generation = run.archive_generation
    keys: set[str] = set()
    visited = set()
    for _ in range(_MAX_ARCHIVE_GENERATIONS):
        if (
            type(generation) is not int
            or generation < 1
            or key != _expected_manifest_key(run.id, generation)
            or type(digest) is not str
            or not _SHA256_RE.fullmatch(digest)
            or key in visited
        ):
            raise IntegrityEvidenceStorageError(
                "archive manifest identity is invalid"
            )
        visited.add(key)
        try:
            response = client.get_object(
                Bucket=settings.INTEGRITY_ARCHIVE_BUCKET,
                Key=key,
            )
        except (BotoCoreError, ClientError):
            raise IntegrityEvidenceStorageError(
                "archive manifest could not be read"
            ) from None
        content = _read_body(response)
        if not hmac.compare_digest(hashlib.sha256(content).hexdigest(), digest):
            raise IntegrityEvidenceStorageError(
                "archive manifest checksum is invalid"
            )
        try:
            payload = json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise IntegrityEvidenceStorageError(
                "archive manifest payload is invalid"
            ) from None
        if (
            type(payload) is not dict
            or payload.get("schema_version") != 1
            or payload.get("run_id") != str(run.id)
            or payload.get("generation") != generation
            or type(payload.get("segments")) is not list
        ):
            raise IntegrityEvidenceStorageError(
                "archive manifest payload is invalid"
            )
        prefix = _expected_segment_prefix(run.id, generation)
        for segment in payload["segments"]:
            object_key = (
                segment.get("object_key")
                if type(segment) is dict
                else None
            )
            suffix = (
                object_key[len(prefix):]
                if type(object_key) is str and object_key.startswith(prefix)
                else ""
            )
            if not re.fullmatch(r"[0-9]{8}\.journal\.gz", suffix):
                raise IntegrityEvidenceStorageError(
                    "archive segment identity is invalid"
                )
            keys.add(object_key)
        keys.add(key)
        previous = payload.get("previous_manifest")
        if previous is None:
            return keys
        if (
            type(previous) is not dict
            or set(previous) != {"generation", "object_key", "sha256"}
        ):
            raise IntegrityEvidenceStorageError(
                "archive manifest chain is invalid"
            )
        generation = previous.get("generation")
        key = previous.get("object_key")
        digest = previous.get("sha256")
    raise IntegrityEvidenceStorageError("archive manifest chain is too long")


def _delete_exact_keys(client, bucket: str, keys: list[str]) -> None:
    for offset in range(0, len(keys), _PURGE_BATCH_SIZE):
        batch = keys[offset:offset + _PURGE_BATCH_SIZE]
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
            raise IntegrityEvidenceStorageError(
                "integrity object deletion failed"
            )


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
        raise IntegrityEvidenceStorageError(
            "integrity object remains after purge"
        )


def _purge_receipt_keys(
    run: ExamIntegrityRun,
) -> tuple[list[str], list[str]] | None:
    metrics = run.metrics
    receipt = (
        metrics.get("integrity_purge")
        if type(metrics) is dict
        else None
    )
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
            type(key) is not str or not key
            for key in [*archive_keys, *evidence_keys]
        )
        or len(set(archive_keys)) != len(archive_keys)
        or len(set(evidence_keys)) != len(evidence_keys)
    ):
        raise IntegrityEvidenceStorageError(
            "integrity purge receipt is invalid"
        )
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
        raise IntegrityEvidenceStorageError(
            "integrity purge receipt is invalid"
        )
    return archive_keys, evidence_keys


def _persist_purge_receipt(
    run: ExamIntegrityRun,
    archive_keys: list[str],
) -> list[str]:
    with transaction.atomic():
        locked = ExamIntegrityRun.objects.select_for_update().get(pk=run.pk)
        if (
            locked.compute_state != ExamIntegrityRun.ComputeState.DESTROYED
            or locked.data_state != ExamIntegrityRun.DataState.ARCHIVED
            or locked.archive_manifest_key != run.archive_manifest_key
            or locked.archive_manifest_sha256 != run.archive_manifest_sha256
        ):
            raise IntegrityEvidenceStorageError(
                "archive manifest changed during purge"
            )
        evidence_rows = list(
            ExamEvidenceChunk.objects.filter(integrity_run=locked).only(
                "object_key",
                "metadata",
            )
        )
        now_ms = int(timezone.now().timestamp() * 1000)
        for evidence_row in evidence_rows:
            metadata = (
                evidence_row.metadata
                if type(evidence_row.metadata) is dict
                else {}
            )
            expires_at_ms = metadata.get("upload_url_expires_at_ms")
            if expires_at_ms is None:
                continue
            if type(expires_at_ms) is not int or expires_at_ms < 0:
                raise IntegrityEvidenceStorageError(
                    "evidence upload lease is invalid"
                )
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
            raise IntegrityEvidenceStorageError(
                "integrity purge key set is too large"
            )
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
        settings.INTEGRITY_ARCHIVE_BUCKET,
        archive_keys,
    )
    _delete_exact_keys(
        client,
        settings.ANTICHEAT_RAW_BUCKET,
        evidence_keys,
    )
    _verify_exact_keys_absent(
        client,
        settings.INTEGRITY_ARCHIVE_BUCKET,
        archive_keys,
    )
    _verify_exact_keys_absent(
        client,
        settings.ANTICHEAT_RAW_BUCKET,
        evidence_keys,
    )
    with transaction.atomic():
        ExamEvidenceChunk.objects.filter(integrity_run=run).delete()
