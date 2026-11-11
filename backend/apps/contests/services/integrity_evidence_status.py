"""Evidence review status for incident events."""
from __future__ import annotations

from typing import Iterable
from uuid import UUID

from apps.contests.models import (
    ContestParticipant,
    ExamEvidenceChunk,
    ExamEvent,
    ExamIntegrityRun,
)
from apps.contests.services.integrity_evidence_windows import (
    EvidenceRetainWindow,
    _chunk_matches_window,
    _evidence_retain_windows_for_events,
    _marker_matches_window,
    _metadata_ids,
    _participant_incident_events,
    _unavailable_markers_from_events,
)


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
        or str(event.incident_id) in _metadata_ids(chunk.metadata, "incident_ids")
    )


def evidence_chunks_for_event(event: ExamEvent) -> list[ExamEvidenceChunk]:
    """Return the same event-associated chunks used by evidence summaries."""

    if event.integrity_run_id is None or event.incident_id is None:
        return []
    participant = (
        ContestParticipant.objects.filter(
            contest_id=event.contest_id,
            user_id=event.user_id,
        )
        .only("id")
        .first()
    )
    if participant is None:
        return []
    run = event.integrity_run
    windows = _evidence_retain_windows_for_events(run, [event], after_ms=0)
    chunks = ExamEvidenceChunk.objects.filter(
        integrity_run_id=event.integrity_run_id,
        participant=participant,
    )
    return sorted(
        (
            chunk
            for chunk in chunks
            if _chunk_associated_with_event(chunk, event)
            and any(_chunk_matches_window(chunk, window) for window in windows)
        ),
        key=lambda chunk: (
            chunk.source,
            chunk.start_at_ms,
            chunk.chunk_seq,
        ),
    )


def _evidence_summary_from_loaded(
    run: ExamIntegrityRun,
    incident_windows: list[EvidenceRetainWindow],
    candidates: list[ExamEvidenceChunk],
    unavailable_markers: Iterable[dict[str, object]] = (),
) -> dict[str, object]:
    markers = list(unavailable_markers)
    required = {source for window in incident_windows for source in window.sources}
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
        verified_count = sum(
            chunk.status == ExamEvidenceChunk.Status.VERIFIED for chunk in chunks
        )
        source_windows = [
            window for window in incident_windows if source in window.sources
        ]
        has_unavailable_marker = any(
            _marker_matches_window(
                marker,
                run,
                window,
                source,
            )
            for marker in markers
            for window in source_windows
        )
        if verified_count:
            source_status = "available"
        elif statuses & {
            ExamEvidenceChunk.Status.REQUESTED,
            ExamEvidenceChunk.Status.UPLOADED,
        }:
            source_status = "pending"
        elif has_unavailable_marker or (
            statuses
            and statuses
            <= {
                ExamEvidenceChunk.Status.FAILED,
                ExamEvidenceChunk.Status.UNAVAILABLE,
            }
        ):
            source_status = "unavailable"
        else:
            source_status = "pending"
        source_summary[source] = {
            "status": source_status,
            "chunks": verified_count,
        }
    statuses = {item["status"] for item in source_summary.values()}
    if not statuses:
        overall = "unavailable"
    elif "available" in statuses:
        overall = "available"
    elif "pending" in statuses:
        overall = "pending"
    else:
        overall = "unavailable"
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
    events = list(_participant_incident_events(run, participant))
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
    return _evidence_summary_from_loaded(
        run,
        [window for window in windows if window.incident_id == event.incident_id],
        [chunk for chunk in chunks if _chunk_associated_with_event(chunk, event)],
        unavailable_markers,
    )


def evidence_statuses_for_events(
    events: Iterable[ExamEvent],
) -> dict[int, dict[str, object]]:
    """Build event evidence summaries with two shared queries."""

    event_list = list(events)
    summaries = {event.id: _unavailable_evidence_summary() for event in event_list}
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
        if (participant := participants_by_identity.get((key[1], key[2]))) is not None
    }
    if not active_groups:
        return summaries

    chunks_by_group: dict[
        tuple[UUID, int],
        list[ExamEvidenceChunk],
    ] = {}
    participant_ids = {participant.id for _, _, participant in active_groups.values()}
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
        unavailable_markers = _unavailable_markers_from_events(group_events)
        summary_cache: dict[
            tuple[object, ...],
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
            incident_windows = windows_by_incident.get(event.incident_id, [])
            candidates = dict(chunks_by_incident.get(str(event.incident_id), {}))
            candidates.update(chunks_by_event.get(event.id, {}))
            candidates = {
                chunk_id: chunk
                for chunk_id, chunk in candidates.items()
                if any(
                    _chunk_matches_window(chunk, window) for window in incident_windows
                )
            }
            cache_key = (
                event.incident_id,
                frozenset(candidates),
                tuple(
                    sorted(
                        (
                            marker["event_id"],
                            marker["source"],
                            marker["start_at_ms"],
                            marker["end_at_ms"],
                            marker["reason"],
                        )
                        for marker in unavailable_markers
                        if marker["incident_id"] == str(event.incident_id)
                    )
                ),
            )
            summary = summary_cache.get(cache_key)
            if summary is None:
                summary_args = (
                    run,
                    incident_windows,
                    list(candidates.values()),
                )
                summary = (
                    _evidence_summary_from_loaded(
                        *summary_args,
                        unavailable_markers=unavailable_markers,
                    )
                    if unavailable_markers
                    else _evidence_summary_from_loaded(*summary_args)
                )
                summary_cache[cache_key] = summary
            summaries[event.id] = summary
    return summaries
