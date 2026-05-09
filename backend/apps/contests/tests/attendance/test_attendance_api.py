from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import (
    Contest,
    ContestActivity,
    ContestParticipant,
    ExamAnswer,
    ExamEvent,
    ExamEvidenceFrame,
    ExamQuestion,
    ExamStatus,
)
from apps.contests.services.attendance import (
    build_attendance_status,
    build_participant_attendance_summary,
    create_attendance_token,
)
from apps.problems.models import Problem
from apps.submissions.models import Submission
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
    assert len(response.data["manual_code"]) == 6
    assert response.data["manual_code"].isdigit()
    assert response.data["refresh_after_seconds"] == 30
    assert response.data["expires_in_seconds"] == 120


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
    assert event.metadata["attendance_credential_source"] == "qr_token"
    assert event.metadata["evidence_cluster_id"] == response.data["evidence_cluster_id"]


@pytest.mark.django_db
def test_student_self_scan_manual_code_creates_event() -> None:
    api_client = APIClient()
    teacher = make_user("attendance_manual_code_teacher", role="teacher")
    student = make_user("attendance_manual_code_student")
    contest = make_contest(owner=teacher)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    api_client.force_authenticate(user=teacher)
    token_response = api_client.get(f"/api/v1/contests/{contest.id}/attendance/qr-token/?purpose=check_in")
    manual_code = token_response.data["manual_code"].lower().replace("-", " ")

    api_client.force_authenticate(user=student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {
            "mode": "student_self_scan",
            "purpose": "check_in",
            "manual_code": manual_code,
            "device_kind": "mobile",
        },
        format="json",
    )

    assert response.status_code == 201
    event = ExamEvent.objects.get(id=response.data["event_id"])
    assert event.event_type == "attendance_check_in"
    assert event.metadata["attendance_credential_source"] == "manual_code"


@pytest.mark.django_db
def test_student_self_scan_rejects_wrong_manual_code_purpose() -> None:
    api_client = APIClient()
    teacher = make_user("attendance_wrong_manual_code_teacher", role="teacher")
    student = make_user("attendance_wrong_manual_code_student")
    contest = make_contest(owner=teacher)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    api_client.force_authenticate(user=teacher)
    token_response = api_client.get(f"/api/v1/contests/{contest.id}/attendance/qr-token/?purpose=check_out")

    api_client.force_authenticate(user=student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {
            "mode": "student_self_scan",
            "purpose": "check_in",
            "manual_code": token_response.data["manual_code"],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "invalid_attendance_manual_code"


@pytest.mark.django_db
def test_validate_endpoint_accepts_valid_manual_code() -> None:
    api_client = APIClient()
    teacher = make_user("validate_code_teacher", role="teacher")
    student = make_user("validate_code_student")
    contest = make_contest(owner=teacher)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    api_client.force_authenticate(user=teacher)
    token_response = api_client.get(f"/api/v1/contests/{contest.id}/attendance/qr-token/?purpose=check_in")
    manual_code = token_response.data["manual_code"]

    api_client.force_authenticate(user=student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/validate/",
        {"purpose": "check_in", "manual_code": manual_code},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["valid"] is True
    assert response.data["purpose"] == "check_in"
    assert response.data["credential_source"] == "manual_code"


@pytest.mark.django_db
def test_validate_endpoint_accepts_valid_token() -> None:
    api_client = APIClient()
    teacher = make_user("validate_token_teacher", role="teacher")
    student = make_user("validate_token_student")
    contest = make_contest(owner=teacher)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    token = create_attendance_token(contest, "check_in")

    api_client.force_authenticate(user=student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/validate/",
        {"purpose": "check_in", "token": token},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["valid"] is True
    assert response.data["purpose"] == "check_in"
    assert response.data["credential_source"] == "qr_token"


@pytest.mark.django_db
def test_validate_endpoint_rejects_invalid_code() -> None:
    api_client = APIClient()
    teacher = make_user("validate_code_reject_teacher", role="teacher")
    student = make_user("validate_code_reject_student")
    contest = make_contest(owner=teacher)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/validate/",
        {"purpose": "check_in", "manual_code": "000000"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "invalid_attendance_manual_code"


@pytest.mark.django_db
def test_validate_endpoint_rejects_invalid_token() -> None:
    api_client = APIClient()
    student = make_user("validate_token_reject_student")
    contest = make_contest()
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/validate/",
        {"purpose": "check_in", "token": "not-a-real-token"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "invalid_attendance_token"


@pytest.mark.django_db
def test_validate_endpoint_requires_token_or_manual_code() -> None:
    api_client = APIClient()
    student = make_user("validate_missing_credential_student")
    contest = make_contest()
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/validate/",
        {"purpose": "check_in"},
        format="json",
    )

    assert response.status_code == 400


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
def test_completed_check_out_disables_student_check_out_action() -> None:
    student = make_user("attendance_checkout_done")
    contest = make_contest()
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
    )
    event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_out",
        metadata={
            "attendance_purpose": "check_out",
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="attendance-checkout-done.webp",
        client_captured_at_ms=1,
    )

    status = build_attendance_status(contest, participant)

    assert status["checkOutStatus"] == "photo_confirmed"
    assert status["canCheckOut"] is False


@pytest.mark.django_db
def test_completed_check_in_disables_student_check_in_action_before_start() -> None:
    student = make_user("attendance_checkin_done")
    contest = make_contest()
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
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="attendance-checkin-done.webp",
        client_captured_at_ms=1,
    )

    status = build_attendance_status(contest, participant)

    assert status["checkInStatus"] == "photo_confirmed"
    assert status["canCheckIn"] is False
    assert status["canStartExam"] is True


@pytest.mark.django_db
def test_incomplete_repeat_check_in_does_not_downgrade_ready_status() -> None:
    student = make_user("attendance_repeat_incomplete_ready")
    contest = make_contest()
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.NOT_STARTED,
    )
    completed_event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_in",
        metadata={
            "attendance_purpose": "check_in",
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=completed_event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="attendance-completed-before-repeat.webp",
        client_captured_at_ms=1,
    )
    ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_in",
        metadata={
            "attendance_purpose": "check_in",
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )

    status = build_attendance_status(contest, participant)

    assert status["checkInStatus"] == "photo_confirmed"
    assert status["canStartExam"] is True


@pytest.mark.django_db
def test_student_self_scan_rejects_completed_check_in_before_start() -> None:
    api_client = APIClient()
    student = make_user("attendance_repeat_checkin_student")
    contest = make_contest()
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
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="attendance-repeat-checkin.webp",
        client_captured_at_ms=1,
    )
    token = create_attendance_token(contest, "check_in")
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_in", "token": token},
        format="json",
    )

    participant.refresh_from_db()
    assert response.status_code == 409
    assert response.data["code"] == "attendance_check_in_already_completed"
    assert (
        ExamEvent.objects.filter(
            contest=contest,
            user=student,
            event_type="attendance_check_in",
        ).count()
        == 1
    )
    assert participant.exam_status == ExamStatus.NOT_STARTED


