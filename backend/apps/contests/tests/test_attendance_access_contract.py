from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom, ClassroomContest
from apps.contests.models import Contest
from apps.contests.serializers import ContestCreateUpdateSerializer
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="attendance_contract_owner",
        email="attendance_contract_owner@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.mark.django_db
def test_contest_serializer_rejects_legacy_password_fields(owner: User) -> None:
    serializer = ContestCreateUpdateSerializer(
        data={
            "name": "Attendance Contest",
            "contest_type": "coding",
            "requires_password": True,
            "password": "secret-123",
            "attendance_check_enabled": True,
        }
    )

    assert serializer.is_valid() is False
    assert "requires_password" in serializer.errors
    assert "password" in serializer.errors


@pytest.mark.django_db
def test_contest_serializer_persists_attendance_toggle(owner: User) -> None:
    serializer = ContestCreateUpdateSerializer(
        data={
            "name": "Attendance Contest",
            "contest_type": "coding",
            "attendance_check_enabled": True,
        }
    )

    assert serializer.is_valid(), serializer.errors
    contest = serializer.save(owner=owner)

    contest.refresh_from_db()
    assert contest.attendance_check_enabled is True


@pytest.mark.django_db
def test_classroom_contest_create_exposes_attendance_toggle(
    api_client: APIClient,
    owner: User,
) -> None:
    classroom = Classroom.objects.create(
        name="Attendance Classroom",
        description="",
        owner=owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/classrooms/{classroom.uuid}/contests/",
        {
            "name": "Classroom Attendance Contest",
            "contest_type": "coding",
            "attendance_check_enabled": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["attendance_check_enabled"] is True
    assert "requires_password" not in response.data

    binding = ClassroomContest.objects.get(contest_id=response.data["contest_id"])
    assert binding.contest.attendance_check_enabled is True


@pytest.mark.django_db
def test_classroom_contest_create_rejects_legacy_password_fields(
    api_client: APIClient,
    owner: User,
) -> None:
    classroom = Classroom.objects.create(
        name="Attendance Classroom Legacy",
        description="",
        owner=owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/classrooms/{classroom.uuid}/contests/",
        {
            "name": "Classroom Legacy Contest",
            "contest_type": "coding",
            "requires_password": True,
            "password": "secret-123",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    details = response.data["error"]["details"]
    assert "requires_password" in details
    assert "password" in details


@pytest.mark.django_db
def test_publish_requires_schedule_window(
    api_client: APIClient,
    owner: User,
) -> None:
    contest = Contest.objects.create(
        name="Draft Without Schedule",
        owner=owner,
        status="draft",
        visibility="public",
    )
    api_client.force_authenticate(user=owner)

    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/",
        {"status": "published"},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data.get("success") is False
    assert "start_time" in response.data["error"]["details"]


@pytest.mark.django_db
def test_publish_with_valid_schedule_succeeds(
    api_client: APIClient,
    owner: User,
) -> None:
    contest = Contest.objects.create(
        name="Draft With Schedule",
        owner=owner,
        status="draft",
        visibility="public",
    )
    api_client.force_authenticate(user=owner)
    start_time = timezone.now() + timedelta(hours=1)
    end_time = start_time + timedelta(hours=2)

    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/",
        {
            "status": "published",
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    contest.refresh_from_db()
    assert contest.status == "published"
    assert contest.start_time is not None
    assert contest.end_time is not None


@pytest.mark.django_db
def test_revert_to_draft_keeps_schedule_but_unpublishes_results(
    api_client: APIClient,
    owner: User,
) -> None:
    start_time = timezone.now() - timedelta(hours=1)
    end_time = timezone.now() + timedelta(hours=1)
    contest = Contest.objects.create(
        name="Published Contest",
        owner=owner,
        status="published",
        visibility="public",
        start_time=start_time,
        end_time=end_time,
        results_published=True,
    )
    api_client.force_authenticate(user=owner)

    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/",
        {"status": "draft"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    contest.refresh_from_db()
    assert contest.status == "draft"
    assert contest.start_time == start_time
    assert contest.end_time == end_time
    assert contest.results_published is False
