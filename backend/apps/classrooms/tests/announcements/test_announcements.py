from __future__ import annotations

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom, ClassroomAnnouncement, ClassroomMember
from apps.users.models import User


# ── Fixtures ─────────────────────────────────────────────

@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="owner", email="owner@example.com", password="pass123"
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="student", email="student@example.com", password="pass123"
    )


@pytest.fixture
def outsider() -> User:
    return User.objects.create_user(
        username="outsider", email="outsider@example.com", password="pass123"
    )


@pytest.fixture
def classroom(owner: User) -> Classroom:
    return Classroom.objects.create(
        name="Test Classroom",
        owner=owner,
        invite_code="TESTCODE",
    )


@pytest.fixture
def student_member(classroom: Classroom, student: User) -> ClassroomMember:
    return ClassroomMember.objects.create(
        classroom=classroom, user=student, role="student"
    )


@pytest.fixture
def announcement(classroom: Classroom, owner: User) -> ClassroomAnnouncement:
    return ClassroomAnnouncement.objects.create(
        classroom=classroom,
        title="Test Announcement",
        content="# Hello\nThis is **markdown**.",
        is_pinned=False,
        created_by=owner,
    )


def url_list(classroom_id: int) -> str:
    return f"/api/v1/classrooms/{classroom_id}/announcements/"


def url_create(classroom_id: int) -> str:
    return f"/api/v1/classrooms/{classroom_id}/announcements/create/"


def url_update(classroom_id: int, ann_id: int) -> str:
    return f"/api/v1/classrooms/{classroom_id}/announcements/{ann_id}/"


def url_delete(classroom_id: int, ann_id: int) -> str:
    return f"/api/v1/classrooms/{classroom_id}/announcements/{ann_id}/delete/"


# ── List ─────────────────────────────────────────────────

@pytest.mark.django_db
class TestListAnnouncements:
    def test_member_can_list(
        self, api_client: APIClient, classroom: Classroom,
        student: User, student_member: ClassroomMember,
        announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=student)
        resp = api_client.get(url_list(classroom.id))
        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1
        assert resp.data[0]["title"] == "Test Announcement"
        assert "created_by_username" in resp.data[0]

    def test_owner_can_list(
        self, api_client: APIClient, classroom: Classroom,
        owner: User, announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.get(url_list(classroom.id))
        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1

    def test_outsider_cannot_list(
        self, api_client: APIClient, classroom: Classroom,
        outsider: User, announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=outsider)
        resp = api_client.get(url_list(classroom.id))
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_cannot_list(
        self, api_client: APIClient, classroom: Classroom,
        announcement: ClassroomAnnouncement,
    ) -> None:
        resp = api_client.get(url_list(classroom.id))
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_pinned_first_ordering(
        self, api_client: APIClient, classroom: Classroom,
        owner: User, announcement: ClassroomAnnouncement,
    ) -> None:
        pinned = ClassroomAnnouncement.objects.create(
            classroom=classroom, title="Pinned", content="p",
            is_pinned=True, created_by=owner,
        )
        api_client.force_authenticate(user=owner)
        resp = api_client.get(url_list(classroom.id))
        assert resp.data[0]["id"] == pinned.id
        assert resp.data[1]["id"] == announcement.id


# ── Create ───────────────────────────────────────────────

@pytest.mark.django_db
class TestCreateAnnouncement:
    def test_owner_can_create(
        self, api_client: APIClient, classroom: Classroom, owner: User,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.post(
            url_create(classroom.id),
            {"title": "New", "content": "Body", "is_pinned": True},
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data["title"] == "New"
        assert resp.data["is_pinned"] is True
        assert resp.data["created_by_username"] == "owner"

    def test_student_cannot_create(
        self, api_client: APIClient, classroom: Classroom,
        student: User, student_member: ClassroomMember,
    ) -> None:
        api_client.force_authenticate(user=student)
        resp = api_client.post(
            url_create(classroom.id),
            {"title": "Nope", "content": "x"},
            format="json",
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_outsider_cannot_create(
        self, api_client: APIClient, classroom: Classroom, outsider: User,
    ) -> None:
        api_client.force_authenticate(user=outsider)
        resp = api_client.post(
            url_create(classroom.id),
            {"title": "Nope", "content": "x"},
            format="json",
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_title_required(
        self, api_client: APIClient, classroom: Classroom, owner: User,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.post(
            url_create(classroom.id),
            {"content": "no title"},
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


# ── Update ───────────────────────────────────────────────

@pytest.mark.django_db
class TestUpdateAnnouncement:
    def test_owner_can_update(
        self, api_client: APIClient, classroom: Classroom,
        owner: User, announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.patch(
            url_update(classroom.id, announcement.id),
            {"title": "Updated Title"},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["title"] == "Updated Title"

    def test_student_member_can_update(
        self, api_client: APIClient, classroom: Classroom,
        student: User, student_member: ClassroomMember,
        announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=student)
        resp = api_client.patch(
            url_update(classroom.id, announcement.id),
            {"content": "student edited"},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["content"] == "student edited"

    def test_outsider_cannot_update(
        self, api_client: APIClient, classroom: Classroom,
        outsider: User, announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=outsider)
        resp = api_client.patch(
            url_update(classroom.id, announcement.id),
            {"title": "Hack"},
            format="json",
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_partial_update(
        self, api_client: APIClient, classroom: Classroom,
        owner: User, announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.patch(
            url_update(classroom.id, announcement.id),
            {"is_pinned": True},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["is_pinned"] is True
        assert resp.data["title"] == "Test Announcement"  # unchanged

    def test_update_nonexistent_returns_404(
        self, api_client: APIClient, classroom: Classroom, owner: User,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.patch(
            url_update(classroom.id, 99999),
            {"title": "x"},
            format="json",
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ── Delete ───────────────────────────────────────────────

@pytest.mark.django_db
class TestDeleteAnnouncement:
    def test_owner_can_delete(
        self, api_client: APIClient, classroom: Classroom,
        owner: User, announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.delete(url_delete(classroom.id, announcement.id))
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not ClassroomAnnouncement.objects.filter(pk=announcement.id).exists()

    def test_student_member_can_delete(
        self, api_client: APIClient, classroom: Classroom,
        student: User, student_member: ClassroomMember,
        announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=student)
        resp = api_client.delete(url_delete(classroom.id, announcement.id))
        assert resp.status_code == status.HTTP_204_NO_CONTENT

    def test_outsider_cannot_delete(
        self, api_client: APIClient, classroom: Classroom,
        outsider: User, announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=outsider)
        resp = api_client.delete(url_delete(classroom.id, announcement.id))
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_nonexistent_returns_404(
        self, api_client: APIClient, classroom: Classroom, owner: User,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.delete(url_delete(classroom.id, 99999))
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ── Detail serializer includes announcements ─────────────

@pytest.mark.django_db
class TestDetailIncludesAnnouncements:
    def test_classroom_detail_contains_announcements(
        self, api_client: APIClient, classroom: Classroom,
        owner: User, announcement: ClassroomAnnouncement,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.get(f"/api/v1/classrooms/{classroom.id}/")
        assert resp.status_code == status.HTTP_200_OK
        assert "announcements" in resp.data
        assert len(resp.data["announcements"]) == 1
        assert resp.data["announcements"][0]["title"] == "Test Announcement"

    def test_empty_announcements(
        self, api_client: APIClient, classroom: Classroom, owner: User,
    ) -> None:
        api_client.force_authenticate(user=owner)
        resp = api_client.get(f"/api/v1/classrooms/{classroom.id}/")
        assert resp.data["announcements"] == []
