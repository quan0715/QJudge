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
        username="integrity_owner",
        email="integrity_owner@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def classroom_admin() -> User:
    return User.objects.create_user(
        username="integrity_admin",
        email="integrity_admin@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def student_user() -> User:
    return User.objects.create_user(
        username="integrity_student",
        email="integrity_student@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def classroom(classroom_owner: User, classroom_admin: User) -> Classroom:
    classroom = Classroom.objects.create(
        name="Integrity Classroom",
        description="",
        owner=classroom_owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    classroom.admins.add(classroom_admin)
    return classroom


@pytest.mark.django_db
def test_add_members_skips_owner_and_admin_membership_rows(
    api_client: APIClient,
    classroom_owner: User,
    classroom_admin: User,
    student_user: User,
    classroom: Classroom,
) -> None:
    api_client.force_authenticate(user=classroom_owner)

    response = api_client.post(
        f"/api/v1/classrooms/{classroom.uuid}/add_members/",
        {
            "usernames": [
                classroom_owner.username,
                classroom_admin.username,
                student_user.username,
            ],
            "role": "student",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["added"] == [student_user.username]
    assert sorted(response.data["already_exists"]) == sorted(
        [classroom_owner.username, classroom_admin.username]
    )
    assert not ClassroomMember.objects.filter(classroom=classroom, user=classroom_owner).exists()
    assert not ClassroomMember.objects.filter(classroom=classroom, user=classroom_admin).exists()
    assert ClassroomMember.objects.filter(classroom=classroom, user=student_user).exists()


@pytest.mark.django_db
def test_add_members_accepts_email_and_unicode_or_underscore_usernames(
    api_client: APIClient,
    classroom_owner: User,
    classroom: Classroom,
) -> None:
    unicode_user = User.objects.create_user(
        username="王小明",
        email="wang@example.com",
        password="pass",
        role="student",
    )
    underscored_user = User.objects.create_user(
        username="student_one",
        email="student_one@example.com",
        password="pass",
        role="student",
    )

    api_client.force_authenticate(user=classroom_owner)
    response = api_client.post(
        f"/api/v1/classrooms/{classroom.uuid}/add_members/",
        {
            "usernames": [
                unicode_user.username,
                underscored_user.email,
            ],
            "role": "student",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert sorted(response.data["added"]) == sorted([unicode_user.username, underscored_user.username])
    assert response.data["not_found"] == []
    assert ClassroomMember.objects.filter(classroom=classroom, user=unicode_user).exists()
    assert ClassroomMember.objects.filter(classroom=classroom, user=underscored_user).exists()


@pytest.mark.django_db
def test_join_skips_owner_membership_row(
    api_client: APIClient,
    classroom_owner: User,
    classroom: Classroom,
) -> None:
    api_client.force_authenticate(user=classroom_owner)

    response = api_client.post(
        "/api/v1/classrooms/join/",
        {"invite_code": classroom.invite_code},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert not ClassroomMember.objects.filter(classroom=classroom, user=classroom_owner).exists()


@pytest.mark.django_db
def test_join_skips_admin_membership_row(
    api_client: APIClient,
    classroom_admin: User,
    classroom: Classroom,
) -> None:
    api_client.force_authenticate(user=classroom_admin)

    response = api_client.post(
        "/api/v1/classrooms/join/",
        {"invite_code": classroom.invite_code},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert not ClassroomMember.objects.filter(classroom=classroom, user=classroom_admin).exists()
