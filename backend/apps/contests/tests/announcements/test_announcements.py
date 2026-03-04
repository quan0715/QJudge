from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestAnnouncement
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="ann_owner",
        email="ann_owner@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="ann_student",
        email="ann_student@example.com",
        password="testpass123",
        role="student",
    )


@pytest.fixture
def other_teacher() -> User:
    return User.objects.create_user(
        username="ann_other_teacher",
        email="ann_other_teacher@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def contest(owner: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Announcement Contest",
        owner=owner,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )


@pytest.fixture
def announcement(contest: Contest, owner: User) -> ContestAnnouncement:
    return ContestAnnouncement.objects.create(
        contest=contest,
        created_by=owner,
        title="Initial Title",
        content="Initial Content",
    )


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_owner_can_create_announcement(
    api_client: APIClient, contest: Contest, owner: User
) -> None:
    api_client.force_authenticate(user=owner)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/announcements/",
        {"title": "Hello", "content": "World"},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_student_cannot_create_announcement(
    api_client: APIClient, contest: Contest, student: User
) -> None:
    api_client.force_authenticate(user=student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/announcements/",
        {"title": "Student post", "content": "Should be blocked"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_owner_can_update_announcement(
    api_client: APIClient, contest: Contest, owner: User, announcement: ContestAnnouncement
) -> None:
    api_client.force_authenticate(user=owner)
    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/announcements/{announcement.id}/",
        {"title": "Updated Title"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    announcement.refresh_from_db()
    assert announcement.title == "Updated Title"


@pytest.mark.django_db
def test_student_cannot_update_announcement(
    api_client: APIClient, contest: Contest, student: User, announcement: ContestAnnouncement
) -> None:
    api_client.force_authenticate(user=student)
    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/announcements/{announcement.id}/",
        {"title": "Hijacked"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    announcement.refresh_from_db()
    assert announcement.title == "Initial Title"


@pytest.mark.django_db
def test_unrelated_teacher_cannot_update_announcement(
    api_client: APIClient, contest: Contest, other_teacher: User, announcement: ContestAnnouncement
) -> None:
    api_client.force_authenticate(user=other_teacher)
    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/announcements/{announcement.id}/",
        {"title": "Hijacked"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_owner_can_delete_announcement(
    api_client: APIClient, contest: Contest, owner: User, announcement: ContestAnnouncement
) -> None:
    api_client.force_authenticate(user=owner)
    response = api_client.delete(
        f"/api/v1/contests/{contest.id}/announcements/{announcement.id}/"
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not ContestAnnouncement.objects.filter(id=announcement.id).exists()


@pytest.mark.django_db
def test_student_cannot_delete_announcement(
    api_client: APIClient, contest: Contest, student: User, announcement: ContestAnnouncement
) -> None:
    api_client.force_authenticate(user=student)
    response = api_client.delete(
        f"/api/v1/contests/{contest.id}/announcements/{announcement.id}/"
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert ContestAnnouncement.objects.filter(id=announcement.id).exists()


@pytest.mark.django_db
def test_unauthenticated_cannot_delete_announcement(
    api_client: APIClient, contest: Contest, announcement: ContestAnnouncement
) -> None:
    response = api_client.delete(
        f"/api/v1/contests/{contest.id}/announcements/{announcement.id}/"
    )
    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
    assert ContestAnnouncement.objects.filter(id=announcement.id).exists()


@pytest.mark.django_db
def test_co_admin_can_delete_announcement(
    api_client: APIClient, contest: Contest, other_teacher: User, announcement: ContestAnnouncement
) -> None:
    """A co-admin (teacher added to admins M2M) can delete announcements."""
    contest.admins.add(other_teacher)
    api_client.force_authenticate(user=other_teacher)
    response = api_client.delete(
        f"/api/v1/contests/{contest.id}/announcements/{announcement.id}/"
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not ContestAnnouncement.objects.filter(id=announcement.id).exists()
