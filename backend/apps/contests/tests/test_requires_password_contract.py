from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom
from apps.contests.models import Contest
from apps.contests.serializers import ContestCreateUpdateSerializer
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="password_contract_owner",
        email="password_contract_owner@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="password_contract_student",
        email="password_contract_student@example.com",
        password="testpass123",
        role="student",
    )


@pytest.mark.django_db
def test_contest_create_serializer_sets_private_visibility_and_hashes_password(owner: User) -> None:
    serializer = ContestCreateUpdateSerializer(
        data={
            "name": "Password Protected Contest",
            "contest_type": "coding",
            "requires_password": True,
            "password": "secret-123",
        }
    )

    assert serializer.is_valid(), serializer.errors
    contest = serializer.save(owner=owner)

    contest.refresh_from_db()
    assert contest.visibility == "private"
    assert contest.requires_password is True
    assert contest.has_hashed_password() is True
    assert contest.verify_contest_password("secret-123") is True


@pytest.mark.django_db
def test_contest_update_serializer_clears_password_when_requires_password_disabled(owner: User) -> None:
    contest = Contest.objects.create(
        name="Update Password Contest",
        owner=owner,
        status="published",
        visibility="private",
        start_time=timezone.now(),
        end_time=timezone.now() + timedelta(hours=1),
    )
    contest.set_contest_password("secret-456")
    contest.save(update_fields=["password"])
    assert contest.has_hashed_password() is True

    serializer = ContestCreateUpdateSerializer(
        instance=contest,
        data={"requires_password": False},
        partial=True,
    )

    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    updated.refresh_from_db()

    assert updated.visibility == "public"
    assert updated.requires_password is False
    assert updated.password is None
    assert updated.verify_contest_password("secret-456") is False


@pytest.mark.django_db
def test_register_requires_password_for_password_protected_contest(
    api_client: APIClient,
    owner: User,
    student: User,
) -> None:
    contest = Contest.objects.create(
        name="Register Password Contest",
        owner=owner,
        status="published",
        visibility="private",
        start_time=timezone.now() - timedelta(minutes=5),
        end_time=timezone.now() + timedelta(hours=1),
    )
    contest.set_contest_password("secret-789")
    contest.save(update_fields=["password"])

    api_client.force_authenticate(user=student)

    invalid = api_client.post(
        f"/api/v1/contests/{contest.id}/register/",
        {"password": "wrong-password"},
        format="json",
    )
    assert invalid.status_code == status.HTTP_403_FORBIDDEN
    assert invalid.data["message"] == "Invalid password"

    valid = api_client.post(
        f"/api/v1/contests/{contest.id}/register/",
        {"password": "secret-789"},
        format="json",
    )
    assert valid.status_code == status.HTTP_201_CREATED
    assert Contest.objects.get(id=contest.id).requires_password is True


@pytest.mark.django_db
def test_classroom_contest_create_hashes_password_and_exposes_requires_password(
    api_client: APIClient,
    owner: User,
) -> None:
    classroom = Classroom.objects.create(
        name="Password Classroom",
        description="",
        owner=owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/classrooms/{classroom.uuid}/contests/",
        {
            "name": "Classroom Password Contest",
            "contest_type": "coding",
            "requires_password": True,
            "password": "classroom-secret",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["requires_password"] is True
    assert response.data["contest_visibility"] == "private"

    contest = Contest.objects.get(id=response.data["contest_id"])
    assert contest.visibility == "private"
    assert contest.has_hashed_password() is True
    assert contest.verify_contest_password("classroom-secret") is True


@pytest.mark.django_db
def test_classroom_contest_create_defaults_to_open_without_password(
    api_client: APIClient,
    owner: User,
) -> None:
    classroom = Classroom.objects.create(
        name="Open Classroom",
        description="",
        owner=owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/classrooms/{classroom.uuid}/contests/",
        {
            "name": "Classroom Open Contest",
            "contest_type": "coding",
            "requires_password": False,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["requires_password"] is False
    assert response.data["contest_visibility"] == "public"

    contest = Contest.objects.get(id=response.data["contest_id"])
    assert contest.visibility == "public"
    assert contest.password is None
    assert contest.requires_password is False
