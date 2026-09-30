import csv
import io
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.utils import timezone

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.contests.models import Contest
from apps.contests.services.export_service import build_contest_results_csv_response
from apps.users.models import User


def _user(username: str, role: str = "student") -> User:
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pass", role=role
    )


def _standing(user: User) -> dict:
    return {
        "user": {"id": user.id, "username": user.username, "email": user.email},
        "display_name": user.username,
        "solved": 0,
        "total_score": 0,
        "time": 0,
        "problems": {},
    }


@pytest.mark.django_db
def test_results_csv_labels_the_owner_and_classroom_staff_as_managers():
    owner = _user("csv_owner", "teacher")
    ta = _user("csv_ta", "teacher")
    student = _user("csv_student")
    contest = Contest.objects.create(
        name="CSV Roles",
        owner=owner,
        status="published",
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    classroom = Classroom.objects.create(
        name="CSV Room", owner=owner, invite_code=uuid4().hex[:8].upper()
    )
    ClassroomMember.objects.create(classroom=classroom, user=ta, role="ta")
    ClassroomMember.objects.create(classroom=classroom, user=student, role="student")
    ClassroomContest.objects.create(classroom=classroom, contest=contest)
    scoreboard = SimpleNamespace(
        problems=[], standings=[_standing(owner), _standing(ta), _standing(student)]
    )

    text = build_contest_results_csv_response(contest, scoreboard).content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))

    assert {row[0]: row[3] for row in rows[1:4]} == {
        "csv_owner": "管理者",
        "csv_ta": "管理者",
        "csv_student": "參賽者",
    }
