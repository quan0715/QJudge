"""QR attendance domain service."""
from __future__ import annotations

import secrets
from typing import Any, Callable

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamEvent, ExamEvidenceFrame, ExamStatus
from apps.contests.permissions import can_manage_contest

ATTENDANCE_REFRESH_SECONDS = 30
ATTENDANCE_TOKEN_MAX_AGE_SECONDS = 45
ATTENDANCE_QR_PREFIX = "qj-att:v1"
ATTENDANCE_CACHE_PREFIX = "contest-attendance-token"
ATTENDANCE_EVENT_TYPES = {
    "check_in": "attendance_check_in",
    "check_out": "attendance_check_out",
}
ATTENDANCE_EVENT_PURPOSES = {value: key for key, value in ATTENDANCE_EVENT_TYPES.items()}
ATTENDANCE_READY_STATUSES = {"photo_confirmed", "teacher_assisted"}


def _token_cache_key(token: str) -> str:
    return f"{ATTENDANCE_CACHE_PREFIX}:{token}"


def create_attendance_token(contest: Contest, purpose: str) -> str:
    if purpose not in ATTENDANCE_EVENT_TYPES:
        raise ValueError("invalid_attendance_purpose")
    token = secrets.token_urlsafe(32)
    cache.set(
        _token_cache_key(token),
        {
            "contest_id": str(contest.id),
            "purpose": purpose,
            "issued_at": timezone.now().isoformat(),
        },
        timeout=ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
    )
    return token


def build_attendance_qr_value(purpose: str, token: str) -> str:
    return f"{ATTENDANCE_QR_PREFIX}:{purpose}:{token}"


def validate_attendance_token(contest: Contest, purpose: str, token: str) -> dict[str, Any]:
    if purpose not in ATTENDANCE_EVENT_TYPES:
        raise ValueError("invalid_attendance_purpose")
    value = cache.get(_token_cache_key(token))
    if not isinstance(value, dict):
        raise ValueError("invalid_attendance_token")
    if str(value.get("contest_id")) != str(contest.id) or value.get("purpose") != purpose:
        raise ValueError("invalid_attendance_token")
    return value


def _latest_attendance_event(contest: Contest, participant: ContestParticipant, event_type: str) -> ExamEvent | None:
    return (
        ExamEvent.objects.filter(contest=contest, user=participant.user, event_type=event_type)
        .order_by("-created_at", "-id")
        .first()
    )


def _uploaded_evidence_count(event: ExamEvent | None) -> int:
    if event is None:
        return 0
    return ExamEvidenceFrame.objects.filter(
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
    ).count()


def _status_for_event(event: ExamEvent | None) -> str:
    if event is None:
        return "missing"
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    if metadata.get("attendance_mode") == "teacher_assisted":
        return "teacher_assisted"
    if _uploaded_evidence_count(event) > 0:
        return "photo_confirmed"
    return "event_created"


def build_attendance_status(contest: Contest, participant: ContestParticipant | None) -> dict[str, Any]:
    if not contest.attendance_check_enabled:
        return {
            "attendanceRequired": False,
            "checkInStatus": "not_required",
            "checkOutStatus": "unavailable",
            "canCheckIn": False,
            "canStartExam": True,
            "canCheckOut": False,
        }
    if participant is None:
        return {
            "attendanceRequired": True,
            "checkInStatus": "missing",
            "checkOutStatus": "unavailable",
            "canCheckIn": True,
            "canStartExam": False,
            "canCheckOut": False,
        }

    check_in_event = _latest_attendance_event(contest, participant, ATTENDANCE_EVENT_TYPES["check_in"])
    check_out_event = _latest_attendance_event(contest, participant, ATTENDANCE_EVENT_TYPES["check_out"])
    check_in_status = _status_for_event(check_in_event)
    check_out_status = "unavailable"
    if participant.exam_status == ExamStatus.SUBMITTED:
        check_out_status = _status_for_event(check_out_event)

    now = timezone.now()
    global_start_ready = contest.start_time is None or now >= contest.start_time
    attendance_ready = check_in_status in ATTENDANCE_READY_STATUSES
    return {
        "attendanceRequired": True,
        "checkInStatus": check_in_status,
        "checkOutStatus": check_out_status,
        "canCheckIn": participant.exam_status == ExamStatus.NOT_STARTED,
        "canStartExam": attendance_ready and global_start_ready,
        "canCheckOut": participant.exam_status == ExamStatus.SUBMITTED,
    }


def assert_attendance_allows_start(contest: Contest, participant: ContestParticipant) -> None:
    status = build_attendance_status(contest, participant)
    if status["attendanceRequired"] and not status["canStartExam"]:
        raise ValueError("attendance_check_in_required")


