import pytest
from uuid import uuid4

from rest_framework import status
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom, ClassroomContest
from apps.classrooms.models import ClassroomMember
from apps.contests.models import Contest
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def platform_admin() -> User:
    return User.objects.create_superuser(
        username="bind_platform_admin",
        email="bind_platform_admin@example.com",
        password="pass",
    )


@pytest.fixture
def classroom_owner() -> User:
    return User.objects.create_user(
        username="bind_classroom_owner",
        email="bind_classroom_owner@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def classroom_admin() -> User:
    return User.objects.create_user(
        username="bind_classroom_admin",
        email="bind_classroom_admin@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def student_user() -> User:
    return User.objects.create_user(
        username="bind_student",
        email="bind_student@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def contest_owner() -> User:
    return User.objects.create_user(
        username="bind_contest_owner",
        email="bind_contest_owner@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def contest(contest_owner: User) -> Contest:
    return Contest.objects.create(
        name="Bindable Contest",
        owner=contest_owner,
        status="published",
        visibility="public",
    )


@pytest.fixture
def classroom(classroom_owner: User, classroom_admin: User, student_user: User) -> Classroom:
    classroom = Classroom.objects.create(
        name="ACL Classroom",
        description="",
        owner=classroom_owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    classroom.admins.add(classroom_admin)
    ClassroomMember.objects.create(classroom=classroom, user=student_user, role="student")
    return classroom


@pytest.mark.django_db
def test_bind_contest_is_platform_admin_only(
    api_client: APIClient,
    platform_admin: User,
    classroom_owner: User,
    classroom_admin: User,
    student_user: User,
    classroom: Classroom,
    contest: Contest,
) -> None:
    url = f"/api/v1/classrooms/{classroom.uuid}/bind_contest/"

    api_client.force_authenticate(user=classroom_owner)
    owner_response = api_client.post(url, {"contest_id": str(contest.id)}, format="json")
    assert owner_response.status_code == status.HTTP_403_FORBIDDEN

    api_client.force_authenticate(user=classroom_admin)
    admin_response = api_client.post(url, {"contest_id": str(contest.id)}, format="json")
    assert admin_response.status_code == status.HTTP_403_FORBIDDEN

    api_client.force_authenticate(user=student_user)
    student_response = api_client.post(url, {"contest_id": str(contest.id)}, format="json")
    assert student_response.status_code == status.HTTP_403_FORBIDDEN

    api_client.force_authenticate(user=platform_admin)
    platform_response = api_client.post(url, {"contest_id": str(contest.id)}, format="json")
    assert platform_response.status_code == status.HTTP_201_CREATED
    assert ClassroomContest.objects.filter(classroom=classroom, contest=contest).exists()


@pytest.mark.django_db
def test_unbind_contest_is_platform_admin_only(
    api_client: APIClient,
    platform_admin: User,
    classroom_owner: User,
    classroom: Classroom,
    contest: Contest,
) -> None:
    ClassroomContest.objects.create(classroom=classroom, contest=contest)
    url = f"/api/v1/classrooms/{classroom.uuid}/unbind_contest/"

    api_client.force_authenticate(user=classroom_owner)
    owner_response = api_client.post(url, {"contest_id": str(contest.id)}, format="json")
    assert owner_response.status_code == status.HTTP_403_FORBIDDEN
    assert ClassroomContest.objects.filter(classroom=classroom, contest=contest).exists()

    api_client.force_authenticate(user=platform_admin)
    platform_response = api_client.post(url, {"contest_id": str(contest.id)}, format="json")
    assert platform_response.status_code == status.HTTP_200_OK
    assert not ClassroomContest.objects.filter(classroom=classroom, contest=contest).exists()
