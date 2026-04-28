"""Short-lived registry for active Realtime SFU publishers.

This intentionally uses cache instead of a model. The source of truth is the
student's active WebRTC session, not persisted exam evidence.
"""
from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

SOURCE_MODULES = ("screen_share", "webcam")


def infer_source_module(track_name: str | None) -> str:
    return "webcam" if isinstance(track_name, str) and track_name.startswith("webcam-") else "screen_share"


def publisher_key(contest_id: int, user_id: int, source_module: str | None = None) -> str:
    if source_module in SOURCE_MODULES:
        return f"contest:{contest_id}:sfu:publisher:{user_id}:{source_module}"
    return f"contest:{contest_id}:sfu:publisher:{user_id}"


def _publisher_keys(contest_id: int, user_id: int) -> list[str]:
    return [publisher_key(contest_id, user_id, source) for source in SOURCE_MODULES]


def _cache_timeout() -> int:
    return max(1, settings.LIVE_MONITORING_PUBLISHER_TTL_SECONDS)


def _preferred_publisher(publishers: list[dict[str, Any]]) -> dict[str, Any] | None:
    for source_module in SOURCE_MODULES:
        for publisher in publishers:
            if publisher.get("source_module") == source_module:
                return publisher
    return publishers[0] if publishers else None


def register_publisher(
    *,
    contest_id: int,
    user_id: int,
    session_id: str,
    track_name: str,
    room_id: str,
) -> dict[str, Any]:
    source_module = infer_source_module(track_name)
    payload = {
        "contest_id": contest_id,
        "user_id": user_id,
        "session_id": session_id,
        "track_name": track_name,
        "room_id": room_id,
        "source_module": source_module,
        "updated_at": timezone.now().isoformat(),
    }
    cache.set(
        publisher_key(contest_id, user_id, source_module),
        payload,
        timeout=_cache_timeout(),
    )
    cache.delete(publisher_key(contest_id, user_id))
    return payload


def refresh_publisher(
    contest_id: int,
    user_id: int,
    *,
    source_module: str | None = None,
) -> dict[str, Any] | None:
    if source_module in SOURCE_MODULES:
        keys = [publisher_key(contest_id, user_id, source_module)]
    else:
        keys = _publisher_keys(contest_id, user_id)
        keys.append(publisher_key(contest_id, user_id))

    refreshed: list[dict[str, Any]] = []
    for key in keys:
        payload = cache.get(key)
        if not isinstance(payload, dict):
            continue
        payload = {**payload, "updated_at": timezone.now().isoformat()}
        cache.set(key, payload, timeout=_cache_timeout())
        refreshed.append(payload)
    return _preferred_publisher(refreshed)


def get_publishers(contest_id: int, user_id: int) -> list[dict[str, Any]]:
    publishers: list[dict[str, Any]] = []
    for source_module in SOURCE_MODULES:
        payload = cache.get(publisher_key(contest_id, user_id, source_module))
        if isinstance(payload, dict):
            publishers.append(payload)
    legacy_payload = cache.get(publisher_key(contest_id, user_id))
    if isinstance(legacy_payload, dict):
        publishers.append(legacy_payload)
    return publishers


def get_publisher(
    contest_id: int,
    user_id: int,
    *,
    source_module: str | None = None,
) -> dict[str, Any] | None:
    if source_module in SOURCE_MODULES:
        payload = cache.get(publisher_key(contest_id, user_id, source_module))
        return payload if isinstance(payload, dict) else None
    payload = _preferred_publisher(get_publishers(contest_id, user_id))
    return payload if isinstance(payload, dict) else None


def get_preferred_publishers(contest_id: int, user_ids: list[int]) -> dict[int, dict[str, Any] | None]:
    if not user_ids:
        return {}

    key_to_user: dict[str, int] = {}
    keys_by_user: dict[int, list[str]] = {}
    for user_id in user_ids:
        keys = [publisher_key(contest_id, user_id, source) for source in SOURCE_MODULES]
        keys.append(publisher_key(contest_id, user_id))
        keys_by_user[user_id] = keys
        for key in keys:
            key_to_user[key] = user_id

    values = cache.get_many(key_to_user.keys())
    result: dict[int, dict[str, Any] | None] = {}
    for user_id, keys in keys_by_user.items():
        publishers = [
            payload
            for key in keys
            if isinstance((payload := values.get(key)), dict)
        ]
        result[user_id] = _preferred_publisher(publishers)
    return result


def get_publishers_by_user(contest_id: int, user_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    if not user_ids:
        return {}

    key_to_user: dict[str, int] = {}
    keys_by_user: dict[int, list[str]] = {}
    for user_id in user_ids:
        keys = [publisher_key(contest_id, user_id, source) for source in SOURCE_MODULES]
        keys.append(publisher_key(contest_id, user_id))
        keys_by_user[user_id] = keys
        for key in keys:
            key_to_user[key] = user_id

    values = cache.get_many(key_to_user.keys())
    result: dict[int, list[dict[str, Any]]] = {}
    for user_id, keys in keys_by_user.items():
        result[user_id] = [
            payload
            for key in keys
            if isinstance((payload := values.get(key)), dict)
        ]
    return result


def remove_publisher(
    contest_id: int,
    user_id: int,
    *,
    session_id: str | None = None,
    source_module: str | None = None,
) -> dict[str, Any] | None:
    if source_module in SOURCE_MODULES:
        keys = [publisher_key(contest_id, user_id, source_module)]
    else:
        keys = _publisher_keys(contest_id, user_id)
        keys.append(publisher_key(contest_id, user_id))

    for key in keys:
        payload = cache.get(key)
        if session_id and isinstance(payload, dict) and payload.get("session_id") != session_id:
            continue
        cache.delete(key)
    return get_publisher(contest_id, user_id)


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