def create_attendance_event(
    *,
    contest: Contest,
    actor,
    data: dict[str, Any],
    ensure_participant: Callable,
) -> dict[str, Any]:
    mode = data["mode"]
    purpose = data["purpose"]

    if mode == "student_self_scan":
        if data.get("user_id"):
            raise ValueError("user_id_forbidden_for_self_scan")
        token = str(data.get("token") or "")
        if not token:
            raise ValueError("attendance_token_required")
        validate_attendance_token(contest, purpose, token)
        participant, _created, error_response = ensure_participant(contest, actor)
        if error_response is not None:
            return {"error_response": error_response}
        if participant is None:
            participant = ContestParticipant.objects.filter(contest=contest, user=actor).first()
        if participant is None:
            raise ValueError("not_registered")
        if purpose == "check_in" and participant.exam_status != ExamStatus.NOT_STARTED:
            return {"error_code": "check_in_only_before_personal_start"}
        if purpose == "check_out" and participant.exam_status != ExamStatus.SUBMITTED:
            return {"error_code": "checkout_not_available_until_submitted"}
        target_user = actor
        metadata = {
            "attendance_purpose": purpose,
            "attendance_mode": "student_self_scan",
            "source_module": ExamEvidenceFrame.SourceModule.ATTENDANCE,
            "device_kind": str(data.get("device_kind") or ""),
            "client_observed_at_ms": data.get("client_observed_at_ms"),
            "photo_required": True,
        }
    elif mode == "teacher_assisted":
        if not can_manage_contest(actor, contest):
            raise ValueError("attendance_teacher_permission_required")
        if data.get("token"):
            raise ValueError("token_forbidden_for_teacher_assisted")
        if not data.get("user_id"):
            raise ValueError("user_id_required")
        reason = str(data.get("reason") or "").strip()
        if not reason:
            raise ValueError("reason_required")
        try:
            participant = ContestParticipant.objects.select_related("user").get(
                contest=contest,
                user_id=data["user_id"],
            )
        except ContestParticipant.DoesNotExist:
            raise ValueError("participant_not_found") from None
        target_user = participant.user
        metadata = {
            "attendance_purpose": purpose,
            "attendance_mode": "teacher_assisted",
            "assisted_by_user_id": actor.id,
            "assisted_by_username": actor.username,
            "reason": reason,
            "source_module": ExamEvidenceFrame.SourceModule.ATTENDANCE,
            "photo_required": True,
        }
    else:
        raise ValueError("invalid_attendance_mode")

    event = ExamEvent.objects.create(
        contest=contest,
        user=target_user,
        event_type=ATTENDANCE_EVENT_TYPES[purpose],
        metadata=metadata,
    )
    evidence_cluster_id = f"attendance-{event.id}"
    metadata["evidence_cluster_id"] = evidence_cluster_id
    event.metadata = metadata
    event.save(update_fields=["metadata"])
    return {
        "payload": {
            "event_id": event.id,
            "purpose": purpose,
            "source_module": ExamEvidenceFrame.SourceModule.ATTENDANCE,
            "evidence_cluster_id": evidence_cluster_id,
            "recorded_at": event.created_at.isoformat(),
            "attendance_status": build_attendance_status(contest, participant),
        }
    }


def build_participant_attendance_summary(contest: Contest, participant: ContestParticipant) -> dict[str, Any]:
    events = list(
        ExamEvent.objects.filter(
            contest=contest,
            user=participant.user,
            event_type__in=ATTENDANCE_EVENT_PURPOSES.keys(),
        )
        .annotate(
            uploaded_evidence_count=Count(
                "evidence_frames",
                filter=Q(
                    evidence_frames__source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
                    evidence_frames__status=ExamEvidenceFrame.Status.UPLOADED,
                ),
            )
        )
        .order_by("created_at", "id")
    )
    serialized_events = []
    anomalies = set()
    for event in events:
        metadata = event.metadata if isinstance(event.metadata, dict) else {}
        evidence_count = int(getattr(event, "uploaded_evidence_count", 0) or 0)
        mode = str(metadata.get("attendance_mode") or "")
        if mode == "student_self_scan" and evidence_count == 0:
            anomalies.add("missing_photo")
        serialized_events.append(
            {
                "eventId": str(event.id),
                "purpose": ATTENDANCE_EVENT_PURPOSES.get(event.event_type, ""),
                "recordedAt": event.created_at.isoformat(),
                "mode": mode,
                "evidenceCount": evidence_count,
                "metadata": metadata,
            }
        )

    status = build_attendance_status(contest, participant)
    if contest.attendance_check_enabled and status["checkInStatus"] == "missing":
        anomalies.add("missing_check_in")
    if participant.exam_status == ExamStatus.SUBMITTED and status["checkOutStatus"] == "missing":
        anomalies.add("missing_check_out")
    return {
        "status": status,
        "events": serialized_events,
        "anomalies": sorted(anomalies),
    }
