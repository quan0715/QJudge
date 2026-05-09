"""Participant state transitions shared by contest read/admin flows."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.contests.models import (
    AssignmentState,
    ContestActivity,
    ContestParticipant,
    ExamAnswer,
    ExamEvent,
    ExamEvidenceFrame,
    ExamStatus,
)

from .exam_submission import finalize_submission
from .anti_cheat_session import (
    clear_active_session,
    clear_exam_allowed_jti,
    clear_heartbeat,
)

ACTIVE_EXAM_STATUSES = {
    ExamStatus.IN_PROGRESS,
    ExamStatus.PAUSED,
    ExamStatus.LOCKED,
}


def get_auto_unlock_at(participant: ContestParticipant):
    """Return the scheduled unlock time for a locked participant."""
    contest = participant.contest
    if (
        participant.exam_status != ExamStatus.LOCKED
        or not participant.locked_at
        or not contest.allow_auto_unlock
    ):
        return None

    minutes = contest.auto_unlock_minutes or 0
    return participant.locked_at + timezone.timedelta(minutes=minutes)


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
        ContestActivity.objects.create(
            contest=participant.contest,
            user=activity_user,
            action_type="unlock_user",
            details=activity_details,
        )

    return participant


def pause_participant_for_takeover_recovery(
    participant: ContestParticipant,
) -> ContestParticipant:
    """Pause an exam attempt so the student can resume on a replacement device."""
    update_fields = ["exam_status"]
    participant.exam_status = ExamStatus.PAUSED
    update_fields.extend(_clear_lock_metadata(participant))
    participant.save(update_fields=update_fields)
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
    changed = []
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


def admin_update_participant(
    participant: ContestParticipant,
    *,
    exam_status: str | None = None,
    lock_reason: str | None = None,
    activity_user,
    activity_details: str,
) -> ContestParticipant:
    """Admin-driven participant field update with consistent lock metadata cleanup."""
    update_fields: list[str] = []

    if exam_status is not None:
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
            clear_heartbeat(participant.contest_id, participant.user_id)
            clear_exam_allowed_jti(participant.user_id, contest_id=participant.contest_id)

    ContestActivity.objects.create(
        contest=participant.contest,
        user=activity_user,
        action_type="update_participant",
        details=activity_details,
    )

    return participant


def reopen_participant_exam(
    participant: ContestParticipant,
    *,
    activity_user,
    activity_details: str,
) -> ContestParticipant:
    """Reopen a submitted exam back to PAUSED so the student can continue."""
    participant.exam_status = ExamStatus.PAUSED
    participant.submit_reason = ""
    update_fields = ["exam_status", "submit_reason"]
    update_fields.extend(_clear_lock_metadata(participant))
    participant.save(update_fields=update_fields)

    ContestActivity.objects.create(
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

        participant.exam_status = ExamStatus.NOT_STARTED
        participant.assignment_state = AssignmentState.ACCEPTED
        participant.score = 0
        participant.rank = None
        participant.started_at = None
        participant.left_at = None
        participant.locked_at = None
        participant.lock_reason = ""
        participant.violation_count = 0
        participant.submit_reason = ""
        participant.submitted_at = None
        participant.save(
            update_fields=[
                "exam_status",
                "assignment_state",
                "score",
                "rank",
                "started_at",
                "left_at",
                "locked_at",
                "lock_reason",
                "violation_count",
                "submit_reason",
                "submitted_at",
            ]
        )

        ContestActivity.objects.create(
            contest=participant.contest,
            user=activity_user,
            action_type="reset_exam_record",
            details=activity_details,
        )

    clear_active_session(participant.contest_id, participant.user_id)
    clear_heartbeat(participant.contest_id, participant.user_id)
    clear_exam_allowed_jti(participant.user_id, contest_id=participant.contest_id)

    return {
        "deleted_answers": deleted_answers,
        "deleted_submissions": deleted_submissions,
        "deleted_events": deleted_events,
        "deleted_evidence": deleted_evidence,
    }


def reconcile_participant_on_contest_access(
    participant: ContestParticipant,
    *,
    activity_user=None,
    now=None,
) -> ContestParticipant:
    """
    Apply access-time transitions that keep participant state coherent.

    This keeps the read path thin while reusing the same transition rules in
    one service boundary.
    """
    now = now or timezone.now()
    auto_unlock_at = get_auto_unlock_at(participant)

    if auto_unlock_at and now >= auto_unlock_at:
        participant = unlock_participant(
            participant,
            activity_user=activity_user,
            activity_details="Auto-unlocked by system",
        )

    contest = participant.contest
    if (
        contest.status == "published"
        and contest.end_time
        and now >= contest.end_time
        and participant.exam_status in ACTIVE_EXAM_STATUSES
    ):
        finalize_submission(
            participant,
            submit_reason="Auto-submitted: contest ended",
            activity_user=activity_user,
            activity_action_type="auto_submit",
            activity_details="Auto-submitted: contest ended",
        )
        participant.refresh_from_db()

    return participant
