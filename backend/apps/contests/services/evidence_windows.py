"""Event-keyed evidence window helpers.

Evidence window metadata is stored directly on ExamEvent rows so the review
workflow can stay event-keyed without creating per-video jobs.
"""
from __future__ import annotations

import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.contests.constants import PENALIZED_EVENT_TYPES
from apps.contests.models import ExamEvent


EVIDENCE_WINDOW_BEFORE_SECONDS = 20
EVIDENCE_WINDOW_AFTER_SECONDS = 20
EVIDENCE_WINDOW_MERGE_GAP_SECONDS = 20
EVIDENCE_WINDOW_MAX_SECONDS = 120
EVIDENCE_WINDOW_LOOKBACK_SECONDS = 300


def _parse_datetime(value):
    if not isinstance(value, str) or not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _iso(value) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _source_module(metadata: dict) -> str:
    raw = str(metadata.get("module") or metadata.get("source_module") or "screen_share").strip()
    return raw or "screen_share"


def _is_relevant_event(event: ExamEvent) -> bool:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    phase = str(metadata.get("phase") or "").strip().upper()
    if phase in {"TERMINATING", "TERMINAL"}:
        return False
    return event.event_type in PENALIZED_EVENT_TYPES


def _candidate_bounds(event: ExamEvent):
    occurred_at = event.created_at or timezone.now()
    return (
        occurred_at - timedelta(seconds=EVIDENCE_WINDOW_BEFORE_SECONDS),
        occurred_at + timedelta(seconds=EVIDENCE_WINDOW_AFTER_SECONDS),
    )


def _recent_cluster_events(event: ExamEvent, source_module: str):
    since = (event.created_at or timezone.now()) - timedelta(seconds=EVIDENCE_WINDOW_LOOKBACK_SECONDS)
    qs = (
        ExamEvent.objects.filter(
            contest=event.contest,
            user=event.user,
            created_at__gte=since,
        )
        .exclude(pk=event.pk)
        .order_by("-created_at")[:100]
    )
    matches = []
    for candidate in qs:
        metadata = candidate.metadata if isinstance(candidate.metadata, dict) else {}
        if not metadata.get("evidence_cluster_id"):
            continue
        if _source_module(metadata) != source_module:
            continue
        window_start = _parse_datetime(metadata.get("evidence_window_start"))
        window_end = _parse_datetime(metadata.get("evidence_window_end"))
        if not window_start or not window_end:
            continue
        matches.append((candidate, metadata, window_start, window_end))
    return matches


def _find_merge_target(event: ExamEvent, source_module: str, new_start):
    merge_gap = timedelta(seconds=EVIDENCE_WINDOW_MERGE_GAP_SECONDS)
    for candidate, metadata, window_start, window_end in _recent_cluster_events(event, source_module):
        if window_end + merge_gap < new_start:
            continue
        max_end = window_start + timedelta(seconds=EVIDENCE_WINDOW_MAX_SECONDS)
        if window_end >= max_end:
            continue
        return candidate, metadata, window_start, window_end
    return None


@transaction.atomic
def attach_evidence_window_metadata(event: ExamEvent) -> ExamEvent:
    """Attach or merge evidence window metadata for an exam event.

    This intentionally avoids a new table for the first implementation pass.
    The metadata is enough for UI/API wiring and lets us validate clustering
    behavior before normalizing the schema.
    """
    if not _is_relevant_event(event):
        return event

    event = ExamEvent.objects.select_for_update().get(pk=event.pk)
    metadata = dict(event.metadata or {})
    source_module = _source_module(metadata)
    new_start, new_end = _candidate_bounds(event)

    merge_target = _find_merge_target(event, source_module, new_start)
    if merge_target:
        _, target_metadata, cluster_start, cluster_end = merge_target
        cluster_id = str(target_metadata["evidence_cluster_id"])
        window_start = cluster_start
        max_end = window_start + timedelta(seconds=EVIDENCE_WINDOW_MAX_SECONDS)
        window_end = min(max(cluster_end, new_end), max_end)
    else:
        cluster_id = uuid.uuid4().hex
        window_start = new_start
        window_end = min(new_end, window_start + timedelta(seconds=EVIDENCE_WINDOW_MAX_SECONDS))

    metadata.update(
        {
            "evidence_cluster_id": cluster_id,
            "evidence_window_start": _iso(window_start),
            "evidence_window_end": _iso(window_end),
            "evidence_window_before_seconds": EVIDENCE_WINDOW_BEFORE_SECONDS,
            "evidence_window_after_seconds": EVIDENCE_WINDOW_AFTER_SECONDS,
            "evidence_window_max_seconds": EVIDENCE_WINDOW_MAX_SECONDS,
            "evidence_source_module": source_module,
            "pre_buffer_complete": bool(metadata.get("pre_buffer_complete", False)),
        }
    )
    event.metadata = metadata
    event.save(update_fields=["metadata"])

    cluster_events = ExamEvent.objects.filter(
        contest=event.contest,
        user=event.user,
        metadata__evidence_cluster_id=cluster_id,
    ).exclude(pk=event.pk)
    for cluster_event in cluster_events:
        cluster_metadata = dict(cluster_event.metadata or {})
        cluster_metadata["evidence_window_start"] = _iso(window_start)
        cluster_metadata["evidence_window_end"] = _iso(window_end)
        cluster_metadata["evidence_window_max_seconds"] = EVIDENCE_WINDOW_MAX_SECONDS
        cluster_event.metadata = cluster_metadata
        cluster_event.save(update_fields=["metadata"])

    return event
