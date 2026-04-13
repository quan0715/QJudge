"""Exam device takeover recovery services."""
from __future__ import annotations

from typing import Any

from apps.contests.models import Contest, ContestActivity, ContestParticipant
from apps.contests.services.anti_cheat_session import (
    blacklist_other_tokens,
    clear_heartbeat,
    get_active_session,
    set_active_session,
)
from apps.contests.services.participant_state import pause_participant_for_takeover_recovery


def build_exam_recovery_context(
    contest: Contest,
    participant: ContestParticipant,
) -> dict[str, Any]:
    """Return the contest context required to resume via frontend precheck flow."""
    binding = (
        contest.classroom_bindings.select_related("classroom")
        .order_by("bound_at")
        .first()
    )
    bound_classroom_id = str(binding.classroom.uuid) if binding is not None else None
    resume_path = (
        f"/classrooms/{bound_classroom_id}/contest/{contest.id}"
        if bound_classroom_id
        else None
    )
    return {
        "contest_id": str(contest.id),
        "contest_name": contest.name,
        "exam_status": participant.exam_status,
        "started_at": participant.started_at,
        "bound_classroom_id": bound_classroom_id,
        "resume_path": resume_path,
    }


def perform_exam_takeover(
    *,
    user,
    participant: ContestParticipant,
    request,
    access_jti: str,
    refresh_jti: str,
    requested_device_id: str,
) -> dict[str, Any]:
    """Replace the old device session with a new one and pause the exam."""
    contest = participant.contest
    previous_session = get_active_session(contest.id, user.id) or {}
    previous_device_id = str(previous_session.get("device_id") or "")

    participant = pause_participant_for_takeover_recovery(participant)
    clear_heartbeat(contest.id, user.id)
    set_active_session(contest, participant, request, requested_device_id)

    blacklisted_count = blacklist_other_tokens(
        user,
        contest_id=contest.id,
        access_jti=access_jti,
        refresh_jti=refresh_jti,
    )

    ContestActivity.objects.create(
        contest=contest,
        user=user,
        action_type="update_participant",
        details=(
            "Recovered exam on a new device "
            f"(old_device={previous_device_id or 'unknown'}, new_device={requested_device_id})"
        ),
    )

    participant.refresh_from_db(fields=["exam_status", "started_at"])
    return {
        "participant": participant,
        "active_exam": build_exam_recovery_context(contest, participant),
        "blacklisted_token_count": blacklisted_count,
    }
