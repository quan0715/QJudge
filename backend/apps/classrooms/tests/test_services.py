from __future__ import annotations

from unittest.mock import Mock

import pytest

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.classrooms.services import (
    generate_invite_code,
    on_member_joined,
    sync_classroom_participants,
)
from apps.contests.models import Contest, ContestParticipant
from apps.users.models import User


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="svc_owner", email="svc_owner@example.com", password="pass123"
    )


@pytest.fixture
def student_a() -> User:
    return User.objects.create_user(
        username="svc_student_a", email="svc_student_a@example.com", password="pass123"
    )


@pytest.fixture
def student_b() -> User:
    return User.objects.create_user(
        username="svc_student_b", email="svc_student_b@example.com", password="pass123"
    )


@pytest.fixture
def student_c() -> User:
    return User.objects.create_user(
        username="svc_student_c", email="svc_student_c@example.com", password="pass123"
    )


@pytest.fixture
def classroom(owner: User) -> Classroom:
    return Classroom.objects.create(name="Service Room", owner=owner, invite_code="SVCRM001")


@pytest.fixture
def published_contest(owner: User) -> Contest:
    return Contest.objects.create(name="Published Contest", owner=owner, status="published")


@pytest.fixture
def draft_contest(owner: User) -> Contest:
    return Contest.objects.create(name="Draft Contest", owner=owner, status="draft")


@pytest.mark.django_db
def test_generate_invite_code_returns_unique_code() -> None:
    code = generate_invite_code()
    assert len(code) == 8
    assert code.isalnum()
    assert code.upper() == code
    assert not Classroom.objects.filter(invite_code=code).exists()


@pytest.mark.django_db
def test_generate_invite_code_raises_after_too_many_collisions(mocker) -> None:
    mock_filter = Mock()
    mock_filter.exists.return_value = True
    mocker.patch("apps.classrooms.services.Classroom.objects.filter", return_value=mock_filter)
    mocker.patch("apps.classrooms.services.secrets.choice", return_value="A")

    with pytest.raises(RuntimeError, match="Failed to generate unique invite code"):
        generate_invite_code()


@pytest.mark.django_db
def test_sync_classroom_participants_creates_only_missing_members(
    classroom: Classroom,
    published_contest: Contest,
    student_a: User,
    student_b: User,
) -> None:
    ClassroomMember.objects.create(classroom=classroom, user=student_a, role="student")
    ClassroomMember.objects.create(classroom=classroom, user=student_b, role="ta")
    ContestParticipant.objects.create(contest=published_contest, user=student_a)

    created_count = sync_classroom_participants(classroom, published_contest)

    assert created_count == 1
    assert ContestParticipant.objects.filter(contest=published_contest, user=student_a).count() == 1
    assert ContestParticipant.objects.filter(contest=published_contest, user=student_b).count() == 1


@pytest.mark.django_db
def test_sync_classroom_participants_returns_zero_when_all_registered(
    classroom: Classroom,
    published_contest: Contest,
    student_a: User,
) -> None:
    ClassroomMember.objects.create(classroom=classroom, user=student_a, role="student")
    ContestParticipant.objects.create(contest=published_contest, user=student_a)

    created_count = sync_classroom_participants(classroom, published_contest)

    assert created_count == 0


@pytest.mark.django_db
def test_on_member_joined_registers_only_for_published_bound_contests(
    classroom: Classroom,
    published_contest: Contest,
    draft_contest: Contest,
    student_c: User,
) -> None:
    ClassroomContest.objects.create(classroom=classroom, contest=published_contest)
    ClassroomContest.objects.create(classroom=classroom, contest=draft_contest)

    created_count = on_member_joined(classroom, student_c)

    assert created_count == 1
    assert ContestParticipant.objects.filter(contest=published_contest, user=student_c).exists()
    assert not ContestParticipant.objects.filter(contest=draft_contest, user=student_c).exists()


@pytest.mark.django_db
def test_on_member_joined_skips_existing_participants(
    classroom: Classroom,
    published_contest: Contest,
    student_c: User,
) -> None:
    ClassroomContest.objects.create(classroom=classroom, contest=published_contest)
    ContestParticipant.objects.create(contest=published_contest, user=student_c)

    created_count = on_member_joined(classroom, student_c)

    assert created_count == 0
    assert ContestParticipant.objects.filter(contest=published_contest, user=student_c).count() == 1

