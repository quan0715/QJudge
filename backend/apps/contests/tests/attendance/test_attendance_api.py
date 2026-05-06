from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamEvent, ExamStatus
from apps.contests.services.attendance import create_attendance_token
from apps.users.models import User


def make_user(username: str, *, role: str = "student", is_staff: bool = False) -> User:
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.com",
        password="testpass123",
        role=role,
        is_staff=is_staff,
    )


def make_contest(owner: User | None = None, **overrides) -> Contest:
    now = timezone.now()
    defaults = {
        "name": "Attendance Exam",
        "owner": owner,
        "status": "published",
        "visibility": "public",
        "start_time": now - timedelta(minutes=5),
        "end_time": now + timedelta(hours=1),
        "attendance_check_enabled": True,
    }
    defaults.update(overrides)
    return Contest.objects.create(**defaults)


@pytest.mark.django_db
def test_teacher_can_get_qr_token() -> None:
    api_client = APIClient()
    teacher = make_user("attendance_qr_teacher", role="teacher")
    contest = make_contest(owner=teacher)
    api_client.force_authenticate(user=teacher)

    response = api_client.get(f"/api/v1/contests/{contest.id}/attendance/qr-token/?purpose=check_in")

    assert response.status_code == 200
    assert response.data["purpose"] == "check_in"
    assert response.data["qr_value"].startswith("qj-att:v1:check_in:")
    assert response.data["refresh_after_seconds"] == 30
    assert response.data["expires_in_seconds"] == 45


@pytest.mark.django_db
def test_student_cannot_get_qr_token() -> None:
    api_client = APIClient()
    teacher = make_user("attendance_qr_owner", role="teacher")
    student = make_user("attendance_qr_student")
    contest = make_contest(owner=teacher)
    ContestParticipant.objects.create(contest=contest, user=student)
    api_client.force_authenticate(user=student)

    response = api_client.get(f"/api/v1/contests/{contest.id}/attendance/qr-token/?purpose=check_in")

    assert response.status_code == 403


@pytest.mark.django_db
def test_student_self_scan_check_in_creates_event() -> None:
    api_client = APIClient()
    student = make_user("attendance_self_scan_student")
    contest = make_contest()
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    token = create_attendance_token(contest, "check_in")
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {
            "mode": "student_self_scan",
            "purpose": "check_in",
            "token": token,
            "device_kind": "mobile",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["source_module"] == "attendance"
    event = ExamEvent.objects.get(id=response.data["event_id"])
    assert event.event_type == "attendance_check_in"
    assert event.metadata["attendance_mode"] == "student_self_scan"
    assert event.metadata["evidence_cluster_id"] == response.data["evidence_cluster_id"]


@pytest.mark.django_db
@pytest.mark.parametrize("exam_status", [ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED])
def test_student_self_scan_rejected_during_exam_runtime(exam_status: str) -> None:
    api_client = APIClient()
    student = make_user(f"attendance_runtime_{exam_status}")
    contest = make_contest()
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=exam_status)
    token = create_attendance_token(contest, "check_in")
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_in", "token": token},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["code"] == "check_in_only_before_personal_start"


@pytest.mark.django_db
def test_check_out_requires_submitted_status() -> None:
    api_client = APIClient()
    student = make_user("attendance_checkout_not_submitted")
    contest = make_contest()
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    token = create_attendance_token(contest, "check_out")
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_out", "token": token},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["code"] == "checkout_not_available_until_submitted"


@pytest.mark.django_db
def test_teacher_assisted_check_in_uses_unified_event_endpoint() -> None:
    api_client = APIClient()
    teacher = make_user("attendance_assist_teacher", role="teacher")
    student = make_user("attendance_assist_student")
    contest = make_contest(owner=teacher)
    ContestParticipant.objects.create(contest=contest, user=student)
    api_client.force_authenticate(user=teacher)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {
            "mode": "teacher_assisted",
            "purpose": "check_in",
            "user_id": student.id,
            "reason": "student camera unavailable",
        },
        format="json",
    )

    assert response.status_code == 201
    event = ExamEvent.objects.get(id=response.data["event_id"])
    assert event.event_type == "attendance_check_in"
    assert event.metadata["attendance_mode"] == "teacher_assisted"
    assert event.metadata["assisted_by_user_id"] == teacher.id
    assert response.data["attendance_status"]["checkInStatus"] == "teacher_assisted"
