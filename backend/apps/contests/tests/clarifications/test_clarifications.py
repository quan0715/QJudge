from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Clarification, Contest, ContestParticipant, ExamStatus
from apps.problems.models import Problem
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="teacher",
        email="teacher@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def admin_user() -> User:
    return User.objects.create_superuser(
        username="admin",
        email="admin@example.com",
        password="adminpass123",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="student1",
        email="student1@example.com",
        password="testpass123",
        role="student",
    )


@pytest.fixture
def other_student() -> User:
    return User.objects.create_user(
        username="student2",
        email="student2@example.com",
        password="testpass123",
        role="student",
    )


@pytest.fixture
def contest(teacher: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Clarification Contest",
        owner=teacher,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )


@pytest.fixture
def problem(teacher: User) -> Problem:
    return Problem.objects.create(
        title="Clarification Problem",
        slug="clarification-problem",
        difficulty="easy",
        created_by=teacher,
        visibility='public',
    )


@pytest.fixture
def clarification_data(contest: Contest, student: User, other_student: User) -> dict[str, Clarification]:
    own_private = Clarification.objects.create(
        contest=contest,
        author=student,
        question="My private question",
        is_public=False,
        status="pending",
    )
    other_public = Clarification.objects.create(
        contest=contest,
        author=other_student,
        question="Public question",
        is_public=True,
        status="pending",
    )
    other_private = Clarification.objects.create(
        contest=contest,
        author=other_student,
        question="Other private question",
        is_public=False,
        status="pending",
    )
    return {
        "own_private": own_private,
        "other_public": other_public,
        "other_private": other_private,
    }


def extract_results(response) -> list[dict]:
    data = response.data
    if isinstance(data, dict) and "results" in data:
        return data["results"]
    return data


@pytest.mark.django_db
def test_student_sees_own_and_public_clarifications(
    api_client: APIClient,
    contest: Contest,
    student: User,
    clarification_data: dict[str, Clarification],
) -> None:
    api_client.force_authenticate(user=student)

    response = api_client.get(f"/api/v1/contests/{contest.id}/clarifications/")

    assert response.status_code == status.HTTP_200_OK
    clarifications = extract_results(response)
    clarification_ids = {item["id"] for item in clarifications}
    assert clarification_data["own_private"].id in clarification_ids
    assert clarification_data["other_public"].id in clarification_ids
    assert clarification_data["other_private"].id not in clarification_ids


@pytest.mark.django_db
def test_teacher_sees_all_clarifications(
    api_client: APIClient,
    contest: Contest,
    teacher: User,
    clarification_data: dict[str, Clarification],
) -> None:
    api_client.force_authenticate(user=teacher)

    response = api_client.get(f"/api/v1/contests/{contest.id}/clarifications/")

    assert response.status_code == status.HTTP_200_OK
    clarifications = extract_results(response)
    clarification_ids = {item["id"] for item in clarifications}
    assert clarification_data["own_private"].id in clarification_ids
    assert clarification_data["other_public"].id in clarification_ids
    assert clarification_data["other_private"].id in clarification_ids


@pytest.mark.django_db
def test_admin_sees_all_clarifications(
    api_client: APIClient,
    contest: Contest,
    admin_user: User,
    clarification_data: dict[str, Clarification],
) -> None:
    api_client.force_authenticate(user=admin_user)

    response = api_client.get(f"/api/v1/contests/{contest.id}/clarifications/")

    assert response.status_code == status.HTTP_200_OK
    clarifications = extract_results(response)
    clarification_ids = {item["id"] for item in clarifications}
    assert clarification_data["own_private"].id in clarification_ids
    assert clarification_data["other_public"].id in clarification_ids
    assert clarification_data["other_private"].id in clarification_ids


@pytest.mark.django_db
def test_create_clarification_sets_defaults(
    api_client: APIClient,
    contest: Contest,
    student: User,
    problem: Problem,
) -> None:
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/clarifications/",
        {"question": "Need clarification", "problem_id": problem.id},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    clarification = (
        Clarification.objects.filter(
            contest=contest,
            author=student,
            question="Need clarification",
        )
        .order_by("-id")
        .first()
    )
    assert clarification is not None
    assert clarification.author_id == student.id
    assert clarification.contest_id == contest.id
    assert clarification.problem_id == problem.id
    assert clarification.status == "pending"
    assert clarification.is_public is True


@pytest.mark.django_db
def test_student_cannot_update_others_public_clarification(
    api_client: APIClient,
    contest: Contest,
    student: User,
    clarification_data: dict[str, Clarification],
) -> None:
    """A student must not PATCH a public clarification authored by someone else."""
    api_client.force_authenticate(user=student)
    public_clarifiation = clarification_data["other_public"]
    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/clarifications/{public_clarifiation.id}/",
        {"question": "Overwritten"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_student_cannot_delete_others_public_clarification(
    api_client: APIClient,
    contest: Contest,
    student: User,
    clarification_data: dict[str, Clarification],
) -> None:
    """A student must not DELETE a public clarification authored by someone else."""
    api_client.force_authenticate(user=student)
    public_clarification = clarification_data["other_public"]
    response = api_client.delete(
        f"/api/v1/contests/{contest.id}/clarifications/{public_clarification.id}/"
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert Clarification.objects.filter(id=public_clarification.id).exists()


@pytest.mark.django_db
def test_student_can_update_own_clarification(
    api_client: APIClient,
    contest: Contest,
    student: User,
    clarification_data: dict[str, Clarification],
) -> None:
    """A student can PATCH their own clarification."""
    api_client.force_authenticate(user=student)
    own = clarification_data["own_private"]
    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/clarifications/{own.id}/",
        {"question": "Updated question"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    own.refresh_from_db()
    assert own.question == "Updated question"


@pytest.mark.django_db
def test_student_can_delete_own_clarification(
    api_client: APIClient,
    contest: Contest,
    student: User,
    clarification_data: dict[str, Clarification],
) -> None:
    """A student can DELETE their own clarification."""
    api_client.force_authenticate(user=student)
    own = clarification_data["own_private"]
    response = api_client.delete(
        f"/api/v1/contests/{contest.id}/clarifications/{own.id}/"
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Clarification.objects.filter(id=own.id).exists()


@pytest.mark.django_db
def test_teacher_can_delete_any_clarification(
    api_client: APIClient,
    contest: Contest,
    teacher: User,
    clarification_data: dict[str, Clarification],
) -> None:
    """Contest owner/teacher can DELETE any clarification including public ones."""
    api_client.force_authenticate(user=teacher)
    public_clarification = clarification_data["other_public"]
    response = api_client.delete(
        f"/api/v1/contests/{contest.id}/clarifications/{public_clarification.id}/"
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Clarification.objects.filter(id=public_clarification.id).exists()


@pytest.mark.django_db
def test_reply_requires_owner_or_admin(
    api_client: APIClient,
    contest: Contest,
    student: User,
    other_student: User,
    teacher: User,
) -> None:
    clarification = Clarification.objects.create(
        contest=contest,
        author=student,
        question="Need help",
        status="pending",
        is_public=False,
    )
    ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
    )

    api_client.force_authenticate(user=other_student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/clarifications/{clarification.id}/reply/",
        {"answer": "No", "is_public": True},
        format="json",
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND

    api_client.force_authenticate(user=teacher)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/clarifications/{clarification.id}/reply/",
        {"answer": "Here is the answer", "is_public": False},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    clarification.refresh_from_db()
    assert clarification.answer == "Here is the answer"
    assert clarification.is_public is False
    assert clarification.status == "answered"
    assert clarification.answered_at is not None
