"""Classroom workflows that orchestrate contest bindings."""

from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction

from apps.classrooms.models import Classroom, ClassroomContest
from apps.contests.models import Contest


@dataclass(frozen=True)
class BoundClassroomContestResult:
    binding: ClassroomContest
    created: bool


def _create_bound_contest(
    classroom: Classroom,
    *,
    actor,
    data: dict,
    cheat_detection_enabled: bool,
) -> BoundClassroomContestResult:
    with transaction.atomic():
        contest = Contest.objects.create(
            owner=actor,
            name=data["name"],
            description=data.get("description", ""),
            contest_type=data["contest_type"],
            start_time=data.get("start_time"),
            end_time=data.get("end_time"),
            attendance_check_enabled=data.get("attendance_check_enabled", False),
            cheat_detection_enabled=cheat_detection_enabled,
            allow_multiple_joins=data.get("allow_multiple_joins", False),
            results_published=data.get("results_published", False),
        )
        # No roster copy: classroom membership is eligibility, and each
        # student's attempt record is created by their own first exam action.
        binding = ClassroomContest.objects.create(classroom=classroom, contest=contest)
    return BoundClassroomContestResult(
        binding=binding,
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
        cheat_detection_enabled=data.get("cheat_detection_enabled", False),
    )
