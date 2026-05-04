from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIRequestFactory

from apps.contests.models import Contest, ContestParticipant, ExamEvent, ExamStatus
from apps.contests.services.anti_cheat_session import (
    active_session_key,
)
from apps.contests.services.exam_validation import validate_exam_operation
from apps.users.models import User


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="teacher-service-boundary",
        email="teacher-service-boundary@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="student-service-boundary",
        email="student-service-boundary@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def published_contest(teacher: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Published Service Boundary Contest",
        owner=teacher,
        status="published",
        visibility="public",
        start_time=now - timedelta(minutes=5),
        end_time=now + timedelta(hours=1),
        contest_type="paper_exam",
    )


@pytest.mark.django_db
def test_validate_exam_operation_raises_drf_exceptions_instead_of_returning_response(
    teacher: User,
    student: User,
):
    contest = Contest.objects.create(
        name="Draft Service Boundary Contest",
        owner=teacher,
        status="draft",
        visibility="private",
        contest_type="paper_exam",
    )

    with pytest.raises(PermissionDenied, match="Contest is not published"):
        validate_exam_operation(contest, student, allow_admin_bypass=False)


@pytest.mark.django_db
def test_validate_exam_operation_returns_participant_on_success_and_raises_validation_error(
    student: User,
    published_contest: Contest,
):
    with pytest.raises(ValidationError, match="Not registered"):
        validate_exam_operation(published_contest, student, allow_admin_bypass=False)

    participant = ContestParticipant.objects.create(
        contest=published_contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=timezone.now(),
    )

    assert validate_exam_operation(
        published_contest,
        student,
        require_in_progress=True,
        allow_admin_bypass=False,
    ) == participant


@pytest.mark.django_db
def test_device_conflict_service_returns_payload_not_response(
    student: User,
    published_contest: Contest,
):
    from apps.contests.services import anti_cheat_session

    assert hasattr(anti_cheat_session, "build_device_conflict_payload")
    build_device_conflict_payload = anti_cheat_session.build_device_conflict_payload

    participant = ContestParticipant.objects.create(
        contest=published_contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=timezone.now(),
    )
    cache.set(
        active_session_key(published_contest.id, student.id),
        {"device_id": "existing-device"},
        timeout=60,
    )
    request = APIRequestFactory().get("/", HTTP_X_DEVICE_ID="incoming-device")

    payload = build_device_conflict_payload(published_contest, participant, request)

    assert payload == {
        "code": "EXAM_ACTIVE_OTHER_DEVICE",
        "message": "Another device is currently active for this exam session.",
        "active_exam": {
            "contest_id": published_contest.id,
            "contest_name": published_contest.name,
            "exam_status": ExamStatus.IN_PROGRESS,
            "started_at": participant.started_at,
        },
    }
    assert not hasattr(payload, "status_code")
    assert ExamEvent.objects.filter(
        contest=published_contest,
        user=student,
        event_type="concurrent_login_detected",
        metadata__existing_device_id="existing-device",
        metadata__incoming_device_id="incoming-device",
    ).exists()
