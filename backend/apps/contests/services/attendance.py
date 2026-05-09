"""QR attendance domain service."""
from __future__ import annotations

import secrets
import string
from typing import Any, Callable, Literal, get_args

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamEvidenceFrame,
    ExamStatus,
)
from apps.contests.permissions import can_manage_contest
from apps.contests.services.participant_state import reset_participant_exam_record

ATTENDANCE_REFRESH_SECONDS = 30
ATTENDANCE_TOKEN_MAX_AGE_SECONDS = 45
ATTENDANCE_QR_PREFIX = "qj-att:v1"
ATTENDANCE_CACHE_PREFIX = "contest-attendance-token"
ATTENDANCE_MANUAL_CODE_CACHE_PREFIX = "contest-attendance-manual-code"
ATTENDANCE_MANUAL_CODE_ALPHABET = "0123456789"
ATTENDANCE_MANUAL_CODE_LENGTH = 6
ATTENDANCE_EVENT_TYPES = {
    "check_in": "attendance_check_in",
    "check_out": "attendance_check_out",
}
ATTENDANCE_EVENT_PURPOSES = {value: key for key, value in ATTENDANCE_EVENT_TYPES.items()}
ATTENDANCE_READY_STATUSES = {"photo_confirmed", "teacher_assisted"}
ATTENDANCE_PHOTO_KIND_BY_POLICY = {
    "room": ["room"],
    "room_and_selfie": ["room", "selfie"],
}

# Single source of truth for attendance error codes. Mirror this list verbatim
# in frontend/src/features/contest/attendance/attendanceErrorCodes.ts; the
# parity is asserted by tests on both sides.
AttendanceErrorCode = Literal[
    "attendance_check_in_required",
    "attendance_credential_conflict",
    "attendance_manual_code_generation_failed",
    "attendance_not_enabled",
    "attendance_teacher_permission_required",
    "attendance_token_required",
    "check_in_only_before_personal_start",
    "checkout_not_available_until_submitted",
    "invalid_attendance_manual_code",
    "invalid_attendance_mode",
    "invalid_attendance_purpose",
    "invalid_attendance_request",
    "invalid_attendance_token",
    "not_registered",
    "participant_not_found",
    "reason_required",
    "token_forbidden_for_teacher_assisted",
    "user_id_forbidden_for_self_scan",
    "user_id_required",
]
ATTENDANCE_ERROR_CODES: tuple[AttendanceErrorCode, ...] = get_args(AttendanceErrorCode)

ATTENDANCE_ERROR_MESSAGES: dict[AttendanceErrorCode, str] = {
    "attendance_check_in_required": (
        "Please complete attendance check-in before starting the exam."
    ),
    "attendance_credential_conflict": "Use either QR token or manual code, not both.",
    "attendance_manual_code_generation_failed": (
        "Failed to generate an attendance code. Please try again."
    ),
    "attendance_not_enabled": "Attendance check-in is not enabled for this contest.",
    "attendance_teacher_permission_required": (
        "You do not have permission to record attendance for this contest."
    ),
    "attendance_token_required": "Attendance token or manual code is required.",
    "check_in_only_before_personal_start": "Check-in is only available before entering the exam.",
    "checkout_not_available_until_submitted": "Check-out is only available after submitting the exam.",
    "invalid_attendance_manual_code": "The attendance code is invalid or expired.",
    "invalid_attendance_mode": "Invalid attendance mode.",
    "invalid_attendance_purpose": "Invalid attendance purpose.",
    "invalid_attendance_request": "Invalid attendance request.",
    "invalid_attendance_token": "The attendance QR code is invalid or expired.",
    "not_registered": "You are not registered for this contest.",
    "participant_not_found": "Participant not found.",
    "reason_required": "Reason is required.",
    "token_forbidden_for_teacher_assisted": "QR token is not accepted for teacher-assisted attendance.",
    "user_id_forbidden_for_self_scan": "User id is not accepted for student self scan.",
    "user_id_required": "Participant user id is required.",
}
assert set(ATTENDANCE_ERROR_MESSAGES.keys()) == set(ATTENDANCE_ERROR_CODES), (
    "ATTENDANCE_ERROR_MESSAGES must define a message for every AttendanceErrorCode"
)


def _token_cache_key(token: str) -> str:
    return f"{ATTENDANCE_CACHE_PREFIX}:{token}"


def _manual_code_cache_key(code: str) -> str:
    return f"{ATTENDANCE_MANUAL_CODE_CACHE_PREFIX}:{code}"


def normalize_attendance_error_code(error: ValueError) -> str:
    code = str(error)
    return code if code in ATTENDANCE_ERROR_MESSAGES else "invalid_attendance_request"


def build_attendance_error_payload(code: str) -> dict[str, Any]:
    safe_code = code if code in ATTENDANCE_ERROR_MESSAGES else "invalid_attendance_request"
    return {
        "code": safe_code,
        "error": {
            "message": ATTENDANCE_ERROR_MESSAGES[safe_code],
        },
    }


