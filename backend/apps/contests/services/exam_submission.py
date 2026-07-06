"""
Submission finalization helpers for exam anti-cheat flows.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone

from apps.contests.models import (
    AssignmentState,
    ExamStatus,
)

from .activity_log import log_contest_activity
from .anti_cheat_session import clear_active_session, clear_exam_allowed_jti

if TYPE_CHECKING:
    from apps.contests.models import ContestParticipant
    from apps.users.models import User

VALID_SOURCE_MODULES = ("screen_share", "webcam", "attendance")


def normalize_upload_session_id(upload_session_id: str | None) -> str:
    value = str(upload_session_id or "").strip()
    return value or "default"


def normalize_source_module(source_module: str | None) -> str:
    value = str(source_module or "").strip().lower()
    if value not in VALID_SOURCE_MODULES:
        return "screen_share"
    return value


def finalize_submission(
    participant: "ContestParticipant",
    *,
    submit_reason: str,
    upload_session_id: str | None = None,
    source_module: str | None = None,
    activity_user: "User | None" = None,
    activity_action_type: str | None = None,
    activity_details: str = "",
) -> str:
    """Finalize participant submission in a single idempotent flow."""
    session_id = normalize_upload_session_id(upload_session_id)

    update_fields: list[str] = []
    now = timezone.now()
    if participant.exam_status != ExamStatus.SUBMITTED:
        participant.exam_status = ExamStatus.SUBMITTED
        update_fields.append("exam_status")
    if participant.left_at is None:
        participant.left_at = now
        update_fields.append("left_at")
    if submit_reason and participant.submit_reason != submit_reason:
        participant.submit_reason = submit_reason
        update_fields.append("submit_reason")
    if participant.contest.delivery_mode == "practice":
        if participant.assignment_state != AssignmentState.SUBMITTED:
            participant.assignment_state = AssignmentState.SUBMITTED
            update_fields.append("assignment_state")
        if participant.submitted_at is None:
            participant.submitted_at = now
            update_fields.append("submitted_at")
    if update_fields:
        participant.save(update_fields=update_fields)

    clear_active_session(participant.contest_id, participant.user_id)
    # Release JTI pin so other devices can work normally after exam ends
    clear_exam_allowed_jti(participant.user_id, contest_id=participant.contest_id)

    if activity_user and activity_action_type:
        log_contest_activity(
            contest=participant.contest,
            user=activity_user,
            action_type=activity_action_type,
            details=activity_details,
        )

    return session_id
