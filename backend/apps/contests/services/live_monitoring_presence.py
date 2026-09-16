"""Shared, server-verified LiveKit presence snapshots for proctors."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Iterable

import aiohttp
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun
from apps.contests.services.anti_cheat_session import get_active_sessions
from apps.contests.services.livekit_service import (
    LIVE_PUBLISHER_STATES,
    LIVE_SESSION_STATES,
    LIVE_SOURCES,
    _allowed_sources,
    _room_name,
    build_live_identity,
    get_livekit_config,
)
from livekit import api

logger = logging.getLogger(__name__)

PRESENCE_CACHE_TTL_SECONDS = 10
PRESENCE_LOCK_TTL_SECONDS = 5
PRESENCE_REQUEST_TIMEOUT_SECONDS = 3


def live_presence_cache_key(run_id: str) -> str:
    environment = str(getattr(settings, "LIVEKIT_ENVIRONMENT", "dev") or "dev").strip()
    return f"livekit:presence:{environment}:{run_id}"


def live_presence_lock_key(run_id: str) -> str:
    return f"{live_presence_cache_key(run_id)}:lock"


def empty_live_snapshot(*, status: str = "unknown") -> dict[str, Any]:
    return {
        "observed_at": None,
        "stale": True,
        "targets": [],
        "_status": status,
    }


def current_live_run(contest: Contest) -> ExamIntegrityRun | None:
    return (
        ExamIntegrityRun.objects.filter(
            contest=contest,
            data_state=ExamIntegrityRun.DataState.OPEN,
            session_state__in=LIVE_SESSION_STATES,
        )
        .order_by("-created_at")
        .first()
    )


def live_monitoring_status(snapshot: dict[str, Any] | None) -> str:
    if not isinstance(snapshot, dict):
        return "unknown"
    status = snapshot.get("_status")
    if snapshot.get("stale", True):
        return "unavailable" if status == "unavailable" else "unknown"
    if status in {"available", "unavailable", "unknown"}:
        return status
    return "available"


def target_for_user(
    snapshot: dict[str, Any] | None,
    user_id: int | str,
) -> dict[str, Any] | None:
    if not isinstance(snapshot, dict):
        return None
    expected = str(user_id)
    for target in snapshot.get("targets", []):
        if isinstance(target, dict) and str(target.get("user_id")) == expected:
            return target
    return None


def _source_name(value: Any) -> str | None:
    if value in (1, "1", "CAMERA", "camera"):
        return "webcam"
    if value in (3, "3", "SCREEN_SHARE", "screen_share"):
        return "screen_share"
    return None


def _iter_tracks(participant: Any) -> Iterable[Any]:
    tracks = getattr(participant, "tracks", None)
    if tracks is None and isinstance(participant, dict):
        tracks = participant.get("tracks")
    if tracks is None:
        return ()
    try:
        return iter(tracks)
    except TypeError:
        return ()


async def _list_livekit_participants(config, run: ExamIntegrityRun) -> list[Any]:
    timeout = aiohttp.ClientTimeout(total=PRESENCE_REQUEST_TIMEOUT_SECONDS)
    async with api.LiveKitAPI(
        config.internal_url,
        api_key=config.api_key,
        api_secret=config.api_secret,
        timeout=timeout,
    ) as client:
        response = await client.room.list_participants(
            api.ListParticipantsRequest(room=_room_name(config, run))
        )
        return list(response.participants)


def _expected_identities(
    contest: Contest,
    run: ExamIntegrityRun,
    config,
) -> dict[str, tuple[ContestParticipant, tuple[str, ...]]]:
    participants = list(
        ContestParticipant.objects.filter(
            contest=contest,
            exam_status__in=LIVE_PUBLISHER_STATES,
        ).select_related("user")
    )
    sessions = get_active_sessions(contest.id, [participant.user_id for participant in participants])
    expected: dict[str, tuple[ContestParticipant, tuple[str, ...]]] = {}
    for participant in participants:
        session = sessions.get(participant.user_id)
        if not isinstance(session, dict):
            continue
        if (
            session.get("participant_id") != participant.pk
            or session.get("user_id") != participant.user_id
            or not isinstance(session.get("device_id"), str)
            or not session.get("device_id")
            or not participant.integrity_attempt_id
        ):
            continue
        allowed_sources = _allowed_sources(contest, run, session)
        identity = build_live_identity(
            config=config,
            run_id=str(run.pk),
            participant_id=participant.pk,
            attempt_id=str(participant.integrity_attempt_id),
            device_id=session["device_id"],
            user_id=participant.user_id,
        )
        expected[identity] = (participant, allowed_sources)
    return expected


def _track_source(track: Any) -> Any:
    if isinstance(track, dict):
        return track.get("source")
    return getattr(track, "source", None)


def _build_snapshot(
    contest: Contest,
    run: ExamIntegrityRun,
    config,
    livekit_participants: Iterable[Any],
) -> dict[str, Any]:
    if str(run.contest_id) != str(contest.id):
        return {
            "observed_at": timezone.now().isoformat(),
            "stale": False,
            "targets": [],
            "_status": "unavailable",
        }
    expected = _expected_identities(contest, run, config)
    targets: list[dict[str, Any]] = []
    for remote in livekit_participants:
        identity = getattr(remote, "identity", None)
        if identity is None and isinstance(remote, dict):
            identity = remote.get("identity")
        match = expected.get(str(identity))
        if match is None:
            continue
        participant, allowed_sources = match
        published = {
            source
            for track in _iter_tracks(remote)
            for source in [_source_name(_track_source(track))]
            if source in allowed_sources
        }
        sources = [source for source in LIVE_SOURCES if source in published]
        if sources:
            targets.append({
                "user_id": participant.user_id,
                "identity": str(identity),
                "sources": sources,
            })
    targets.sort(key=lambda target: str(target["user_id"]))
    return {
        "observed_at": timezone.now().isoformat(),
        "stale": False,
        "targets": targets,
        "_status": "available",
    }


def get_live_snapshot(contest: Contest, run: ExamIntegrityRun) -> dict[str, Any]:
    """Return one cached snapshot for a Run; never mark stale data as live."""

    config = get_livekit_config()
    if not config.enabled:
        return empty_live_snapshot(status="unavailable")
    if not config.configured:
        return empty_live_snapshot(status="unavailable")

    cache_key = live_presence_cache_key(str(run.pk))
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        return cached

    lock_key = live_presence_lock_key(str(run.pk))
    lock_value = uuid.uuid4().hex
    if not cache.add(lock_key, lock_value, timeout=PRESENCE_LOCK_TTL_SECONDS):
        return empty_live_snapshot(status="unknown")

    try:
        cached = cache.get(cache_key)
        if isinstance(cached, dict):
            return cached
        try:
            participants = asyncio.run(_list_livekit_participants(config, run))
        except Exception:
            logger.warning("livekit_presence_fetch_failed run=%s", run.pk)
            return empty_live_snapshot(status="unknown")
        snapshot = _build_snapshot(contest, run, config, participants)
        cache.set(cache_key, snapshot, timeout=PRESENCE_CACHE_TTL_SECONDS)
        return snapshot
    finally:
        # The short lease bounds contention; avoid holding it after a completed
        # fetch. A lease token is still used so the key is never user input.
        if cache.get(lock_key) == lock_value:
            cache.delete(lock_key)