def normalize_attendance_manual_code(value: str) -> str:
    return "".join(char for char in value if char in string.digits)


def format_attendance_manual_code(value: str) -> str:
    return normalize_attendance_manual_code(value)


def _generate_attendance_manual_code() -> str:
    return "".join(secrets.choice(ATTENDANCE_MANUAL_CODE_ALPHABET) for _ in range(ATTENDANCE_MANUAL_CODE_LENGTH))


def create_attendance_credential(contest: Contest, purpose: str) -> dict[str, str]:
    if purpose not in ATTENDANCE_EVENT_TYPES:
        raise ValueError("invalid_attendance_purpose")
    token = secrets.token_urlsafe(32)
    for _attempt in range(12):
        manual_code = _generate_attendance_manual_code()
        payload = {
            "contest_id": str(contest.id),
            "purpose": purpose,
            "token": token,
            "manual_code": manual_code,
            "issued_at": timezone.now().isoformat(),
        }
        if cache.add(
            _manual_code_cache_key(manual_code),
            payload,
            timeout=ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
        ):
            cache.set(
                _token_cache_key(token),
                payload,
                timeout=ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
            )
            return {
                "token": token,
                "manual_code": format_attendance_manual_code(manual_code),
            }
    raise ValueError("attendance_manual_code_generation_failed")


def create_attendance_token(contest: Contest, purpose: str) -> str:
    return create_attendance_credential(contest, purpose)["token"]


