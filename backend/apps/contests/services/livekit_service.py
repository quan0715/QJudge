"""QJudge's narrow, self-hosted LiveKit broker.

This module is the only backend boundary that knows about the LiveKit Python
SDK.  Exam authorization and the trusted integrity scope remain QJudge-owned;
the browser receives a short-lived participant token only after those checks
pass.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Iterable, Mapping
from uuid import UUID

import aiohttp
from django.conf import settings
from django.utils import timezone
from livekit import api
from rest_framework.exceptions import APIException

from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun, ExamStatus
from apps.contests.permissions import can_manage_contest
from apps.contests.services.anti_cheat_session import get_active_session, get_device_id
from apps.contests.services.anticheat_config import normalize_anticheat_device_policy
from apps.contests.services.exam_validation import validate_exam_operation

logger = logging.getLogger(__name__)

LIVE_SESSION_STATES = (
    ExamIntegrityRun.SessionState.PREPARED,
    ExamIntegrityRun.SessionState.ACTIVE,
    ExamIntegrityRun.SessionState.DRAINING,
)
LIVE_PUBLISHER_STATES = {
    ExamStatus.IN_PROGRESS,
    ExamStatus.PAUSED,
    ExamStatus.LOCKED,
}
LIVE_SOURCES = ("screen_share", "webcam")
LIVEKIT_SOURCE_NAMES = {"screen_share": "screen_share", "webcam": "camera"}
LIVEKIT_ROOM_MAX_PARTICIPANTS = 160
LIVEKIT_TOKEN_MAX_TTL_SECONDS = 120
LIVE_CLEANUP_PENDING_WARNING = "live_cleanup_pending"


class LiveMonitoringError(Exception):
    """A safe error that a LiveKit view can turn into an API response."""

    status_code = 400
    public_message = "Invalid live monitoring request."

    def __init__(self, message: str | None = None, *, status_code: int | None = None):
        super().__init__(message or self.public_message)
        self.public_message = message or self.public_message
        if status_code is not None:
            self.status_code = status_code


class LiveMonitoringBadRequest(LiveMonitoringError):
    status_code = 400


class LiveMonitoringForbidden(LiveMonitoringError):
    status_code = 403
    public_message = "You are not allowed to use live monitoring."


class LiveMonitoringConflict(LiveMonitoringError):
    status_code = 409
    public_message = "The exam live monitoring session is not available for this scope."


class LiveMonitoringUnavailable(LiveMonitoringError):
    status_code = 503
    public_message = "Live monitoring is temporarily unavailable."


@dataclass(frozen=True)
class LiveKitConfig:
    enabled: bool
    provider: str
    public_url: str
    internal_url: str
    api_key: str
    api_secret: str
    node_ip: str
    stun_host: str
    room_prefix: str
    token_ttl_seconds: int

    @property
    def configured(self) -> bool:
        return bool(
            self.enabled
            and self.provider == "livekit"
            and self.public_url
            and self.internal_url
            and self.api_key
            and self.api_secret
            and self.node_ip
            and self.stun_host
        )


@dataclass(frozen=True)
class LiveScope:
    contest_id: str
    run_id: str
    participant_id: int | None
    attempt_id: str | None
    device_id: str
    role: str
    room_name: str
    identity: str
    allowed_sources: tuple[str, ...]
    expires_at: datetime | None = None


def get_livekit_config() -> LiveKitConfig:
    enabled = bool(getattr(settings, "LIVE_MONITORING_ENABLED", False))
    provider = str(
        getattr(settings, "LIVE_MONITORING_PROVIDER", "livekit" if enabled else "disabled")
    ).strip().lower()
    return LiveKitConfig(
        enabled=enabled,
        provider=provider,
        public_url=str(getattr(settings, "LIVEKIT_PUBLIC_URL", "") or "").strip().rstrip("/"),
        internal_url=str(getattr(settings, "LIVEKIT_INTERNAL_URL", "") or "").strip().rstrip("/"),
        api_key=str(getattr(settings, "LIVEKIT_API_KEY", "") or "").strip(),
        api_secret=str(getattr(settings, "LIVEKIT_API_SECRET", "") or "").strip(),
        node_ip=str(getattr(settings, "LIVEKIT_NODE_IP", "") or "").strip(),
        stun_host=str(getattr(settings, "LIVEKIT_STUN_HOST", "") or "").strip(),
        room_prefix=str(getattr(settings, "LIVEKIT_ROOM_PREFIX", "qjudge-exam") or "qjudge-exam").strip(),
        token_ttl_seconds=int(getattr(settings, "LIVEKIT_TOKEN_TTL_SECONDS", 120)),
    )


def live_config_payload() -> dict[str, Any]:
    config = get_livekit_config()
    return {
        "enabled": config.enabled,
        "configured": config.configured,
        "provider": "livekit"
        if config.enabled and config.provider == "livekit"
        else "disabled",
    }


def _require_livekit_ready() -> LiveKitConfig:
    config = get_livekit_config()
    if not config.enabled:
        raise LiveMonitoringForbidden("Live monitoring is disabled.")
    if not config.configured:
        raise LiveMonitoringUnavailable()
    return config


def build_video_grants(role: str, room_name: str, sources: Iterable[str]) -> api.VideoGrants:
    """Build the least-privileged grant for one QJudge room participant."""

    normalized_role = str(role or "").strip().lower()
    if normalized_role not in {"publisher", "subscriber"}:
        raise LiveMonitoringBadRequest("role must be publisher or subscriber")
    normalized_sources = []
    for source in sources:
        source_name = str(source).strip()
        if source_name not in LIVEKIT_SOURCE_NAMES:
            raise LiveMonitoringBadRequest("unsupported live monitoring source")
        if source_name not in normalized_sources:
            normalized_sources.append(source_name)

    is_publisher = normalized_role == "publisher"
    return api.VideoGrants(
        room_create=False,
        room_list=False,
        room_record=False,
        room_admin=False,
        room_join=True,
        room=room_name,
        can_publish=is_publisher,
        can_subscribe=not is_publisher,
        can_publish_data=False,
        can_publish_sources=[LIVEKIT_SOURCE_NAMES[source] for source in normalized_sources],
        can_update_own_metadata=False,
    )


def _parse_uuid(value: Any, field: str) -> UUID:
    try:
        return UUID(str(value))
    except (AttributeError, TypeError, ValueError) as exc:
        raise LiveMonitoringBadRequest(f"{field} is invalid") from exc


def _parse_participant_id(value: Any) -> int:
    if isinstance(value, bool):
        raise LiveMonitoringBadRequest("participant_id is invalid")
    try:
        participant_id = int(value)
    except (TypeError, ValueError) as exc:
        raise LiveMonitoringBadRequest("participant_id is invalid") from exc
    if participant_id <= 0:
        raise LiveMonitoringBadRequest("participant_id is invalid")
    return participant_id


def _room_name(config: LiveKitConfig, run: ExamIntegrityRun) -> str:
    prefix = re.sub(r"[^A-Za-z0-9_.-]+", "-", config.room_prefix).strip("-._") or "qjudge-exam"
    return f"{prefix}-{run.pk}"


def live_room_name_for_run(run: ExamIntegrityRun) -> str:
    return _room_name(get_livekit_config(), run)


def build_live_identity(
    *,
    config: LiveKitConfig,
    run_id: str,
    participant_id: int | None,
    attempt_id: str | None,
    device_id: str,
    user_id: int,
) -> str:
    """Return an opaque, stable identity for one user/scope/run combination."""

    subject = str(participant_id if participant_id is not None else user_id)
    message = "|".join(
        (
            config.provider,
            str(getattr(settings, "LIVEKIT_ENVIRONMENT", "dev")),
            str(run_id),
            subject,
            str(attempt_id or ""),
            device_id,
        )
    ).encode("utf-8")
    digest = hmac.new(config.api_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return f"qj-{digest[:48]}"


def _current_live_run(contest: Contest) -> ExamIntegrityRun:
    run = (
        ExamIntegrityRun.objects.filter(
            contest=contest,
            data_state=ExamIntegrityRun.DataState.OPEN,
            session_state__in=LIVE_SESSION_STATES,
        )
        .order_by("-created_at")
        .first()
    )
    if run is None:
        raise LiveMonitoringConflict()
    return run


def _allowed_sources(contest: Contest, run: ExamIntegrityRun, active_session: Mapping[str, Any]) -> tuple[str, ...]:
    device_kind = active_session.get("device_kind")
    if device_kind not in {"desktop", "tablet"}:
        device_kind = "desktop"
    snapshot = run.policy_snapshot if isinstance(run.policy_snapshot, dict) else {}
    device_policy = snapshot.get("device_policy")
    if not isinstance(device_policy, dict):
        device_policy = normalize_anticheat_device_policy(contest.anticheat_device_policy)
    device = device_policy.get(device_kind)
    if not isinstance(device, dict) or device.get("enabled") is False:
        return ()
    sources = device.get("sources")
    if not isinstance(sources, dict):
        return ()
    return tuple(
        source
        for source in LIVE_SOURCES
        if isinstance(sources.get(source), dict) and sources[source].get("enabled") is True
    )


def _publisher_scope(request, contest: Contest, config: LiveKitConfig) -> LiveScope:
    if not ContestParticipant.objects.filter(contest=contest, user=request.user).exists():
        raise LiveMonitoringForbidden()
    try:
        participant = validate_exam_operation(
            contest,
            request.user,
            require_in_progress=False,
            allow_admin_bypass=False,
        )
    except APIException as exc:
        if getattr(exc, "status_code", 400) == 403:
            raise LiveMonitoringForbidden() from exc
        raise LiveMonitoringError(str(exc.detail)) from exc

    if participant is None or not contest.cheat_detection_enabled:
        raise LiveMonitoringForbidden()
    if participant.exam_status == ExamStatus.SUBMITTED:
        raise LiveMonitoringConflict("A submitted exam cannot publish live monitoring.")
    if participant.exam_status not in LIVE_PUBLISHER_STATES:
        raise LiveMonitoringConflict("The exam is not in a publishable state.")

    request_data = request.data if isinstance(request.data, Mapping) else {}
    raw_scope = request_data.get("upload_scope")
    if not isinstance(raw_scope, Mapping):
        raise LiveMonitoringBadRequest("upload_scope is required")
    required = {"run_id", "participant_id", "attempt_id", "device_id"}
    if not required.issubset(raw_scope):
        raise LiveMonitoringBadRequest("upload_scope is incomplete")

    run_id = _parse_uuid(raw_scope.get("run_id"), "run_id")
    participant_id = _parse_participant_id(raw_scope.get("participant_id"))
    attempt_id = _parse_uuid(raw_scope.get("attempt_id"), "attempt_id")
    device_id = raw_scope.get("device_id")
    if not isinstance(device_id, str) or not device_id.strip() or len(device_id) > 128:
        raise LiveMonitoringBadRequest("device_id is invalid")
    device_id = device_id.strip()

    run = ExamIntegrityRun.objects.filter(pk=run_id).first()
    if (
        run is None
        or run.contest_id != contest.id
        or participant_id != participant.pk
        or attempt_id != participant.integrity_attempt_id
        or device_id != get_device_id(request)
        or run.data_state != ExamIntegrityRun.DataState.OPEN
        or run.session_state not in LIVE_SESSION_STATES
    ):
        raise LiveMonitoringConflict()

    active_session = get_active_session(contest.id, request.user.id)
    if not isinstance(active_session, dict) or any(
        active_session.get(field) != expected
        for field, expected in (
            ("participant_id", participant.pk),
            ("user_id", request.user.id),
            ("device_id", device_id),
        )
    ):
        raise LiveMonitoringConflict("The live token must use the active exam device.")

    allowed_sources = _allowed_sources(contest, run, active_session)
    identity = build_live_identity(
        config=config,
        run_id=str(run.pk),
        participant_id=participant.pk,
        attempt_id=str(participant.integrity_attempt_id),
        device_id=device_id,
        user_id=request.user.id,
    )
    return LiveScope(
        contest_id=str(contest.id),
        run_id=str(run.pk),
        participant_id=participant.pk,
        attempt_id=str(participant.integrity_attempt_id),
        device_id=device_id,
        role="publisher",
        room_name=_room_name(config, run),
        identity=identity,
        allowed_sources=allowed_sources,
    )


def _subscriber_scope(request, contest: Contest, config: LiveKitConfig) -> LiveScope:
    if not can_manage_contest(request.user, contest):
        raise LiveMonitoringForbidden()
    run = _current_live_run(contest)
    device_id = get_device_id(request)
    identity = build_live_identity(
        config=config,
        run_id=str(run.pk),
        participant_id=None,
        attempt_id=None,
        device_id=device_id,
        user_id=request.user.id,
    )
    return LiveScope(
        contest_id=str(contest.id),
        run_id=str(run.pk),
        participant_id=None,
        attempt_id=None,
        device_id=device_id,
        role="subscriber",
        room_name=_room_name(config, run),
        identity=identity,
        allowed_sources=(),
    )


def resolve_live_scope(request, contest: Contest, role: str) -> LiveScope:
    normalized_role = str(role or "").strip().lower()
    if normalized_role not in {"publisher", "subscriber"}:
        raise LiveMonitoringBadRequest("role must be publisher or subscriber")
    config = _require_livekit_ready()
    if normalized_role == "publisher":
        return _publisher_scope(request, contest, config)
    if normalized_role == "subscriber":
        return _subscriber_scope(request, contest, config)


def _token_ttl(config: LiveKitConfig) -> int:
    try:
        configured = int(config.token_ttl_seconds)
    except (TypeError, ValueError) as exc:
        raise LiveMonitoringUnavailable() from exc
    return min(LIVEKIT_TOKEN_MAX_TTL_SECONDS, max(1, configured))


def mint_live_token(scope: LiveScope) -> dict[str, Any]:
    config = _require_livekit_ready()
    ttl_seconds = _token_ttl(config)
    grants = build_video_grants(scope.role, scope.room_name, scope.allowed_sources)
    try:
        token = (
            api.AccessToken(config.api_key, config.api_secret)
            .with_ttl(timedelta(seconds=ttl_seconds))
            .with_identity(scope.identity)
            .with_grants(grants)
            .to_jwt()
        )
    except Exception as exc:
        logger.warning("livekit_token_mint_failed")
        raise LiveMonitoringUnavailable() from exc
    expires_at = timezone.now() + timedelta(seconds=ttl_seconds)
    return {
        "server_url": config.public_url,
        "token": token,
        "room_name": scope.room_name,
        "identity": scope.identity,
        "run_id": scope.run_id,
        "role": scope.role,
        "allowed_sources": list(scope.allowed_sources),
        "expires_at": expires_at.isoformat(),
    }


async def _ensure_live_room_async(config: LiveKitConfig, room_name: str) -> None:
    timeout = aiohttp.ClientTimeout(total=3)
    async with api.LiveKitAPI(
        config.internal_url,
        api_key=config.api_key,
        api_secret=config.api_secret,
        timeout=timeout,
    ) as client:
        rooms = await client.room.list_rooms(api.ListRoomsRequest(names=[room_name]))
        if any(room.name == room_name for room in rooms.rooms):
            return
        try:
            await client.room.create_room(
                api.CreateRoomRequest(
                    name=room_name,
                    max_participants=LIVEKIT_ROOM_MAX_PARTICIPANTS,
                )
            )
        except Exception:
            # A concurrent token request may have created the room between the
            # list and create calls. Re-check before surfacing a real outage.
            rooms = await client.room.list_rooms(api.ListRoomsRequest(names=[room_name]))
            if not any(room.name == room_name for room in rooms.rooms):
                raise


def ensure_live_room(scope: LiveScope) -> None:
    config = _require_livekit_ready()
    try:
        asyncio.run(_ensure_live_room_async(config, scope.room_name))
    except LiveMonitoringError:
        raise
    except Exception as exc:
        logger.warning("livekit_room_ensure_failed room=%s", scope.room_name)
        raise LiveMonitoringUnavailable() from exc


async def _close_live_room_async(config: LiveKitConfig, room_name: str) -> None:
    timeout = aiohttp.ClientTimeout(total=3)
    async with api.LiveKitAPI(
        config.internal_url,
        api_key=config.api_key,
        api_secret=config.api_secret,
        timeout=timeout,
    ) as client:
        rooms = await client.room.list_rooms(api.ListRoomsRequest(names=[room_name]))
        if not any(room.name == room_name for room in rooms.rooms):
            return
        await client.room.delete_room(api.DeleteRoomRequest(room=room_name))


def close_live_room(room_name: str) -> bool:
    """Best-effort room cleanup; exam submission must never roll back on it."""

    config = get_livekit_config()
    if not config.configured or not room_name:
        return False
    try:
        asyncio.run(_close_live_room_async(config, room_name))
    except Exception:
        logger.warning("livekit_room_close_failed room=%s", room_name)
        return False
    return True


def set_live_cleanup_warning(run_id, *, pending: bool) -> None:
    """Persist a retry marker without changing the committed Run state."""

    from django.db import transaction

    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().filter(pk=run_id).first()
        if run is None:
            return
        warnings = list(run.warnings) if isinstance(run.warnings, list) else []
        if pending:
            if LIVE_CLEANUP_PENDING_WARNING not in warnings:
                warnings.append(LIVE_CLEANUP_PENDING_WARNING)
        else:
            warnings = [warning for warning in warnings if warning != LIVE_CLEANUP_PENDING_WARNING]
        if warnings != run.warnings:
            run.warnings = warnings
            run.save(update_fields=["warnings", "updated_at"])


def close_live_room_for_run(run: ExamIntegrityRun) -> bool:
    """Close one Run room after its database lifecycle commit.

    A disabled provider is an intentional no-op. Configured-provider failures
    are recorded for the explicit cleanup command and never escape into the
    exam/archive transaction.
    """

    config = get_livekit_config()
    if not config.enabled:
        return True
    if not config.configured:
        set_live_cleanup_warning(run.pk, pending=True)
        return False
    success = close_live_room(_room_name(config, run))
    set_live_cleanup_warning(run.pk, pending=not success)
    return success
