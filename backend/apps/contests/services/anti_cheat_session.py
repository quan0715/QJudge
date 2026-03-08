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
CONFLICT_TOKEN_TTL_SECONDS = 300
DEFAULT_ACTIVE_TTL_SECONDS = 2 * 60 * 60
DEFAULT_EVENT_IDEMPOTENCY_TTL_SECONDS = 3


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


def active_session_key(contest_id: int, user_id: int) -> str:
    return f"{ACTIVE_SESSION_KEY_PREFIX}:{contest_id}:{user_id}"


def conflict_token_key(token: str) -> str:
    return f"{CONFLICT_TOKEN_KEY_PREFIX}:{token}"


def exam_event_idempotency_key(contest_id: int, user_id: int, event_type: str, token: str) -> str:
    compact = token.strip()[:128]
    return f"{EVENT_IDEMPOTENCY_KEY_PREFIX}:{contest_id}:{user_id}:{event_type}:{compact}"


def build_active_session_ttl(contest: Contest) -> int:
    if contest.end_time:
        remaining = int((contest.end_time - timezone.now()).total_seconds())
        return max(remaining + 30 * 60, 30 * 60)
    return DEFAULT_ACTIVE_TTL_SECONDS


def get_active_session(contest_id: int, user_id: int) -> dict[str, Any] | None:
    value = cache.get(active_session_key(contest_id, user_id))
    return value if isinstance(value, dict) else None


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
                ExamStatus.LOCKED_TAKEOVER,
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
