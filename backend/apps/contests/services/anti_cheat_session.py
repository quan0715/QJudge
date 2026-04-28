"""
Active exam session and conflict-resolution helpers.
"""
from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.core.cache import cache
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamStatus

ACTIVE_SESSION_KEY_PREFIX = "exam:active"
CONFLICT_TOKEN_KEY_PREFIX = "exam:conflict"
EVENT_IDEMPOTENCY_KEY_PREFIX = "exam:event:idempotency"
INCIDENT_FAMILY_KEY_PREFIX = "exam:incident_family"
INCIDENT_FAMILY_TTL_SECONDS = 2
HEARTBEAT_KEY_PREFIX = "exam:heartbeat"
HEARTBEAT_TIMEOUT_SECONDS = 60
# Key TTL must outlive the check interval to prevent false positives
HEARTBEAT_KEY_TTL_SECONDS = HEARTBEAT_TIMEOUT_SECONDS * 2
CONFLICT_TOKEN_TTL_SECONDS = 300
DEFAULT_ACTIVE_TTL_SECONDS = 2 * 60 * 60
DEFAULT_EVENT_IDEMPOTENCY_TTL_SECONDS = 1


@dataclass
class SessionConflict:
    contest: Contest
    participant: ContestParticipant
    key: str
    active_session: dict[str, Any] | None


def get_device_id(request) -> str:
    return (
        request.headers.get("X-Device-Id")
        or request.data.get("device_id")
        or request.query_params.get("device_id")
        or "unknown-device"
    )


def get_client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def get_token_jti(request) -> str:
    token = getattr(request, "auth", None)
    if token is None:
        return ""
    try:
        return str(token.get("jti", ""))
    except Exception:
        try:
            return str(token.payload.get("jti", ""))
        except Exception:
            return ""


def get_refresh_jti(request) -> str:
    """Extract the JTI from the refresh-token cookie (if present)."""
    from django.conf import settings

    cookie_name = getattr(settings, "JWT_AUTH_REFRESH_COOKIE", "refresh_token")
    raw = request.COOKIES.get(cookie_name)
    if not raw:
        return ""
    try:
        from rest_framework_simplejwt.tokens import RefreshToken

        token = RefreshToken(raw)
        return str(token.get("jti", ""))
    except Exception:
        return ""


def active_session_key(contest_id: int, user_id: int) -> str:
    return f"{ACTIVE_SESSION_KEY_PREFIX}:{contest_id}:{user_id}"


def conflict_token_key(token: str) -> str:
    return f"{CONFLICT_TOKEN_KEY_PREFIX}:{token}"


def exam_event_idempotency_key(contest_id: int, user_id: int, event_type: str, token: str) -> str:
    compact = token.strip()[:128]
    return f"{EVENT_IDEMPOTENCY_KEY_PREFIX}:{contest_id}:{user_id}:{event_type}:{compact}"


def incident_family_key(contest_id: int, user_id: int, family: str) -> str:
    return f"{INCIDENT_FAMILY_KEY_PREFIX}:{contest_id}:{user_id}:{family}"


def build_active_session_ttl(contest: Contest) -> int:
    if contest.end_time:
        remaining = int((contest.end_time - timezone.now()).total_seconds())
        return max(remaining + 30 * 60, 30 * 60)
    return DEFAULT_ACTIVE_TTL_SECONDS


def get_active_session(contest_id: int, user_id: int) -> dict[str, Any] | None:
    value = cache.get(active_session_key(contest_id, user_id))
    return value if isinstance(value, dict) else None


def get_active_sessions(contest_id: int, user_ids: list[int]) -> dict[int, dict[str, Any] | None]:
    if not user_ids:
        return {}
    key_by_user_id = {user_id: active_session_key(contest_id, user_id) for user_id in user_ids}
    values = cache.get_many(key_by_user_id.values())
    return {
        user_id: values.get(key) if isinstance(values.get(key), dict) else None
        for user_id, key in key_by_user_id.items()
    }


