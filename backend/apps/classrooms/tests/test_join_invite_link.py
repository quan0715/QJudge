"""
Tests for classroom join via invite link.

The link-based invitation flow reuses the existing POST /api/v1/classrooms/join/
endpoint. Students receive a URL like /classrooms/join/<invite_code> which the
frontend translates into a POST { invite_code } call.

These tests verify:
- Student can join with valid code
- Owner/admin are recognised without creating membership
- Disabled invite code is rejected
- Invalid code returns 404
- Duplicate join is idempotent (200, no extra membership)
- Unauthenticated request is rejected
"""
import pytest
from uuid import uuid4

from rest_framework import status
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom, ClassroomMember
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def classroom_owner() -> User:
    return User.objects.create_user(
        username="join_link_owner",
        email="join_link_owner@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def classroom_admin() -> User:
    return User.objects.create_user(
        username="join_link_admin",
        email="join_link_admin@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def student_user() -> User:
    return User.objects.create_user(
        username="join_link_student",
        email="join_link_student@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def another_student() -> User:
    return User.objects.create_user(
        username="join_link_student2",
        email="join_link_student2@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def classroom(classroom_owner: User, classroom_admin: User) -> Classroom:
    room = Classroom.objects.create(
        name="Join Link Classroom",
        description="",
        owner=classroom_owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    room.admins.add(classroom_admin)
    return room


JOIN_URL = "/api/v1/classrooms/join/"


@pytest.mark.django_db
def test_student_can_join_via_invite_code(
    api_client: APIClient,
    student_user: User,
    classroom: Classroom,
) -> None:
    api_client.force_authenticate(user=student_user)
    response = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert ClassroomMember.objects.filter(
        classroom=classroom, user=student_user, role="student"
    ).exists()


@pytest.mark.django_db
def test_join_is_case_insensitive(
    api_client: APIClient,
    student_user: User,
    classroom: Classroom,
) -> None:
    api_client.force_authenticate(user=student_user)
    response = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code.lower()},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert ClassroomMember.objects.filter(
        classroom=classroom, user=student_user
    ).exists()


@pytest.mark.django_db
def test_duplicate_join_is_idempotent(
    api_client: APIClient,
    student_user: User,
    classroom: Classroom,
) -> None:
    api_client.force_authenticate(user=student_user)
    first = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert first.status_code == status.HTTP_201_CREATED

    second = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert second.status_code == status.HTTP_200_OK
    assert ClassroomMember.objects.filter(
        classroom=classroom, user=student_user
    ).count() == 1


@pytest.mark.django_db
def test_owner_join_returns_200_without_membership(
    api_client: APIClient,
    classroom_owner: User,
    classroom: Classroom,
) -> None:
    api_client.force_authenticate(user=classroom_owner)
    response = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert not ClassroomMember.objects.filter(
        classroom=classroom, user=classroom_owner
    ).exists()


@pytest.mark.django_db
def test_admin_join_returns_200_without_membership(
    api_client: APIClient,
    classroom_admin: User,
    classroom: Classroom,
) -> None:
    api_client.force_authenticate(user=classroom_admin)
    response = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert not ClassroomMember.objects.filter(
        classroom=classroom, user=classroom_admin
    ).exists()


@pytest.mark.django_db
def test_disabled_invite_code_returns_403(
    api_client: APIClient,
    student_user: User,
    classroom: Classroom,
) -> None:
    classroom.invite_code_enabled = False
    classroom.save(update_fields=["invite_code_enabled"])

    api_client.force_authenticate(user=student_user)
    response = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert not ClassroomMember.objects.filter(
        classroom=classroom, user=student_user
    ).exists()


@pytest.mark.django_db
def test_invalid_invite_code_returns_404(
    api_client: APIClient,
    student_user: User,
) -> None:
    api_client.force_authenticate(user=student_user)
    response = api_client.post(
        JOIN_URL,
        {"invite_code": "ZZZZZZZZ"},
        format="json",
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_archived_classroom_code_returns_404(
    api_client: APIClient,
    student_user: User,
    classroom: Classroom,
) -> None:
    classroom.is_archived = True
    classroom.save(update_fields=["is_archived"])

    api_client.force_authenticate(user=student_user)
    response = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_unauthenticated_join_returns_401(
    api_client: APIClient,
    classroom: Classroom,
) -> None:
    response = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_regenerate_code_requires_owner_or_admin(
    api_client: APIClient,
    student_user: User,
    classroom_owner: User,
    classroom: Classroom,
) -> None:
    """Student cannot regenerate code; owner can."""
    api_client.force_authenticate(user=student_user)
    ClassroomMember.objects.create(classroom=classroom, user=student_user, role="student")
    response = api_client.post(
        f"/api/v1/classrooms/{classroom.uuid}/regenerate_code/",
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN

    api_client.force_authenticate(user=classroom_owner)
    old_code = classroom.invite_code
    response = api_client.post(
        f"/api/v1/classrooms/{classroom.uuid}/regenerate_code/",
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    classroom.refresh_from_db()
    assert classroom.invite_code != old_code


@pytest.mark.django_db
def test_join_returns_classroom_detail_with_uuid(
    api_client: APIClient,
    student_user: User,
    classroom: Classroom,
) -> None:
    """Response includes classroom uuid so frontend can redirect."""
    api_client.force_authenticate(user=student_user)
    response = api_client.post(
        JOIN_URL,
        {"invite_code": classroom.invite_code},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["uuid"] == str(classroom.uuid)
    assert response.data["name"] == classroom.name
