from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamEvent, ExamEvidenceFrame, ExamStatus
from apps.users.models import User


def make_user(username: str, *, role: str = "student") -> User:
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.com",
        password="testpass123",
        role=role,
    )


def make_contest(**overrides) -> Contest:
    now = timezone.now()
    defaults = {
        "name": "Attendance Start Gate",
        "status": "published",
        "visibility": "public",
        "start_time": now - timedelta(minutes=5),
        "end_time": now + timedelta(hours=1),
        "attendance_check_enabled": True,
    }
    defaults.update(overrides)
    return Contest.objects.create(**defaults)


@pytest.mark.django_db
def test_start_exam_requires_confirmed_attendance_check_in() -> None:
    api_client = APIClient()
    student = make_user("attendance_start_blocked")
    contest = make_contest()
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    api_client.force_authenticate(user=student)

    response = api_client.post(f"/api/v1/contests/{contest.id}/exam/start/")

    assert response.status_code == 403
    assert response.data["code"] == "attendance_check_in_required"
    assert (
        response.data["error"]["message"]
        == "Please complete attendance check-in before starting the exam."
    )


@pytest.mark.django_db
def test_start_exam_allows_teacher_assisted_check_in() -> None:
    api_client = APIClient()
    student = make_user("attendance_start_allowed")
    teacher = make_user("attendance_start_teacher", role="teacher")
    contest = make_contest(owner=teacher)
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.NOT_STARTED,
    )
    event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_in",
        metadata={
            "attendance_purpose": "check_in",
            "attendance_mode": "teacher_assisted",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="teacher-assisted-start.webp",
        client_captured_at_ms=1,
    )
    api_client.force_authenticate(user=student)

    response = api_client.post(f"/api/v1/contests/{contest.id}/exam/start/")

    assert response.status_code == 200
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.IN_PROGRESS


@pytest.mark.django_db
def test_attendance_evidence_confirm_allows_not_started_participant() -> None:
    api_client = APIClient()
    student = make_user("attendance_confirm_student")
    contest = make_contest()
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_in",
        metadata={
            "attendance_purpose": "check_in",
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
            "evidence_cluster_id": "attendance-test-event",
        },
    )
    frame = ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        evidence_cluster_id="attendance-test-event",
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        evidence_mode=ExamEvidenceFrame.EvidenceMode.AUDIT,
        upload_session_id="attendance-upload-1",
        seq=1,
        object_key=f"contest_{contest.id}/user_{student.id}/session_attendance-upload-1/attendance/ts_1_seq_0001.webp",
        client_captured_at_ms=1,
        status=ExamEvidenceFrame.Status.ISSUED,
    )
    api_client.force_authenticate(user=student)

    with patch("apps.contests.views.exam_evidence.get_s3_client") as mock_get_s3_client:
        mock_get_s3_client.return_value.head_object.return_value = {
            "ContentLength": 1234,
            "ContentType": "image/webp",
            "ETag": '"attendance-etag"',
        }
        response = api_client.post(
            f"/api/v1/contests/{contest.id}/exam/evidence/upload-confirm/",
            {
                "event_id": event.id,
                "upload_session_id": "attendance-upload-1",
                "frames": [
                    {
                        "evidence_frame_id": frame.id,
                        "object_key": frame.object_key,
                        "byte_size": 1234,
                    }
                ],
            },
            format="json",
        )

    assert response.status_code == 200
    frame.refresh_from_db()
    assert frame.status == ExamEvidenceFrame.Status.UPLOADED