def set_active_session(contest: Contest, participant: ContestParticipant, request, device_id: str) -> None:
    payload = {
        "contest_id": contest.id,
        "participant_id": participant.id,
        "user_id": participant.user_id,
        "device_id": device_id,
        "ip": get_client_ip(request),
        "ua": request.META.get("HTTP_USER_AGENT", "")[:512],
        "jti": get_token_jti(request),
        "updated_at": timezone.now().isoformat(),
    }
    cache.set(
        active_session_key(contest.id, participant.user_id),
        payload,
        timeout=build_active_session_ttl(contest),
    )


def clear_active_session(contest_id: int, user_id: int) -> None:
    cache.delete(active_session_key(contest_id, user_id))


def find_exam_conflict(user, device_id: str) -> SessionConflict | None:
    now = timezone.now()
    active_participant = (
        ContestParticipant.objects.select_related("contest")
        .filter(
            user=user,
            contest__status="published",
            contest__start_time__lte=now,
            contest__end_time__gte=now,
            exam_status__in=[
                ExamStatus.IN_PROGRESS,
                ExamStatus.PAUSED,
                ExamStatus.LOCKED,
            ],
        )
        .order_by("-started_at", "-id")
        .first()
    )
    if not active_participant:
        return None

    contest = active_participant.contest
    key = active_session_key(contest.id, user.id)
    active = get_active_session(contest.id, user.id)

    # No active-session key still counts as conflict during active exam window.
    if active is None:
        return SessionConflict(
            contest=contest,
            participant=active_participant,
            key=key,
            active_session=None,
        )

    if active.get("device_id") == device_id:
        return None

    return SessionConflict(
        contest=contest,
        participant=active_participant,
        key=key,
        active_session=active,
    )


def create_conflict_token_payload(conflict: SessionConflict, request, device_id: str, provider: str) -> tuple[str, dict[str, Any]]:
    token = secrets.token_urlsafe(24)
    payload = {
        "user_id": conflict.participant.user_id,
        "contest_id": conflict.contest.id,
        "participant_id": conflict.participant.id,
        "device_id": device_id,
        "provider": provider,
        "requested_ip": get_client_ip(request),
        "requested_ua": request.META.get("HTTP_USER_AGENT", "")[:512],
        "created_at": timezone.now().isoformat(),
    }
    cache.set(conflict_token_key(token), payload, timeout=CONFLICT_TOKEN_TTL_SECONDS)
    return token, payload


def get_conflict_token_payload(token: str) -> dict[str, Any] | None:
    value = cache.get(conflict_token_key(token))
    return value if isinstance(value, dict) else None


def consume_conflict_token(token: str) -> dict[str, Any] | None:
    key = conflict_token_key(token)
    consume_lock_key = f"{key}:consume_lock"
    # Atomic guard to ensure token is consumed only once under concurrent requests.
    if not cache.add(consume_lock_key, 1, timeout=CONFLICT_TOKEN_TTL_SECONDS):
        return None
    value = cache.get(key)
    cache.delete(key)
    return value if isinstance(value, dict) else None


def is_duplicate_exam_event(
    *,
    contest_id: int,
    user_id: int,
    event_type: str,
    token: str | None,
    ttl_seconds: int = DEFAULT_EVENT_IDEMPOTENCY_TTL_SECONDS,
) -> bool:
    if not token:
        return False
    key = exam_event_idempotency_key(contest_id, user_id, event_type, token)
    # cache.add returns False when key already exists.
    return not cache.add(key, timezone.now().isoformat(), timeout=max(1, ttl_seconds))


def is_duplicate_incident_family(
    *,
    contest_id: int,
    user_id: int,
    family: str,
    ttl_seconds: int = INCIDENT_FAMILY_TTL_SECONDS,
) -> bool:
    """Return True if the same incident family was already penalized recently.

    Uses Redis SETNX so that the first event in a family window passes
    and subsequent ones (e.g. exit_fullscreen + mouse_leave both in
    ``display_escape``) are de-duplicated.
    """
    if not family:
        return False
    key = incident_family_key(contest_id, user_id, family)
    return not cache.add(key, "1", timeout=max(1, ttl_seconds))


