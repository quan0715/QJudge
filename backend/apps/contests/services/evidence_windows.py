"""Event-keyed evidence window helpers.

Evidence window metadata is stored directly on ExamEvent rows so the review
workflow can stay event-keyed without creating per-video jobs.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone as dt_timezone

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.contests.constants import PENALIZED_EVENT_TYPES
from apps.contests.models import ExamEvent


EVIDENCE_WINDOW_BEFORE_SECONDS = 3
EVIDENCE_WINDOW_AFTER_SECONDS = 3
PRE_LOSS_EVIDENCE_WINDOW_BEFORE_SECONDS = 6
EVIDENCE_WINDOW_MERGE_GAP_SECONDS = 20
EVIDENCE_WINDOW_MAX_SECONDS = 120
EVIDENCE_WINDOW_LOOKBACK_SECONDS = 300
ANCHOR_WINDOW_MODE = "anchor_window"
PRE_LOSS_MODE = "pre_loss"
AUDIT_MODE = "audit"


def _parse_datetime(value):
    if not isinstance(value, str) or not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _parse_ms(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if value >= 0:
            return int(value)
        return None
    if isinstance(value, str):
        try:
            parsed = int(float(value))
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def _datetime_from_ms(value: int):
    return datetime.fromtimestamp(value / 1000, tz=dt_timezone.utc)


def _iso(value) -> str:
    return value.astimezone(dt_timezone.utc).isoformat().replace("+00:00", "Z")


def _source_module(metadata: dict) -> str:
    raw = str(metadata.get("module") or metadata.get("source_module") or "screen_share").strip()
    return raw or "screen_share"


def _is_relevant_event(event: ExamEvent) -> bool:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    phase = str(metadata.get("phase") or "").strip().upper()
    if phase in {"TERMINATING", "TERMINAL"}:
        return False
    return (
        event.event_type in PENALIZED_EVENT_TYPES
        or bool(metadata.get("evidence_anchor_at"))
        or _parse_ms(metadata.get("evidence_anchor_at_ms")) is not None
        or str(metadata.get("evidence_mode") or "").strip() == AUDIT_MODE
    )


def _candidate_bounds(event: ExamEvent):
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    anchor_ms = _parse_ms(metadata.get("evidence_anchor_at_ms"))
    anchor_at = (
        _datetime_from_ms(anchor_ms)
        if anchor_ms is not None
        else _parse_datetime(metadata.get("evidence_anchor_at")) or event.created_at or timezone.now()
    )
    mode = str(metadata.get("evidence_mode") or ANCHOR_WINDOW_MODE).strip() or ANCHOR_WINDOW_MODE
    if mode == PRE_LOSS_MODE:
        before_seconds = PRE_LOSS_EVIDENCE_WINDOW_BEFORE_SECONDS
        after_seconds = 0
    elif mode == AUDIT_MODE:
        before_seconds = 0
        after_seconds = 0
    else:
        before_seconds = metadata.get("evidence_window_before_seconds")
        after_seconds = metadata.get("evidence_window_after_seconds")
        if not isinstance(before_seconds, (int, float)) or before_seconds < 0:
            before_seconds = EVIDENCE_WINDOW_BEFORE_SECONDS
        if not isinstance(after_seconds, (int, float)) or after_seconds < 0:
            after_seconds = EVIDENCE_WINDOW_AFTER_SECONDS
    return (
        anchor_at - timedelta(seconds=before_seconds),
        anchor_at + timedelta(seconds=after_seconds),
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
    """Attach a manifest-backed evidence window to an exam event."""
    if not _is_relevant_event(event):
        return event

    event = ExamEvent.objects.select_for_update().get(pk=event.pk)
    metadata = dict(event.metadata or {})
    source_module = _source_module(metadata)
    new_start, new_end = _candidate_bounds(event)
    cluster_id = str(metadata.get("evidence_cluster_id") or uuid.uuid4().hex)
    window_start = new_start
    window_end = min(new_end, window_start + timedelta(seconds=EVIDENCE_WINDOW_MAX_SECONDS))
    anchor_ms = _parse_ms(metadata.get("evidence_anchor_at_ms"))
    if anchor_ms is None:
        anchor = _parse_datetime(metadata.get("evidence_anchor_at")) or event.created_at or timezone.now()
        anchor_ms = int(anchor.timestamp() * 1000)
    evidence_mode = str(metadata.get("evidence_mode") or ANCHOR_WINDOW_MODE).strip() or ANCHOR_WINDOW_MODE
    if evidence_mode not in {ANCHOR_WINDOW_MODE, PRE_LOSS_MODE, AUDIT_MODE}:
        evidence_mode = ANCHOR_WINDOW_MODE
    before_seconds = max(0, int(((_datetime_from_ms(anchor_ms)) - window_start).total_seconds()))
    after_seconds = max(0, int((window_end - _datetime_from_ms(anchor_ms)).total_seconds()))

    metadata.update(
        {
            "evidence_cluster_id": cluster_id,
            "evidence_mode": evidence_mode,
            "evidence_anchor_at_ms": anchor_ms,
            "evidence_anchor_at": _iso(_datetime_from_ms(anchor_ms)),
            "evidence_window_start": _iso(window_start),
            "evidence_window_end": _iso(window_end),
            "evidence_window_before_seconds": before_seconds,
            "evidence_window_after_seconds": after_seconds,
            "evidence_window_max_seconds": EVIDENCE_WINDOW_MAX_SECONDS,
            "evidence_source_module": source_module,
            "pre_buffer_complete": bool(metadata.get("pre_buffer_complete", False)),
        }
    )
    event.metadata = metadata
    event.save(update_fields=["metadata"])

    return event
