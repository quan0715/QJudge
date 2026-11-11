"""Evidence chunk descriptor validation for manifest creation."""
from __future__ import annotations

from uuid import UUID

from apps.contests.models import (
    ContestParticipant,
    ExamEvidenceChunk,
    ExamEvent,
    ExamIntegrityRun,
)
from apps.contests.services.integrity_evidence_windows import (
    EvidenceRetainWindow,
    IntegrityEvidenceRejected,
    _metadata_ids,
    _nonnegative_int,
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
        init_chunks = [item for item in group if bool(item["is_init_chunk"])]
        if len(init_chunks) > 1:
            raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
        if init_chunks:
            init_seq = int(init_chunks[0]["chunk_seq"])
            if init_seq not in {0, 1} or any(
                int(item["chunk_seq"]) < init_seq for item in group
            ):
                raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
        for descriptor in group:
            if (descriptor["is_init_chunk"] and descriptor["previous_sha256"]) or (
                not descriptor["is_init_chunk"] and not descriptor["previous_sha256"]
            ):
                raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
        for previous, current in zip(group, group[1:]):
            if int(current["chunk_seq"]) != int(previous["chunk_seq"]) + 1:
                continue
            if current["previous_sha256"] != previous["sha256"]:
                raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")


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
        and metadata.get("local_descriptor_id") == descriptor["local_descriptor_id"]
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
        or str(incident_id) in _metadata_ids(row.metadata, "incident_ids")
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
    existing_by_identity = {_row_identity(row): row for row in existing_rows}
    for source in {str(descriptor["source"]) for descriptor in descriptors}:
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
                row.byte_size if row is not None else int(descriptor["byte_size"])
            )
        if sum(bytes_by_identity.values()) > cap_bytes:
            raise IntegrityEvidenceRejected("evidence_incident_source_limit_exceeded")


def _validate_persisted_chain_neighbors(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    descriptor: dict[str, object],
    submitted_predecessor: dict[str, object] | None,
    existing_rows: list[ExamEvidenceChunk],
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
    if (
        submitted_predecessor is not None
        and previous is not None
        and not _descriptor_fields_match(previous, submitted_predecessor)
    ):
        raise IntegrityEvidenceRejected("evidence_chunk_identity_conflict")
    if descriptor["is_init_chunk"]:
        session_rows = [
            row
            for row in existing_rows
            if (
                row.source == descriptor["source"]
                and row.recording_session_id == descriptor["recording_session_id"]
            )
        ]
        another_init_exists = any(
            row.is_init_chunk and row.chunk_seq != chunk_seq for row in session_rows
        )
        matching_init = next(
            (
                row
                for row in session_rows
                if row.chunk_seq == chunk_seq
                and row.is_init_chunk
                and _descriptor_fields_match(row, descriptor)
            ),
            None,
        )
        if (
            previous is not None
            or submitted_predecessor is not None
            or another_init_exists
            or (session_rows and matching_init is None)
        ):
            raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
    if (
        submitted_predecessor is not None
        and descriptor["previous_sha256"] != submitted_predecessor["sha256"]
    ):
        raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
    if previous is not None and descriptor["previous_sha256"] != previous.sha256:
        raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")
    if following is not None and following.previous_sha256 != descriptor["sha256"]:
        raise IntegrityEvidenceRejected("evidence_chunk_chain_mismatch")


def _merged_association_metadata(
    row: ExamEvidenceChunk | None,
    event: ExamEvent,
    descriptor: dict[str, object],
) -> dict[str, object]:
    metadata = (
        dict(row.metadata) if row is not None and type(row.metadata) is dict else {}
    )
    primary_incident = row.incident_id if row is not None else event.incident_id
    primary_event_id = row.exam_event_id if row is not None else event.id
    incident_ids = [
        str(value)
        for value in _metadata_ids(metadata, "incident_ids")
        if type(value) is str
    ]
    event_ids = [
        value for value in _metadata_ids(metadata, "event_ids") if type(value) is int
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