def clear_incident_family(*, contest_id: int, user_id: int, family: str | None) -> None:
    if not family:
        return
    cache.delete(incident_family_key(contest_id, user_id, family))


def heartbeat_key(contest_id: int, user_id: int) -> str:
    return f"{HEARTBEAT_KEY_PREFIX}:{contest_id}:{user_id}"


def touch_heartbeat(contest_id: int, user_id: int) -> None:
    """Update heartbeat timestamp in Redis. TTL auto-expires stale keys."""
    cache.set(heartbeat_key(contest_id, user_id), timezone.now().isoformat(), timeout=HEARTBEAT_KEY_TTL_SECONDS)


def get_last_heartbeat(contest_id: int, user_id: int) -> str | None:
    value = cache.get(heartbeat_key(contest_id, user_id))
    return value if isinstance(value, str) else None


def get_last_heartbeats(contest_id: int, user_ids: list[int]) -> dict[int, str | None]:
    if not user_ids:
        return {}
    key_by_user_id = {user_id: heartbeat_key(contest_id, user_id) for user_id in user_ids}
    values = cache.get_many(key_by_user_id.values())
    return {
        user_id: values.get(key) if isinstance(values.get(key), str) else None
        for user_id, key in key_by_user_id.items()
    }


def clear_heartbeat(contest_id: int, user_id: int) -> None:
    cache.delete(heartbeat_key(contest_id, user_id))


# ---------------------------------------------------------------------------
# Part A: Blacklist other device tokens on exam start
# ---------------------------------------------------------------------------

EXAM_ALLOWED_JTI_PREFIX = "auth:exam_jti"
EXAM_ALLOWED_JTI_INDEX_PREFIX = "auth:exam_jti:index"
# Default TTL matches ACCESS_TOKEN_LIFETIME (8 h) + small buffer
_EXAM_JTI_LOCK_TTL_SECONDS = 8 * 60 * 60 + 600


def _legacy_exam_allowed_jti_key(user_id: int) -> str:
    return f"{EXAM_ALLOWED_JTI_PREFIX}:{user_id}"


def _exam_allowed_jti_key(user_id: int, contest_id) -> str:
    return f"{EXAM_ALLOWED_JTI_PREFIX}:{user_id}:{contest_id}"


def _exam_allowed_jti_index_key(user_id: int) -> str:
    return f"{EXAM_ALLOWED_JTI_INDEX_PREFIX}:{user_id}"


def _load_exam_jti_index(user_id: int) -> list[str]:
    value = cache.get(_exam_allowed_jti_index_key(user_id))
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _save_exam_jti_index(user_id: int, contest_ids: list[str]) -> None:
    cache.set(_exam_allowed_jti_index_key(user_id), contest_ids, timeout=_EXAM_JTI_LOCK_TTL_SECONDS)


def set_exam_allowed_jti(user_id: int, contest_id, jti: str) -> None:
    """Pin this user's allowed access-token JTI in Redis.

    While this key exists, ``is_access_token_allowed`` will reject any
    access token whose JTI does not match.
    """
    cache.set(_exam_allowed_jti_key(user_id, contest_id), jti, timeout=_EXAM_JTI_LOCK_TTL_SECONDS)
    contest_ids = _load_exam_jti_index(user_id)
    cid_str = str(contest_id)
    if cid_str not in contest_ids:
        contest_ids.append(cid_str)
    _save_exam_jti_index(user_id, contest_ids)


def clear_exam_allowed_jti(user_id: int, contest_id=None) -> None:
    """Remove JTI pin(s).

    - With contest_id: clear one contest-scoped pin.
    - Without contest_id: clear all indexed pins for this user.
    """
    cache.delete(_legacy_exam_allowed_jti_key(user_id))
    index_key = _exam_allowed_jti_index_key(user_id)
    contest_ids = _load_exam_jti_index(user_id)
    if contest_id is not None:
        cid_str = str(contest_id)
        cache.delete(_exam_allowed_jti_key(user_id, contest_id))
        if cid_str in contest_ids:
            contest_ids.remove(cid_str)
        if contest_ids:
            _save_exam_jti_index(user_id, contest_ids)
        else:
            cache.delete(index_key)
        return

    for cid in contest_ids:
        cache.delete(_exam_allowed_jti_key(user_id, cid))
    cache.delete(index_key)


