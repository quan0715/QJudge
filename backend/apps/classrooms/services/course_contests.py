"""Classroom workflows that orchestrate contest bindings."""

from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction

from apps.classrooms.models import Classroom, ClassroomContest
from apps.contests.models import Contest

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
    visibility: str,
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
        visibility=data.get("visibility", "public"),
        cheat_detection_enabled=data.get("cheat_detection_enabled", False),
    )
