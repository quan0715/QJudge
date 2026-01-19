from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="owner",
        email="owner@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def contest(owner: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Admin Contest",
        owner=owner,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )


@pytest.fixture
def admin_candidate() -> User:
    return User.objects.create_user(
        username="candidate",
        email="candidate@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def other_teacher() -> User:
    return User.objects.create_user(
        username="other_teacher",
        email="other_teacher@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def superuser() -> User:
    return User.objects.create_superuser(
        username="superuser",
        email="superuser@example.com",
        password="testpass123",
    )


@pytest.mark.django_db
def test_owner_can_list_admins(
    api_client: APIClient,
    contest: Contest,
    owner: User,
    admin_candidate: User,
) -> None:
    contest.admins.add(admin_candidate)
    api_client.force_authenticate(user=owner)

    response = api_client.get(f"/api/v1/contests/{contest.id}/admins/")

    assert response.status_code == status.HTTP_200_OK
    usernames = {item["username"] for item in response.data}
    assert admin_candidate.username in usernames
    assert owner.username not in usernames


@pytest.mark.django_db
def test_student_cannot_list_admins(
    api_client: APIClient,
    contest: Contest,
    owner: User,
) -> None:
    student = User.objects.create_user(
        username="student",
        email="student@example.com",
        password="testpass123",
        role="student",
    )
    api_client.force_authenticate(user=student)

    response = api_client.get(f"/api/v1/contests/{contest.id}/admins/")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_owner_can_add_admin(
    api_client: APIClient,
    contest: Contest,
    owner: User,
    admin_candidate: User,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_admin/",
        {"username": admin_candidate.username},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    contest.refresh_from_db()
    assert contest.admins.filter(id=admin_candidate.id).exists()


@pytest.mark.django_db
def test_superuser_can_add_admin(
    api_client: APIClient,
    contest: Contest,
    superuser: User,
    admin_candidate: User,
) -> None:
    api_client.force_authenticate(user=superuser)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_admin/",
        {"username": admin_candidate.username},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    contest.refresh_from_db()
    assert contest.admins.filter(id=admin_candidate.id).exists()


@pytest.mark.django_db
def test_add_admin_requires_owner(
    api_client: APIClient,
    contest: Contest,
    admin_candidate: User,
    other_teacher: User,
) -> None:
    contest.admins.add(other_teacher)
    api_client.force_authenticate(user=other_teacher)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_admin/",
        {"username": admin_candidate.username},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data.get("error") == "Only owner can add admins"


@pytest.mark.django_db
def test_add_admin_missing_username(
    api_client: APIClient,
    contest: Contest,
    owner: User,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(f"/api/v1/contests/{contest.id}/add_admin/", {}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data.get("error") == "Username is required"


@pytest.mark.django_db
def test_add_admin_user_not_found(
    api_client: APIClient,
    contest: Contest,
    owner: User,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_admin/",
        {"username": "missing-user"},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data.get("error") == "User not found"


@pytest.mark.django_db
def test_add_admin_rejects_owner(
    api_client: APIClient,
    contest: Contest,
    owner: User,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_admin/",
        {"username": owner.username},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data.get("error") == "Owner is already an admin"


@pytest.mark.django_db
def test_add_admin_rejects_existing_admin(
    api_client: APIClient,
    contest: Contest,
    owner: User,
    admin_candidate: User,
) -> None:
    contest.admins.add(admin_candidate)
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_admin/",
        {"username": admin_candidate.username},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data.get("error") == "User is already an admin"


@pytest.mark.django_db
def test_owner_can_remove_admin(
    api_client: APIClient,
    contest: Contest,
    owner: User,
    admin_candidate: User,
) -> None:
    contest.admins.add(admin_candidate)
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_admin/",
        {"user_id": admin_candidate.id},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    contest.refresh_from_db()
    assert not contest.admins.filter(id=admin_candidate.id).exists()


@pytest.mark.django_db
def test_superuser_can_remove_admin(
    api_client: APIClient,
    contest: Contest,
    superuser: User,
    admin_candidate: User,
) -> None:
    contest.admins.add(admin_candidate)
    api_client.force_authenticate(user=superuser)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_admin/",
        {"user_id": admin_candidate.id},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    contest.refresh_from_db()
    assert not contest.admins.filter(id=admin_candidate.id).exists()


@pytest.mark.django_db
def test_remove_admin_requires_owner(
    api_client: APIClient,
    contest: Contest,
    admin_candidate: User,
    other_teacher: User,
) -> None:
    contest.admins.add(other_teacher)
    contest.admins.add(admin_candidate)
    api_client.force_authenticate(user=other_teacher)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_admin/",
        {"user_id": admin_candidate.id},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data.get("error") == "Only owner can remove admins"


@pytest.mark.django_db
def test_remove_admin_missing_user_id(
    api_client: APIClient,
    contest: Contest,
    owner: User,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(f"/api/v1/contests/{contest.id}/remove_admin/", {}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data.get("error") == "user_id is required"


@pytest.mark.django_db
def test_remove_admin_user_not_found(
    api_client: APIClient,
    contest: Contest,
    owner: User,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_admin/",
        {"user_id": 99999},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data.get("error") == "User not found"


@pytest.mark.django_db
def test_remove_admin_rejects_non_admin(
    api_client: APIClient,
    contest: Contest,
    owner: User,
    admin_candidate: User,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_admin/",
        {"user_id": admin_candidate.id},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data.get("error") == "User is not an admin"