def is_access_token_allowed(user_id: int, jti: str) -> bool:
    """Check whether the given access-token JTI is allowed.

    * If no pin exists → all tokens are allowed (normal operation).
    * If a pin exists → only the pinned JTI is allowed.
    """
    # Failsafe: if the user is no longer in an active exam lock state, release
    # any stale pin(s) to avoid login redirect loops.
    now = timezone.now()
    active_contest_ids = list(
        ContestParticipant.objects.filter(
            user_id=user_id,
            contest__status="published",
            contest__start_time__lte=now,
            contest__end_time__gte=now,
            exam_status__in=[
                ExamStatus.IN_PROGRESS,
                ExamStatus.PAUSED,
                ExamStatus.LOCKED,
            ],
        ).values_list("contest_id", flat=True)
    )
    if not active_contest_ids:
        clear_exam_allowed_jti(user_id)
        return True

    # Backward-compat: clear legacy single-key pin once contest-scoped pins are used.
    cache.delete(_legacy_exam_allowed_jti_key(user_id))

    for contest_id in active_contest_ids:
        allowed = cache.get(_exam_allowed_jti_key(user_id, contest_id))
        if allowed is None:
            continue
        if allowed != jti:
            return False
    return True


def blacklist_other_tokens(user, access_jti: str, refresh_jti: str = "", contest_id=None) -> int:
    """Blacklist all outstanding JWT tokens for *user* except the current
    session's refresh token **and** pin the allowed access-token JTI in Redis
    so that other devices' access tokens are immediately rejected at the
    authentication layer.

    *access_jti* is used for the Redis pin (``set_exam_allowed_jti``) when
    *contest_id* is provided.
    *refresh_jti* is used to exclude the current session's refresh token from
    blacklisting (``OutstandingToken.jti`` stores refresh-token JTIs).

    Returns the number of refresh tokens that were newly blacklisted.
    """
    from rest_framework_simplejwt.token_blacklist.models import (
        BlacklistedToken,
        OutstandingToken,
    )

    # 1) Blacklist refresh tokens (prevents token refresh)
    qs = OutstandingToken.objects.filter(user=user)
    if refresh_jti:
        qs = qs.exclude(jti=refresh_jti)
    tokens = qs
    count = 0
    for token in tokens:
        _, created = BlacklistedToken.objects.get_or_create(token=token)
        if created:
            count += 1

    # 2) Pin allowed JTI (immediately rejects other access tokens)
    if contest_id is not None:
        set_exam_allowed_jti(user.id, contest_id, access_jti)

    return count


# ---------------------------------------------------------------------------
# Part B: Standalone device-conflict check (usable outside ViewSet mixins)
# ---------------------------------------------------------------------------

def build_device_conflict_response(contest, participant, request):
    """Return a 409 ``Response`` if the request comes from a different device
    than the one holding the active session.  Returns ``None`` when there is
    no conflict.

    This check applies to ALL exam contests (not just cheat_detection_enabled)
    because device-session integrity is fundamental to exam fairness.
    """
    from rest_framework.response import Response
    from rest_framework import status as http_status
    from ..models import ExamEvent

    device_id = get_device_id(request)
    active = get_active_session(contest.id, participant.user_id)
    if active and active.get("device_id") and active.get("device_id") != device_id:
        ExamEvent.objects.create(
            contest=contest,
            user=participant.user,
            event_type="concurrent_login_detected",
            metadata={
                "existing_device_id": active.get("device_id"),
                "incoming_device_id": device_id,
                "source": "device_guard",
            },
        )
        return Response(
            {
                "code": "EXAM_ACTIVE_OTHER_DEVICE",
                "message": "Another device is currently active for this exam session.",
                "active_exam": {
                    "contest_id": contest.id,
                    "contest_name": contest.name,
                    "exam_status": participant.exam_status,
                    "started_at": participant.started_at,
                },
            },
            status=http_status.HTTP_409_CONFLICT,
        )
    return None
