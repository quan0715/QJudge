from __future__ import annotations

from django.contrib.auth.models import AnonymousUser
import pytest
from rest_framework.test import APIRequestFactory

from apps.classrooms.models import Classroom, ClassroomMember
from apps.classrooms.permissions import (
    IsClassroomMember,
    IsClassroomOwnerOrAdmin,
    get_user_role_in_classroom,
)
from apps.users.models import User


@pytest.fixture
def request_factory() -> APIRequestFactory:
    return APIRequestFactory()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="perm_owner", email="perm_owner@example.com", password="pass123"
    )


@pytest.fixture
def admin_user() -> User:
    return User.objects.create_user(
        username="perm_admin", email="perm_admin@example.com", password="pass123"
    )


@pytest.fixture
def ta_user() -> User:
    return User.objects.create_user(
        username="perm_ta", email="perm_ta@example.com", password="pass123"
    )


@pytest.fixture
def student_user() -> User:
    return User.objects.create_user(
        username="perm_student", email="perm_student@example.com", password="pass123"
    )


@pytest.fixture
def outsider_user() -> User:
    return User.objects.create_user(
        username="perm_outsider", email="perm_outsider@example.com", password="pass123"
    )


@pytest.fixture
def staff_user() -> User:
    return User.objects.create_user(
        username="perm_staff", email="perm_staff@example.com", password="pass123", is_staff=True
    )


@pytest.fixture
def classroom(owner: User, admin_user: User, ta_user: User, student_user: User) -> Classroom:
    room = Classroom.objects.create(name="Permission Room", owner=owner, invite_code="PERMROOM")
    room.admins.add(admin_user)
    ClassroomMember.objects.create(classroom=room, user=ta_user, role="ta")
    ClassroomMember.objects.create(classroom=room, user=student_user, role="student")
    return room


@pytest.mark.django_db
class TestGetUserRoleInClassroom:
    def test_returns_none_for_unauthenticated(self, classroom: Classroom) -> None:
        assert get_user_role_in_classroom(AnonymousUser(), classroom) is None

    def test_returns_admin_for_staff(self, staff_user: User, classroom: Classroom) -> None:
        assert get_user_role_in_classroom(staff_user, classroom) == "admin"

    def test_returns_teacher_for_owner(self, owner: User, classroom: Classroom) -> None:
        assert get_user_role_in_classroom(owner, classroom) == "teacher"

    def test_returns_teacher_for_classroom_admin(self, admin_user: User, classroom: Classroom) -> None:
        assert get_user_role_in_classroom(admin_user, classroom) == "teacher"

    def test_returns_membership_role_for_ta(self, ta_user: User, classroom: Classroom) -> None:
        assert get_user_role_in_classroom(ta_user, classroom) == "ta"

    def test_returns_membership_role_for_student(self, student_user: User, classroom: Classroom) -> None:
        assert get_user_role_in_classroom(student_user, classroom) == "student"

    def test_returns_none_for_outsider(self, outsider_user: User, classroom: Classroom) -> None:
        assert get_user_role_in_classroom(outsider_user, classroom) is None


@pytest.mark.django_db
class TestIsClassroomOwnerOrAdmin:
    def test_denies_unauthenticated_user(self, request_factory: APIRequestFactory, classroom: Classroom) -> None:
        request = request_factory.get("/")
        request.user = AnonymousUser()
        assert IsClassroomOwnerOrAdmin().has_object_permission(request, None, classroom) is False

    def test_allows_staff(self, request_factory: APIRequestFactory, staff_user: User, classroom: Classroom) -> None:
        request = request_factory.get("/")
        request.user = staff_user
        assert IsClassroomOwnerOrAdmin().has_object_permission(request, None, classroom) is True

    def test_allows_owner(self, request_factory: APIRequestFactory, owner: User, classroom: Classroom) -> None:
        request = request_factory.get("/")
        request.user = owner
        assert IsClassroomOwnerOrAdmin().has_object_permission(request, None, classroom) is True

    def test_allows_classroom_admin(self, request_factory: APIRequestFactory, admin_user: User, classroom: Classroom) -> None:
        request = request_factory.get("/")
        request.user = admin_user
        assert IsClassroomOwnerOrAdmin().has_object_permission(request, None, classroom) is True

    def test_denies_member_without_admin_role(
        self, request_factory: APIRequestFactory, student_user: User, classroom: Classroom
    ) -> None:
        request = request_factory.get("/")
        request.user = student_user
        assert IsClassroomOwnerOrAdmin().has_object_permission(request, None, classroom) is False

    def test_denies_when_object_has_no_classroom(self, request_factory: APIRequestFactory, owner: User) -> None:
        request = request_factory.get("/")
        request.user = owner
        assert IsClassroomOwnerOrAdmin().has_object_permission(request, None, object()) is False


@pytest.mark.django_db
class TestIsClassroomMember:
    def test_denies_unauthenticated_user(self, request_factory: APIRequestFactory, classroom: Classroom) -> None:
        request = request_factory.get("/")
        request.user = AnonymousUser()
        assert IsClassroomMember().has_object_permission(request, None, classroom) is False

    def test_allows_staff(self, request_factory: APIRequestFactory, staff_user: User, classroom: Classroom) -> None:
        request = request_factory.get("/")
        request.user = staff_user
        assert IsClassroomMember().has_object_permission(request, None, classroom) is True

    def test_allows_owner(self, request_factory: APIRequestFactory, owner: User, classroom: Classroom) -> None:
        request = request_factory.get("/")
        request.user = owner
        assert IsClassroomMember().has_object_permission(request, None, classroom) is True

    def test_allows_admin(self, request_factory: APIRequestFactory, admin_user: User, classroom: Classroom) -> None:
        request = request_factory.get("/")
        request.user = admin_user
        assert IsClassroomMember().has_object_permission(request, None, classroom) is True

    def test_allows_student_member(
        self, request_factory: APIRequestFactory, student_user: User, classroom: Classroom
    ) -> None:
        request = request_factory.get("/")
        request.user = student_user
        assert IsClassroomMember().has_object_permission(request, None, classroom) is True

    def test_denies_outsider(
        self, request_factory: APIRequestFactory, outsider_user: User, classroom: Classroom
    ) -> None:
        request = request_factory.get("/")
        request.user = outsider_user
        assert IsClassroomMember().has_object_permission(request, None, classroom) is False