def validate_attendance_cache_payload(contest: Contest, purpose: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("invalid_attendance_token")
    if str(value.get("contest_id")) != str(contest.id) or value.get("purpose") != purpose:
        raise ValueError("invalid_attendance_token")
    return value


def validate_attendance_token(contest: Contest, purpose: str, token: str) -> dict[str, Any]:
    if purpose not in ATTENDANCE_EVENT_TYPES:
        raise ValueError("invalid_attendance_purpose")
    value = cache.get(_token_cache_key(token))
    return validate_attendance_cache_payload(contest, purpose, value)


def validate_attendance_manual_code(contest: Contest, purpose: str, manual_code: str) -> dict[str, Any]:
    if purpose not in ATTENDANCE_EVENT_TYPES:
        raise ValueError("invalid_attendance_purpose")
    normalized = normalize_attendance_manual_code(manual_code)
    if len(normalized) != ATTENDANCE_MANUAL_CODE_LENGTH:
        raise ValueError("invalid_attendance_manual_code")
    value = cache.get(_manual_code_cache_key(normalized))
    try:
        return validate_attendance_cache_payload(contest, purpose, value)
    except ValueError:
        raise ValueError("invalid_attendance_manual_code") from None


def build_attendance_qr_value(purpose: str, token: str) -> str:
    return f"{ATTENDANCE_QR_PREFIX}:{purpose}:{token}"


def get_attendance_required_photo_kinds(contest: Contest) -> list[str]:
    return ATTENDANCE_PHOTO_KIND_BY_POLICY.get(contest.attendance_photo_policy or "room", ["room"])


def _uploaded_evidence_count(event: ExamEvent | None) -> int:
    if event is None:
        return 0
    return ExamEvidenceFrame.objects.filter(
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
    ).count()


def _status_for_event(contest: Contest, event: ExamEvent | None) -> str:
    if event is None:
        return "missing"
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    uploaded_evidence_count = _uploaded_evidence_count(event)
    required_evidence_count = len(get_attendance_required_photo_kinds(contest))
    if metadata.get("attendance_mode") == "teacher_assisted":
        return "teacher_assisted" if uploaded_evidence_count >= required_evidence_count else "event_created"
    if uploaded_evidence_count >= required_evidence_count:
        return "photo_confirmed"
    return "event_created"


def _status_for_attendance_purpose(contest: Contest, participant: ContestParticipant, event_type: str) -> str:
    events = list(
        ExamEvent.objects.filter(contest=contest, user=participant.user, event_type=event_type)
        .order_by("-created_at", "-id")
    )
    if not events:
        return "missing"
    latest_status = _status_for_event(contest, events[0])
    if latest_status in ATTENDANCE_READY_STATUSES:
        return latest_status
    for event in events[1:]:
        status = _status_for_event(contest, event)
        if status in ATTENDANCE_READY_STATUSES:
            return status
    return latest_status


def build_attendance_status(contest: Contest, participant: ContestParticipant | None) -> dict[str, Any]:
    if not contest.attendance_check_enabled:
        return {
            "attendanceRequired": False,
            "photoPolicy": contest.attendance_photo_policy,
            "requiredPhotoKinds": get_attendance_required_photo_kinds(contest),
            "checkInStatus": "not_required",
            "checkOutStatus": "unavailable",
            "canCheckIn": False,
            "canStartExam": True,
            "canCheckOut": False,
        }
    if participant is None:
        return {
            "attendanceRequired": True,
            "photoPolicy": contest.attendance_photo_policy,
            "requiredPhotoKinds": get_attendance_required_photo_kinds(contest),
            "checkInStatus": "missing",
            "checkOutStatus": "unavailable",
            "canCheckIn": True,
            "canStartExam": False,
            "canCheckOut": False,
        }

    check_in_status = _status_for_attendance_purpose(contest, participant, ATTENDANCE_EVENT_TYPES["check_in"])
    check_out_status = "unavailable"
    if participant.exam_status == ExamStatus.SUBMITTED:
        check_out_status = _status_for_attendance_purpose(contest, participant, ATTENDANCE_EVENT_TYPES["check_out"])

    now = timezone.now()
    global_start_ready = contest.start_time is None or now >= contest.start_time
    attendance_ready = check_in_status in ATTENDANCE_READY_STATUSES
    return {
        "attendanceRequired": True,
        "photoPolicy": contest.attendance_photo_policy,
        "requiredPhotoKinds": get_attendance_required_photo_kinds(contest),
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


def validate_self_scan_credential(
    contest: Contest, purpose: str, token: str, manual_code: str
) -> str:
    """Validate the QR token or manual code and return the credential source label."""
    if token and manual_code:
        raise ValueError("attendance_credential_conflict")
    if not token and not manual_code:
        raise ValueError("attendance_token_required")
    if manual_code:
        validate_attendance_manual_code(contest, purpose, manual_code)
        return "manual_code"
    validate_attendance_token(contest, purpose, token)
    return "qr_token"


def _resolve_self_scan_event(
    contest: Contest,
    actor,
    data: dict[str, Any],
    ensure_participant: Callable,
) -> dict[str, Any]:
    purpose = data["purpose"]
    if data.get("user_id"):
        raise ValueError("user_id_forbidden_for_self_scan")
    credential_source = validate_self_scan_credential(
        contest,
        purpose,
        str(data.get("token") or ""),
        str(data.get("manual_code") or ""),
    )

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

    previous_attempt_count = ExamEvent.objects.filter(
        contest=contest,
        user=actor,
        event_type=ATTENDANCE_EVENT_TYPES[purpose],
    ).count()
    metadata = {
        "attendance_purpose": purpose,
        "attendance_mode": "student_self_scan",
        "attendance_attempt": previous_attempt_count + 1,
        "attendance_repeat": previous_attempt_count > 0,
        "attendance_action": f"re_{purpose}" if previous_attempt_count > 0 else purpose,
        "attendance_credential_source": credential_source,
        "source_module": ExamEvidenceFrame.SourceModule.ATTENDANCE,
        "device_kind": str(data.get("device_kind") or ""),
        "client_observed_at_ms": data.get("client_observed_at_ms"),
        "photo_required": True,
        "photo_policy": contest.attendance_photo_policy,
        "required_photo_kinds": get_attendance_required_photo_kinds(contest),
    }
    return {"target_user": actor, "participant": participant, "metadata": metadata}


def _resolve_teacher_assisted_event(
    contest: Contest,
    actor,
    data: dict[str, Any],
) -> dict[str, Any]:
    purpose = data["purpose"]
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

    metadata = {
        "attendance_purpose": purpose,
        "attendance_mode": "teacher_assisted",
        "assisted_by_user_id": actor.id,
        "assisted_by_username": actor.username,
        "reason": reason,
        "source_module": ExamEvidenceFrame.SourceModule.ATTENDANCE,
        "photo_required": True,
        "photo_policy": contest.attendance_photo_policy,
        "required_photo_kinds": get_attendance_required_photo_kinds(contest),
    }
    return {"target_user": participant.user, "participant": participant, "metadata": metadata}


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
        resolved = _resolve_self_scan_event(contest, actor, data, ensure_participant)
    elif mode == "teacher_assisted":
        resolved = _resolve_teacher_assisted_event(contest, actor, data)
    else:
        raise ValueError("invalid_attendance_mode")

    if "error_response" in resolved or "error_code" in resolved:
        return resolved

    target_user = resolved["target_user"]
    participant = resolved["participant"]
    metadata = resolved["metadata"]

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


def reset_participant_exam_records(
    contest: Contest,
    user_id: int,
    *,
    activity_user=None,
) -> dict[str, Any]:
    try:
        participant = ContestParticipant.objects.select_related("user").get(
            contest=contest,
            user_id=user_id,
        )
    except ContestParticipant.DoesNotExist:
        raise ValueError("participant_not_found") from None

    reset_summary = reset_participant_exam_record(
        participant,
        activity_user=activity_user,
        activity_details=f"Reset exam record for {participant.user.username}",
    )
    participant.refresh_from_db()

    return {
        **reset_summary,
        "attendance_status": build_attendance_status(contest, participant),
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
        required_evidence_count = len(get_attendance_required_photo_kinds(contest))
        if mode in {"student_self_scan", "teacher_assisted"} and evidence_count < required_evidence_count:
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
