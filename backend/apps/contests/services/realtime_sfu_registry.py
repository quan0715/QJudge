"""Short-lived registry for active Realtime SFU publishers.

This intentionally uses cache instead of a model while the live-monitoring
workflow is still behind a dev spike flag. The source of truth is the student's
active WebRTC session, not persisted exam evidence.
"""
from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone


def publisher_key(contest_id: int, user_id: int) -> str:
    return f"contest:{contest_id}:sfu:publisher:{user_id}"


def register_publisher(
    *,
    contest_id: int,
    user_id: int,
    session_id: str,
    track_name: str,
    room_id: str,
) -> dict[str, Any]:
    payload = {
        "contest_id": contest_id,
        "user_id": user_id,
        "session_id": session_id,
        "track_name": track_name,
        "room_id": room_id,
        "updated_at": timezone.now().isoformat(),
    }
    cache.set(
        publisher_key(contest_id, user_id),
        payload,
        timeout=max(1, settings.LIVE_MONITORING_PUBLISHER_TTL_SECONDS),
    )
    return payload


def refresh_publisher(contest_id: int, user_id: int) -> dict[str, Any] | None:
    key = publisher_key(contest_id, user_id)
    payload = cache.get(key)
    if not isinstance(payload, dict):
        return None
    payload = {**payload, "updated_at": timezone.now().isoformat()}
    cache.set(
        key,
        payload,
        timeout=max(1, settings.LIVE_MONITORING_PUBLISHER_TTL_SECONDS),
    )
    return payload


def get_publisher(contest_id: int, user_id: int) -> dict[str, Any] | None:
    payload = cache.get(publisher_key(contest_id, user_id))
    return payload if isinstance(payload, dict) else None


def remove_publisher(
    contest_id: int,
    user_id: int,
    *,
    session_id: str | None = None,
) -> dict[str, Any] | None:
    key = publisher_key(contest_id, user_id)
    payload = cache.get(key)
    if session_id and isinstance(payload, dict) and payload.get("session_id") != session_id:
        return payload
    cache.delete(key)
    return None


def extract_first_local_track_name(payload: dict[str, Any]) -> str | None:
    tracks = payload.get("tracks")
    if not isinstance(tracks, list):
        return None
    for track in tracks:
        if not isinstance(track, dict):
            continue
        if track.get("location") != "local":
            continue
        track_name = track.get("trackName")
        if isinstance(track_name, str) and track_name.strip():
            return track_name.strip()
    return None
