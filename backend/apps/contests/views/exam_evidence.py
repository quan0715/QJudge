"""ExamEvidenceMixin — event-keyed screenshot evidence access."""
from __future__ import annotations

import logging
import re
from urllib.parse import unquote
from datetime import datetime
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Contest, ContestParticipant, ExamEvent
from ..permissions import can_manage_contest
from ..services.anticheat_storage import generate_get_url, get_s3_client
from ..services.exam_submission import normalize_source_module
from ..services.evidence_windows import (
    EVIDENCE_WINDOW_AFTER_SECONDS,
    EVIDENCE_WINDOW_BEFORE_SECONDS,
)

logger = logging.getLogger(__name__)

RAW_FRAME_KEY_PATTERN = re.compile(
    r"^contest_(?P<contest_id>[^/]+)/user_(?P<user_id>\d+)/session_[^/]+/(?P<module>[^/]+)/"
    r"ts_(?P<ts_ms>\d+)_seq_(?P<seq>\d+)\.webp$"
)


def _parse_int_param(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_event_time_ms(value: str | None) -> int | None:
    if not isinstance(value, str):
        return None
    dt = parse_datetime(value)
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = timezone.make_aware(dt)
    return int(dt.timestamp() * 1000)


def _event_window_ms(event: ExamEvent | None, ts_from: int | None, ts_to: int | None):
    if ts_from is not None or ts_to is not None:
        return ts_from, ts_to
    if event is None:
        return ts_from, ts_to

    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    from_metadata_from = _parse_event_time_ms(metadata.get("evidence_window_start"))
    from_metadata_to = _parse_event_time_ms(metadata.get("evidence_window_end"))
    if from_metadata_from is not None and from_metadata_to is not None:
        return from_metadata_from, from_metadata_to

    created_at = event.created_at
    if created_at is None:
        return ts_from, ts_to

    if isinstance(created_at, str):
        parsed_created_at = parse_datetime(created_at)
        if parsed_created_at is None:
            return ts_from, ts_to
        created_at = parsed_created_at
    if not isinstance(created_at, datetime):
        return ts_from, ts_to
    if created_at.tzinfo is None:
        created_at = timezone.make_aware(created_at)

    baseline = int(created_at.timestamp() * 1000)
    return (
        baseline - (EVIDENCE_WINDOW_BEFORE_SECONDS * 1000),
        baseline + (EVIDENCE_WINDOW_AFTER_SECONDS * 1000),
    )


def _event_for_lookup(contest: Contest, user_id: int | None, event_id: int | None = None, cluster_id: str = ""):
    if event_id is not None:
        event = get_object_or_404(
            ExamEvent.objects.select_related("user"),
            contest=contest,
            id=event_id,
        )
        if user_id is not None and event.user_id != user_id:
            return None, Response(
                {"error": "event_id does not match user_id"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return event, None

    if cluster_id and user_id is not None:
        event = (
            ExamEvent.objects.filter(
                contest=contest,
                user_id=user_id,
                metadata__evidence_cluster_id=cluster_id,
            )
            .order_by("-created_at")
            .first()
        )
        if event is None:
            return None, Response(
                {"error": "event with given evidence_cluster_id not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return event, None

    if cluster_id:
        return None, Response(
            {"error": "user_id is required when evidence_cluster_id is used"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None, None


def _frames_from_keys(raw_keys: list[str], source_module: str, ts_from: int | None, ts_to: int | None):
    ts_with_module_re = re.compile(r"/session_[^/]+/([^/]+)/ts_(\d+)_seq_(\d+)\.webp$")
    ts_legacy_re = re.compile(r"/ts_(\d+)_seq_(\d+)\.webp$")
    frames: list[dict[str, Any]] = []
    for key in raw_keys:
        module = "screen_share"
        match = ts_with_module_re.search(key)
        if match:
            module = match.group(1)
            ts_ms = int(match.group(2))
            seq = int(match.group(3))
        else:
            match = ts_legacy_re.search(key)
            if not match:
                continue
            ts_ms = int(match.group(1))
            seq = int(match.group(2))
        if source_module and module != source_module:
            continue
        if ts_from is not None and ts_ms < ts_from:
            continue
        if ts_to is not None and ts_ms > ts_to:
            continue
        frames.append({"key": key, "ts_ms": ts_ms, "seq": seq, "source_module": module})
    frames.sort(key=lambda frame: frame["ts_ms"], reverse=True)
    return frames


class ExamEvidenceMixin:
    """Mixin for event-keyed raw screenshot evidence lookup."""

    @staticmethod
    def _list_raw_evidence_keys(client, bucket: str, prefix: str) -> list[str]:
        paginator = client.get_paginator("list_objects_v2")
        keys: list[str] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item.get("Key")
                if key:
                    keys.append(key)
        return keys

    @action(detail=False, methods=["get"], url_path="screenshots")
    def screenshots(self, request, contest_pk=None):
        """Return presigned GET URLs for raw screenshot frames matching filters.

        Query params:
          - user_id (required): participant user id
          - ts_from: lower bound timestamp in ms (inclusive)
          - ts_to: upper bound timestamp in ms (inclusive)
          - event_id: exam event id to auto-derive evidence window
          - evidence_cluster_id: fallback event group id (requires user_id)
          - upload_session_id: specific session (default: all sessions)
          - source_module: "screen_share" or "webcam" (default: all modules)
          - object_key: explicit evidence object key, repeatable
          - limit: max frames to return (default 20, max 50)
        """
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_id = request.query_params.get("user_id")
        event_id = _parse_int_param(request.query_params.get("event_id"))
        evidence_cluster_id = (request.query_params.get("evidence_cluster_id") or "").strip()

        if user_id is not None:
            try:
                user_id = int(user_id)
            except (TypeError, ValueError):
                return Response({"error": "invalid user_id"}, status=status.HTTP_400_BAD_REQUEST)

        anchor_event, lookup_error = _event_for_lookup(
            contest,
            user_id,
            event_id=event_id,
            cluster_id=evidence_cluster_id,
        )
        if lookup_error is not None:
            return lookup_error

        key_params = [
            unquote(value).strip()
            for value in request.query_params.getlist("object_key")
            if unquote(value).strip()
        ]

        if key_params:
            if user_id is None:
                return Response({"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            if user_id is None and anchor_event is None:
                return Response({"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)
            if user_id is None and anchor_event is not None:
                user_id = anchor_event.user_id

        participant = ContestParticipant.objects.filter(contest=contest, user_id=user_id).first()
        if not participant:
            return Response({"error": "participant not found"}, status=status.HTTP_404_NOT_FOUND)

        if anchor_event is None and (event_id is not None or evidence_cluster_id):
            # defensive: lookup helper above only fails on mismatch/no-data, but keep guard for consistency.
            return Response({"error": "event not found"}, status=status.HTTP_404_NOT_FOUND)

        upload_session_id = (request.query_params.get("upload_session_id") or "").strip()
        source_module_raw = (request.query_params.get("source_module") or "").strip()
        source_module = normalize_source_module(source_module_raw) if source_module_raw else ""

        if source_module == "":
            anchor_metadata = {}
            if anchor_event is not None and isinstance(anchor_event.metadata, dict):
                anchor_metadata = anchor_event.metadata
            source_module = normalize_source_module(
                anchor_metadata.get("evidence_source_module") or anchor_metadata.get("module")
            )

        ts_from = _parse_int_param(request.query_params.get("ts_from"))
        ts_to = _parse_int_param(request.query_params.get("ts_to"))
        ts_from, ts_to = _event_window_ms(anchor_event, ts_from, ts_to)
        limit = min(_parse_int_param(request.query_params.get("limit")) or 20, 50)
        key_params = key_params[:limit]

        if key_params:
            items = []
            for key in key_params:
                match = RAW_FRAME_KEY_PATTERN.match(key)
                if not match:
                    continue
                if str(match.group("contest_id")) != str(contest.id):
                    continue
                if int(match.group("user_id")) != user_id:
                    continue
                module = match.group("module")
                if source_module and module != source_module:
                    continue
                ts_ms = int(match.group("ts_ms"))
                seq = int(match.group("seq"))
                if ts_from is not None and ts_ms < ts_from:
                    continue
                if ts_to is not None and ts_ms > ts_to:
                    continue
                url = generate_get_url(settings.ANTICHEAT_RAW_BUCKET, key, expires_seconds=120)
                items.append({
                    "url": url,
                    "ts_ms": ts_ms,
                    "seq": seq,
                    "source_module": module,
                    "expires_in": 120,
                })
            items.sort(key=lambda item: item["ts_ms"], reverse=True)
            return Response({"items": items, "total_raw_count": len(items), "storage_error": False})

        if not upload_session_id and anchor_event is not None:
            metadata = anchor_event.metadata if isinstance(anchor_event.metadata, dict) else {}
            anchor_session_id = str(metadata.get("upload_session_id") or "").strip()
            if anchor_session_id:
                upload_session_id = anchor_session_id

        if upload_session_id:
            prefix = f"contest_{contest.id}/user_{user_id}/session_{upload_session_id}/"
        else:
            prefix = f"contest_{contest.id}/user_{user_id}/"

        storage_error = False
        try:
            client = get_s3_client()
            raw_keys = self._list_raw_evidence_keys(client, settings.ANTICHEAT_RAW_BUCKET, prefix)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("screenshots: failed to list S3 keys", extra={"error": str(exc)})
            raw_keys = []
            storage_error = True

        frames = _frames_from_keys(raw_keys, source_module, ts_from, ts_to)

        total_filtered_count = len(frames)
        frames = frames[:limit]

        items = []
        for frame in frames:
            url = generate_get_url(settings.ANTICHEAT_RAW_BUCKET, frame["key"], expires_seconds=120)
            items.append({
                "url": url,
                "ts_ms": frame["ts_ms"],
                "seq": frame["seq"],
                "source_module": frame["source_module"],
                "expires_in": 120,
            })

        return Response({
            "items": items,
            "total_raw_count": total_filtered_count,
            "storage_error": storage_error,
        })
