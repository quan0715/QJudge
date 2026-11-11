"""Shared evidence types and the incident retain-window projection."""
from __future__ import annotations

import hashlib
import hmac
import json
import re
from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from django.conf import settings

from apps.contests.models import (
    ContestParticipant,
    ExamEvidenceChunk,
    ExamEvent,
    ExamIntegrityRun,
)
from apps.contests.services.integrity_event_projection import event_phase


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
_UNAVAILABLE_MARKERS_KEY = "integrity_evidence_unavailable_markers"
_UNAVAILABLE_MARKER_VERSION = 1
_UNAVAILABLE_MARKER_FIELDS = (
    "version",
    "run_id",
    "participant_id",
    "incident_id",
    "event_id",
    "source",
    "start_at_ms",
    "end_at_ms",
    "reason",
)


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


def _unavailable_marker_signature(payload: dict[str, object]) -> str:
    canonical = json.dumps(
        payload,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hmac.new(
        str(settings.SECRET_KEY).encode("utf-8"),
        canonical,
        hashlib.sha256,
    ).hexdigest()


def _validated_unavailable_marker(value: object) -> dict[str, object] | None:
    if type(value) is not dict or set(value) != {
        *_UNAVAILABLE_MARKER_FIELDS,
        "signature",
    }:
        return None
    payload = {field: value[field] for field in _UNAVAILABLE_MARKER_FIELDS}
    signature = value["signature"]
    if (
        payload["version"] != _UNAVAILABLE_MARKER_VERSION
        or type(payload["run_id"]) is not str
        or type(payload["participant_id"]) is not int
        or payload["participant_id"] < 1
        or type(payload["incident_id"]) is not str
        or type(payload["event_id"]) is not int
        or payload["event_id"] < 1
        or type(payload["source"]) is not str
        or payload["source"] not in _SOURCE_KINDS
        or _nonnegative_int(payload["start_at_ms"]) is None
        or _nonnegative_int(payload["end_at_ms"]) is None
        or payload["end_at_ms"] <= payload["start_at_ms"]
        or type(payload["reason"]) is not str
        or not 1 <= len(payload["reason"]) <= 256
        or type(signature) is not str
        or _SHA256_RE.fullmatch(signature) is None
    ):
        return None
    try:
        UUID(payload["run_id"])
        UUID(payload["incident_id"])
    except ValueError:
        return None
    if not hmac.compare_digest(
        signature,
        _unavailable_marker_signature(payload),
    ):
        return None
    return payload


def _unavailable_markers_from_events(
    events: Iterable[ExamEvent],
) -> list[dict[str, object]]:
    markers: list[dict[str, object]] = []
    for event in events:
        metadata = event.metadata if type(event.metadata) is dict else {}
        raw_markers = metadata.get(_UNAVAILABLE_MARKERS_KEY)
        if type(raw_markers) is not list:
            continue
        for raw_marker in raw_markers:
            marker = _validated_unavailable_marker(raw_marker)
            if marker is not None:
                markers.append(marker)
    return markers


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
    definition_id = integrity.get("definition_id") if type(integrity) is dict else None
    if type(definition_id) is str:
        definition = definitions.get(definition_id)
        if type(definition) is dict:
            return definition
    for definition in definitions.values():
        if type(definition) is not dict:
            continue
        signals = definition.get("signals")
        if type(signals) is dict and event.event_type in {
            value for value in signals.values() if type(value) is str
        }:
            return definition
    return None


def _enabled_sources(run: ExamIntegrityRun) -> frozenset[str]:
    if run.policy_snapshot["webcam_required"]:
        return frozenset({"screen_share", "webcam"})
    return frozenset({"screen_share"})


def _raw_window(
    run: ExamIntegrityRun,
    event: ExamEvent,
    enabled_sources: frozenset[str],
) -> tuple[_RawWindow, ...]:
    integrity = event.metadata.get("integrity", {}) if isinstance(event.metadata, dict) else {}
    if isinstance(integrity, dict) and integrity.get("late_unverified") is True:
        return ()
    if isinstance(integrity, dict) and integrity.get("evidence_gap"):
        return ()
    if (
        event.incident_id is None
        or event.client_occurred_at_ms is None
        or event.integrity_run_id != run.id
    ):
        return ()
    definition = _event_definition(run, event)
    if definition is None:
        return ()
    signals = definition.get("signals")
    if (
        type(signals) is dict
        and bool(signals.get("escalated") or signals.get("restored"))
        and event_phase(event) != "escalated"
    ):
        return ()
    evidence = definition.get("evidence")
    if type(evidence) is not dict or evidence.get("mode") != "incident_window":
        return ()
    before_ms = _nonnegative_int(evidence.get("before_ms"))
    after_ms = _nonnegative_int(evidence.get("after_ms"))
    max_segment_ms = _nonnegative_int(evidence.get("max_segment_ms"))
    if (
        before_ms is None
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
    return tuple(
        _RawWindow(
            incident_id=event.incident_id,
            event_id=event.id,
            source=source,
            start_at_ms=start_at_ms,
            end_at_ms=end_at_ms,
            max_segment_ms=max_segment_ms,
        )
        for source in sorted(enabled_sources)
    )


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
    enabled_sources = _enabled_sources(run)
    by_source: dict[str, list[_RawWindow]] = {}
    for event in events:
        for window in _raw_window(run, event, enabled_sources):
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


def _participant_incident_events(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
):
    return ExamEvent.objects.filter(
        integrity_run=run,
        contest_id=run.contest_id,
        user_id=participant.user_id,
        incident_id__isnull=False,
    ).order_by("client_occurred_at_ms", "id")


def evidence_retain_windows(
    run: ExamIntegrityRun,
    participant: ContestParticipant,
    after_ms: int,
) -> list[EvidenceRetainWindow]:
    """Rebuild retain windows from normalized events and the frozen registry."""

    return _evidence_retain_windows_for_events(
        run,
        _participant_incident_events(run, participant),
        after_ms,
    )


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


def _marker_matches_window(
    marker: dict[str, object],
    run: ExamIntegrityRun,
    window: EvidenceRetainWindow,
    source: str,
) -> bool:
    return bool(
        marker["run_id"] == str(run.id)
        and marker["incident_id"] == str(window.incident_id)
        and marker["event_id"] == window.event_id
        and marker["source"] == source
        and marker["start_at_ms"] == window.start_at_ms
        and marker["end_at_ms"] == window.end_at_ms
    )


def _source_has_terminal_coverage(
    run: ExamIntegrityRun,
    window: EvidenceRetainWindow,
    chunks: list[ExamEvidenceChunk],
    unavailable_markers: Iterable[dict[str, object]],
    source: str,
) -> bool:
    if any(
        _marker_matches_window(
            marker,
            run,
            window,
            source,
        )
        for marker in unavailable_markers
    ):
        return True
    return any(
        chunk.source == source
        and chunk.status in _TERMINAL_CHUNK_STATUSES
        and _chunk_matches_window(chunk, window)
        for chunk in chunks
    )
