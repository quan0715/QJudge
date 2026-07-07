"""Classroom workflows that orchestrate contest bindings."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.classrooms.models import Classroom, ClassroomContest
from apps.contests.models import AssignmentState, Contest, ExamStatus

from .participant_sync import sync_classroom_participants


@dataclass(frozen=True)
class BoundClassroomContestResult:
    binding: ClassroomContest
    registered_count: int
    created: bool


def _create_bound_contest(
    classroom: Classroom,
    *,
    actor,
    data: dict,
    delivery_mode: str,
    visibility: str,
    cheat_detection_enabled: bool,
) -> BoundClassroomContestResult:
    with transaction.atomic():
        contest = Contest.objects.create(
            owner=actor,
            name=data["name"],
            description=data.get("description", ""),
            contest_type=data["contest_type"],
            delivery_mode=delivery_mode,
            start_time=data.get("start_time"),
            end_time=data.get("end_time"),
            visibility=visibility,
            attendance_check_enabled=data.get("attendance_check_enabled", False),
            cheat_detection_enabled=cheat_detection_enabled,
            allow_multiple_joins=data.get("allow_multiple_joins", False),
            results_published=data.get("results_published", False),
        )
        binding = ClassroomContest.objects.create(classroom=classroom, contest=contest)
        registered_count = sync_classroom_participants(classroom, contest)
    return BoundClassroomContestResult(
        binding=binding,
        registered_count=registered_count,
        created=True,
    )


def create_classroom_contest(
    classroom: Classroom,
    *,
    actor,
    data: dict,
) -> BoundClassroomContestResult:
    return _create_bound_contest(
        classroom,
        actor=actor,
        data=data,
        delivery_mode="exam",
        visibility=data.get("visibility", "public"),
        cheat_detection_enabled=data.get("cheat_detection_enabled", False),
    )


def create_classroom_lab(
    classroom: Classroom,
    *,
    actor,
    data: dict,
) -> BoundClassroomContestResult:
    return _create_bound_contest(
        classroom,
        actor=actor,
        data=data,
        delivery_mode="practice",
        visibility="private",
        cheat_detection_enabled=False,
    )


def bind_existing_contest(
    classroom: Classroom,
    *,
    contest_id,
) -> BoundClassroomContestResult | None:
    contest = Contest.objects.filter(id=contest_id).first()
    if contest is None:
        return None

    binding, created = ClassroomContest.objects.get_or_create(
        classroom=classroom,
        contest=contest,
    )
    registered_count = (
        sync_classroom_participants(classroom, contest)
        if created
        else 0
    )
    return BoundClassroomContestResult(
        binding=binding,
        registered_count=registered_count,
        created=created,
    )


def unbind_contest(classroom: Classroom, *, contest_id) -> bool:
    deleted, _ = ClassroomContest.objects.filter(
        classroom=classroom,
        contest_id=contest_id,
    ).delete()
    return deleted > 0


def get_bound_lab(classroom: Classroom, lab_id: str) -> ClassroomContest:
    try:
        UUID(str(lab_id))
    except ValueError:
        raise ClassroomContest.DoesNotExist
    return classroom.classroom_contests.select_related("contest").get(
        contest_id=lab_id,
        contest__delivery_mode="practice",
    )


def accept_classroom_lab(binding: ClassroomContest, user):
    participant = binding.contest.registrations.filter(user=user).first()
    if participant is None:
        return None

    now = timezone.now()
    update_fields: list[str] = []
    if participant.assignment_state == AssignmentState.UNACCEPTED:
        participant.assignment_state = AssignmentState.ACCEPTED
        participant.accepted_at = now
        update_fields.extend(["assignment_state", "accepted_at"])
    elif participant.accepted_at is None:
        participant.accepted_at = now
        update_fields.append("accepted_at")
    if participant.started_at is None:
        participant.started_at = now
        update_fields.append("started_at")
    if (
        binding.contest.contest_type == "paper_exam"
        and participant.exam_status == ExamStatus.NOT_STARTED
    ):
        participant.exam_status = ExamStatus.IN_PROGRESS
        update_fields.append("exam_status")
    if update_fields:
        participant.save(update_fields=update_fields)
    return participant


def can_solve_classroom_lab(
    binding: ClassroomContest,
    user,
    *,
    is_manager: bool,
) -> tuple[bool, str]:
    if is_manager:
        return True, ""

    participant = binding.contest.registrations.filter(user=user).first()
    if participant is None:
        return False, "You are not a classroom member."
    if participant.assignment_state == AssignmentState.UNACCEPTED:
        return False, "You must accept this lab before solving it."
    return True, ""
