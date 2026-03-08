"""
Submission finalization helpers for exam anti-cheat flows.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone

from apps.contests.models import (
    ContestActivity,
    ExamEvidenceJob,
    EvidenceJobStatus,
    ExamStatus,
)

from .anti_cheat_session import clear_active_session

if TYPE_CHECKING:
    from apps.contests.models import ContestParticipant
    from apps.users.models import User


def normalize_upload_session_id(upload_session_id: str | None) -> str:
    value = str(upload_session_id or "").strip()
    return value or "default"


def enqueue_compile_video(participant_id: int, upload_session_id: str | None) -> None:
    from apps.contests.tasks import compile_anticheat_video

    compile_anticheat_video.apply_async(
        args=[participant_id, normalize_upload_session_id(upload_session_id)],
        queue="video_queue",
    )


def ensure_evidence_job(
    participant: "ContestParticipant", upload_session_id: str | None
) -> ExamEvidenceJob:
    session_id = normalize_upload_session_id(upload_session_id)
    job, _ = ExamEvidenceJob.objects.get_or_create(
        contest=participant.contest,
        participant=participant,
        upload_session_id=session_id,
        defaults={"status": EvidenceJobStatus.PENDING},
    )
    return job


def finalize_submission(
    participant: "ContestParticipant",
    *,
    submit_reason: str,
    upload_session_id: str | None = None,
    activity_user: "User | None" = None,
    activity_action_type: str | None = None,
    activity_details: str = "",
) -> str:
    """
    Finalize participant submission in a single idempotent flow.
    Always records a pending evidence job for monitored exams.
    Video compilation is triggered only by the explicit manual compile endpoint.
    """
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
    if update_fields:
        participant.save(update_fields=update_fields)

    clear_active_session(participant.contest_id, participant.user_id)

    if participant.contest.cheat_detection_enabled:
        ensure_evidence_job(participant, session_id)

    if activity_user and activity_action_type:
        ContestActivity.objects.create(
            contest=participant.contest,
            user=activity_user,
            action_type=activity_action_type,
            details=activity_details,
        )

    return session_id