@pytest.mark.django_db
def test_student_self_scan_check_in_after_submission_still_rejected() -> None:
    api_client = APIClient()
    student = make_user("attendance_repeat_checkin_submitted_student")
    contest = make_contest()
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
    )
    event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_in",
        metadata={
            "attendance_purpose": "check_in",
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="attendance-repeat-checkin-after-submit.webp",
        client_captured_at_ms=1,
    )
    token = create_attendance_token(contest, "check_in")
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_in", "token": token},
        format="json",
    )

    participant.refresh_from_db()
    assert response.status_code == 409
    assert response.data["code"] == "check_in_only_before_personal_start"
    assert participant.exam_status == ExamStatus.SUBMITTED


@pytest.mark.django_db
def test_student_self_scan_rejects_completed_check_out() -> None:
    api_client = APIClient()
    student = make_user("attendance_repeat_checkout_student")
    contest = make_contest()
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
    )
    event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_out",
        metadata={
            "attendance_purpose": "check_out",
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="attendance-repeat-checkout.webp",
        client_captured_at_ms=1,
    )
    token = create_attendance_token(contest, "check_out")
    api_client.force_authenticate(user=student)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_out", "token": token},
        format="json",
    )

    participant.refresh_from_db()
    assert response.status_code == 409
    assert response.data["code"] == "attendance_check_out_already_completed"
    assert (
        ExamEvent.objects.filter(
            contest=contest,
            user=student,
            event_type="attendance_check_out",
        ).count()
        == 1
    )
    assert participant.exam_status == ExamStatus.SUBMITTED


@pytest.mark.django_db
def test_room_and_selfie_policy_requires_two_attendance_photos() -> None:
    student = make_user("attendance_two_photo_student")
    contest = make_contest(attendance_photo_policy="room_and_selfie")
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
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        seq=1,
        object_key="attendance-room.webp",
        client_captured_at_ms=1,
    )

    status = build_attendance_status(contest, participant)
    summary = build_participant_attendance_summary(contest, participant)

    assert status["checkInStatus"] == "event_created"
    assert status["canStartExam"] is False
    assert "missing_photo" in summary["anomalies"]

    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        seq=2,
        object_key="attendance-selfie.webp",
        client_captured_at_ms=2,
    )

    status = build_attendance_status(contest, participant)
    summary = build_participant_attendance_summary(contest, participant)

    assert status["checkInStatus"] == "photo_confirmed"
    assert status["canStartExam"] is True
    assert "missing_photo" not in summary["anomalies"]


