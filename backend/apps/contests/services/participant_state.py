"""Participant state transitions shared by contest read/admin flows."""

from __future__ import annotations

from django.utils import timezone

from apps.contests.models import ContestActivity, ContestParticipant, ExamStatus

from .exam_submission import finalize_submission

ACTIVE_EXAM_STATUSES = {
    ExamStatus.IN_PROGRESS,
    ExamStatus.PAUSED,
    ExamStatus.LOCKED,
    ExamStatus.LOCKED_TAKEOVER,
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
    participant.violation_count = 0
    participant.lock_reason = ""
    participant.save(
        update_fields=["exam_status", "locked_at", "violation_count", "lock_reason"]
    )

    if activity_user:
        ContestActivity.objects.create(
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
    if participant.violation_count:
        participant.violation_count = 0
        changed.append("violation_count")
    if participant.lock_reason:
        participant.lock_reason = ""
        changed.append("lock_reason")
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
        if exam_status not in (ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER):
            update_fields.extend(_clear_lock_metadata(participant))

    if lock_reason is not None:
        participant.lock_reason = lock_reason
        update_fields.append("lock_reason")

    if update_fields:
        participant.save(update_fields=update_fields)

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
