"""Test helper: make users eligible to take a contest.

Eligibility is membership of the contest's bound classroom, so a fixture that
wants a student to check in or start must bind a classroom and enrol them --
there is no registration shortcut any more. Production contests are always
bound (``ContestViewSet.create`` refuses otherwise), so tests should be too.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.classrooms.services import generate_invite_code


def enrol_candidates(contest, *students, classroom=None) -> Classroom:
    """Bind ``contest`` to a classroom and enrol ``students`` as its members.

    Reuses the contest's existing binding when there is one, so it is safe to
    call repeatedly and from fixtures that already bound a classroom.
    """
    binding = contest.classroom_bindings.select_related("classroom").order_by("bound_at").first()
    if binding is not None:
        classroom = binding.classroom
    else:
        if classroom is None:
            owner = contest.owner or get_user_model().objects.create_user(
                username=f"classroom_owner_{contest.pk.hex[:12]}",
                email=f"classroom_owner_{contest.pk.hex[:12]}@example.com",
                password="unused",
            )
            classroom = Classroom.objects.create(
                name=f"{contest.name} classroom",
                owner=owner,
                invite_code=generate_invite_code(),
            )
        ClassroomContest.objects.get_or_create(classroom=classroom, contest=contest)
    for student in students:
        ClassroomMember.objects.get_or_create(
            classroom=classroom,
            user=student,
            defaults={"role": "student"},
        )
    return classroom
