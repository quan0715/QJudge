"""Participant state transitions shared by contest read/admin flows."""

from __future__ import annotations

from django.db import transaction

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamAnswer,
    ExamEvent,
    ExamEvidenceFrame,
    ExamStatus,
)

from .activity_log import log_contest_activity
from .anti_cheat_session import (
    clear_active_session,
    clear_exam_allowed_jti,
)
from .integrity_presence import clear_checkpoint

ACTIVE_EXAM_STATUSES = {
    ExamStatus.IN_PROGRESS,
    ExamStatus.PAUSED,
    ExamStatus.LOCKED,
}


def unlock_participant(
    participant: ContestParticipant,
    *,
    activity_user=None,
    activity_details: str,
) -> ContestParticipant:
    """Reset a locked participant back to the paused state."""
    participant.exam_status = ExamStatus.PAUSED
    participant.locked_at = None
    participant.lock_reason = ""
    participant.save(
        update_fields=["exam_status", "locked_at", "lock_reason"]
    )

    if activity_user:
        log_contest_activity(
            contest=participant.contest,
            user=activity_user,
            action_type="unlock_user",
            details=activity_details,
        )

    return participant


def _clear_lock_metadata(participant: ContestParticipant) -> list[str]:
    """Clear lock-related fields and return the list of changed field names."""
    changed = []
    if participant.locked_at is not None:
        participant.locked_at = None
        changed.append("locked_at")
    if participant.lock_reason:
        participant.lock_reason = ""
        changed.append("lock_reason")
    return changed


def _clear_attempt_metadata(participant: ContestParticipant) -> list[str]:
    """Clear lifecycle fields when resetting to not_started-like states."""
    from .integrity_upload_grants import rotate_integrity_attempt
    changed = [rotate_integrity_attempt(participant)]
    if participant.started_at is not None:
        participant.started_at = None
        changed.append("started_at")
    if participant.left_at is not None:
        participant.left_at = None
        changed.append("left_at")
    if participant.submit_reason:
        participant.submit_reason = ""
        changed.append("submit_reason")
    return changed


def _lock_attempt_transition(participant):
    from .exam_schedule import lock_exam_runs
    Contest.objects.select_for_update().get(pk=participant.contest_id)
    lock_exam_runs(participant.contest_id)
    return ContestParticipant.objects.select_for_update().get(pk=participant.pk)


@transaction.atomic
def admin_update_participant(
    participant: ContestParticipant,
    *,
    exam_status: str | None = None,
    lock_reason: str | None = None,
    activity_user,
    activity_details: str,
) -> ContestParticipant:
    """Admin-driven participant field update with consistent lock metadata cleanup."""
    participant = _lock_attempt_transition(participant)
    update_fields: list[str] = []

    if exam_status is not None:
        if participant.exam_status == ExamStatus.SUBMITTED and exam_status in ACTIVE_EXAM_STATUSES:
            from .integrity_upload_grants import rotate_integrity_attempt
            participant.left_at, participant.submit_reason = None, ""
            update_fields.extend([rotate_integrity_attempt(participant), "left_at", "submit_reason"])
        participant.exam_status = exam_status
        update_fields.append("exam_status")
        # If transitioning away from a locked state, clear lock metadata
        if exam_status != ExamStatus.LOCKED:
            update_fields.extend(_clear_lock_metadata(participant))
        if exam_status == ExamStatus.NOT_STARTED:
            update_fields.extend(_clear_attempt_metadata(participant))

    if lock_reason is not None:
        participant.lock_reason = lock_reason
        update_fields.append("lock_reason")

    if update_fields:
        participant.save(update_fields=update_fields)
        if exam_status is not None and exam_status not in ACTIVE_EXAM_STATUSES:
            clear_active_session(participant.contest_id, participant.user_id)
            clear_checkpoint(participant.contest_id, participant.user_id)
            clear_exam_allowed_jti(participant.user_id, contest_id=participant.contest_id)

    log_contest_activity(
        contest=participant.contest,
        user=activity_user,
        action_type="update_participant",
        details=activity_details,
    )

    return participant


@transaction.atomic
def reopen_participant_exam(
    participant: ContestParticipant,
    *,
    activity_user,
    activity_details: str,
) -> ContestParticipant:
    """Reopen a submitted exam back to PAUSED so the student can continue."""
    participant = _lock_attempt_transition(participant)
    participant.exam_status = ExamStatus.PAUSED
    participant.submit_reason = ""
    from .integrity_upload_grants import rotate_integrity_attempt
    participant.left_at = None
    update_fields = ["exam_status", "submit_reason", "left_at", rotate_integrity_attempt(participant)]
    update_fields.extend(_clear_lock_metadata(participant))
    participant.save(update_fields=update_fields)

    log_contest_activity(
        contest=participant.contest,
        user=activity_user,
        action_type="reopen_exam",
        details=activity_details,
    )

    return participant


def reset_participant_exam_record(
    participant: ContestParticipant,
    *,
    activity_user,
    activity_details: str,
) -> dict:
    """Reset one participant's attempt data while keeping the participant row."""
    from apps.submissions.models import Submission

    with transaction.atomic():
        participant = _lock_attempt_transition(participant)
        answer_qs = ExamAnswer.objects.filter(participant=participant)
        deleted_answers = answer_qs.count()
        answer_qs.delete()

        submission_qs = Submission.objects.filter(
            contest=participant.contest,
            user=participant.user,
        )
        deleted_submissions = submission_qs.count()
        submission_qs.delete()

        event_qs = ExamEvent.objects.filter(
            contest=participant.contest,
            user=participant.user,
        )
        deleted_events = event_qs.count()
        deleted_evidence = ExamEvidenceFrame.objects.filter(
            contest=participant.contest,
            user=participant.user,
            exam_event__in=event_qs,
        ).count()
        event_qs.delete()

        from .integrity_upload_grants import rotate_integrity_attempt
        rotate_integrity_attempt(participant)
        participant.exam_status = ExamStatus.NOT_STARTED
        participant.score = 0
        participant.rank = None
        participant.started_at = None
        participant.left_at = None
        participant.locked_at = None
        participant.lock_reason = ""
        participant.violation_count = 0
        participant.submit_reason = ""
        participant.save(
            update_fields=[
                "exam_status",
                "score",
                "rank",
                "started_at",
                "left_at",
                "locked_at",
                "lock_reason",
                "violation_count",
                "submit_reason",
                "integrity_attempt_id",
            ]
        )

        log_contest_activity(
            contest=participant.contest,
            user=activity_user,
            action_type="reset_exam_record",
            details=activity_details,
        )

    clear_active_session(participant.contest_id, participant.user_id)
    clear_checkpoint(participant.contest_id, participant.user_id)
    clear_exam_allowed_jti(participant.user_id, contest_id=participant.contest_id)

    return {
        "deleted_answers": deleted_answers,
        "deleted_submissions": deleted_submissions,
        "deleted_events": deleted_events,
        "deleted_evidence": deleted_evidence,
    }
