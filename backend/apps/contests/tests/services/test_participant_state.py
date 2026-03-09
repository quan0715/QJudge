from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.contests.models import Contest, ContestActivity, ContestParticipant, ExamStatus
from apps.contests.services.participant_state import (
    admin_update_participant,
    get_auto_unlock_at,
    reconcile_participant_on_contest_access,
    reopen_participant_exam,
)
from apps.users.models import User


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="participant-state-teacher",
        email="participant-state-teacher@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="participant-state-student",
        email="participant-state-student@example.com",
        password="testpass123",
        role="student",
    )


@pytest.fixture
def contest(teacher: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Participant State Contest",
        owner=teacher,
        status="published",
        visibility="public",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        allow_auto_unlock=True,
        auto_unlock_minutes=1,
        cheat_detection_enabled=True,
    )


@pytest.mark.django_db
def test_reconcile_participant_auto_unlocks_when_timeout_elapsed(
    contest: Contest,
    student: User,
) -> None:
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.LOCKED,
        locked_at=timezone.now() - timedelta(minutes=3),
        violation_count=2,
        lock_reason="focus lost",
    )

    unlock_at = get_auto_unlock_at(participant)
    assert unlock_at is not None

    reconcile_participant_on_contest_access(participant, activity_user=student)

    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.PAUSED
    assert participant.locked_at is None
    assert participant.violation_count == 0
    assert participant.lock_reason == ""
    assert ContestActivity.objects.filter(
        contest=contest,
        user=student,
        action_type="unlock_user",
        details="Auto-unlocked by system",
    ).exists()


@pytest.mark.django_db
def test_reconcile_participant_auto_submits_after_contest_end(
    contest: Contest,
    student: User,
) -> None:
    contest.end_time = timezone.now() - timedelta(minutes=5)
    contest.save(update_fields=["end_time"])

    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
    )

    reconcile_participant_on_contest_access(participant, activity_user=student)

    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.SUBMITTED
    assert participant.left_at is not None
    assert participant.submit_reason == "Auto-submitted: contest ended"
    assert ContestActivity.objects.filter(
        contest=contest,
        user=student,
        action_type="auto_submit",
        details="Auto-submitted: contest ended",
    ).exists()


@pytest.mark.django_db
def test_admin_update_participant_clears_lock_metadata_on_transition(
    contest: Contest,
    teacher: User,
    student: User,
) -> None:
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.LOCKED,
        locked_at=timezone.now() - timedelta(minutes=1),
        violation_count=3,
        lock_reason="tab switch",
    )

    admin_update_participant(
        participant,
        exam_status=ExamStatus.IN_PROGRESS,
        activity_user=teacher,
        activity_details="Admin moved to in_progress",
    )

    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.IN_PROGRESS
    assert participant.locked_at is None
    assert participant.violation_count == 0
    assert participant.lock_reason == ""
    assert ContestActivity.objects.filter(
        contest=contest,
        user=teacher,
        action_type="update_participant",
        details="Admin moved to in_progress",
    ).exists()


@pytest.mark.django_db
def test_reopen_participant_exam_clears_submit_reason_and_lock_metadata(
    contest: Contest,
    teacher: User,
    student: User,
) -> None:
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
        submit_reason="Student submitted",
        locked_at=timezone.now() - timedelta(minutes=5),
        violation_count=1,
        lock_reason="old lock",
    )

    reopen_participant_exam(
        participant,
        activity_user=teacher,
        activity_details="Reopened for student",
    )

    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.PAUSED
    assert participant.submit_reason == ""
    assert participant.locked_at is None
    assert participant.violation_count == 0
    assert participant.lock_reason == ""
    assert ContestActivity.objects.filter(
        contest=contest,
        user=teacher,
        action_type="reopen_exam",
        details="Reopened for student",
    ).exists()