@pytest.mark.django_db
def test_teacher_can_reset_participant_exam_record() -> None:
    api_client = APIClient()
    teacher = make_user("attendance_reset_teacher", role="teacher")
    student = make_user("attendance_reset_student")
    contest = make_contest(owner=teacher)
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
        score=88,
        rank=3,
        started_at=timezone.now() - timedelta(minutes=30),
        left_at=timezone.now() - timedelta(minutes=5),
        locked_at=timezone.now() - timedelta(minutes=20),
        lock_reason="focus lost",
        violation_count=4,
        submit_reason="manual submit",
    )
    question = ExamQuestion.objects.create(contest=contest, prompt="Q1")
    ExamAnswer.objects.create(
        participant=participant,
        question=question,
        answer={"selected": "A"},
        score=1,
    )
    problem = Problem.objects.create(
        created_by=teacher,
        slug=f"reset-exam-record-problem-{contest.id}",
    )
    Submission.objects.create(
        contest=contest,
        user=student,
        problem=problem,
        source_type="contest",
        language="python",
        code="print(1)",
        status="AC",
        score=100,
    )
    event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_in",
        metadata={
            "attendance_purpose": "check_in",
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="attendance-reset.webp",
        client_captured_at_ms=1,
    )
    api_client.force_authenticate(user=teacher)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/participants/reset_exam_record/",
        {"user_id": student.id},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["deleted_answers"] == 1
    assert response.data["deleted_submissions"] == 1
    assert response.data["deleted_events"] == 1
    assert response.data["attendance_status"]["checkInStatus"] == "missing"
    assert ExamAnswer.objects.filter(participant=participant).count() == 0
    assert Submission.objects.filter(contest=contest, user=student).count() == 0
    assert ExamEvent.objects.filter(contest=contest, user=student).count() == 0
    assert ExamEvidenceFrame.objects.filter(contest=contest, user=student).count() == 0
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.NOT_STARTED
    assert participant.score == 0
    assert participant.rank is None
    assert participant.started_at is None
    assert participant.left_at is None
    assert participant.locked_at is None
    assert participant.lock_reason == ""
    assert participant.violation_count == 0
    assert participant.submit_reason == ""
    assert ContestActivity.objects.filter(
        contest=contest,
        user=teacher,
        action_type="reset_exam_record",
    ).exists()


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
    assert response.data["attendance_status"]["checkInStatus"] == "event_created"
    assert event.metadata["photo_required"] is True


@pytest.mark.django_db
def test_teacher_assisted_check_in_rejects_completed_check_in() -> None:
    api_client = APIClient()
    teacher = make_user("attendance_assist_repeat_teacher", role="teacher")
    student = make_user("attendance_assist_repeat_student")
    contest = make_contest(owner=teacher)
    ContestParticipant.objects.create(contest=contest, user=student)
    event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_in",
        metadata={
            "attendance_purpose": "check_in",
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
        },
    )
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="attendance-assisted-repeat.webp",
        client_captured_at_ms=1,
    )
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

    assert response.status_code == 409
    assert response.data["code"] == "attendance_check_in_already_completed"
    assert (
        ExamEvent.objects.filter(
            contest=contest,
            user=student,
            event_type="attendance_check_in",
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_teacher_assisted_check_in_requires_uploaded_evidence_to_be_ready() -> None:
    teacher = make_user("attendance_assist_ready_teacher", role="teacher")
    student = make_user("attendance_assist_ready_student")
    contest = make_contest(owner=teacher)
    participant = ContestParticipant.objects.create(contest=contest, user=student)
    event = ExamEvent.objects.create(
        contest=contest,
        user=student,
        event_type="attendance_check_in",
        metadata={
            "attendance_purpose": "check_in",
            "attendance_mode": "teacher_assisted",
            "assisted_by_user_id": teacher.id,
            "source_module": "attendance",
            "photo_required": True,
            "required_photo_kinds": ["room"],
        },
    )

    assert build_attendance_status(contest, participant)["checkInStatus"] == "event_created"

    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
        object_key="teacher-assisted.webp",
        client_captured_at_ms=1,
    )

    assert build_attendance_status(contest, participant)["checkInStatus"] == "teacher_assisted"
