import pytest

from rest_framework import status
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def student_user() -> User:
    return User.objects.create_user(
        username="create_student",
        email="create_student@example.com",
        password="pass123",
        role="student",
    )


@pytest.fixture
def teacher_user() -> User:
    return User.objects.create_user(
        username="create_teacher",
        email="create_teacher@example.com",
        password="pass123",
        role="teacher",
    )


@pytest.fixture
def admin_user() -> User:
    return User.objects.create_superuser(
        username="create_admin",
        email="create_admin@example.com",
        password="pass123",
        role="admin",
    )


@pytest.mark.django_db
def test_student_cannot_create_classroom(api_client: APIClient, student_user: User) -> None:
    api_client.force_authenticate(user=student_user)

    response = api_client.post(
        "/api/v1/classrooms/",
        {"name": "Student Room", "description": "No access"},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert Classroom.objects.count() == 0


@pytest.mark.django_db
def test_teacher_can_create_classroom(api_client: APIClient, teacher_user: User) -> None:
    api_client.force_authenticate(user=teacher_user)

    response = api_client.post(
        "/api/v1/classrooms/",
        {"name": "Teacher Room", "description": "Allowed"},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    classroom = Classroom.objects.get(name="Teacher Room")
    assert classroom.owner == teacher_user


@pytest.mark.django_db
def test_admin_can_create_classroom(api_client: APIClient, admin_user: User) -> None:
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(
        "/api/v1/classrooms/",
        {"name": "Admin Room", "description": "Allowed"},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    classroom = Classroom.objects.get(name="Admin Room")
    assert classroom.owner == admin_user
