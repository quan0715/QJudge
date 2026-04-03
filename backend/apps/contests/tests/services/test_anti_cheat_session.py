from __future__ import annotations

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.services.anti_cheat_session import (
    _exam_allowed_jti_key,
    is_access_token_allowed,
    set_exam_allowed_jti,
)
from apps.users.models import User


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="acs-teacher",
        email="acs-teacher@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="acs-student",
        email="acs-student@example.com",
        password="testpass123",
        role="student",
    )


@pytest.fixture
def published_exam(teacher: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Anti Cheat Session Contest",
        owner=teacher,
        status="published",
        visibility="private",
        start_time=now - timedelta(minutes=30),
        end_time=now + timedelta(minutes=30),
        contest_type="paper_exam",
        cheat_detection_enabled=True,
    )


@pytest.mark.django_db
def test_stale_exam_jti_pin_is_auto_cleared_when_exam_lock_not_active(
    student: User,
    published_exam: Contest,
) -> None:
    set_exam_allowed_jti(student.id, published_exam.id, "pinned-jti")

    # Participant is not in an active exam lock state; mismatched token should
    # be allowed and stale key should be removed to avoid re-login loops.
    assert is_access_token_allowed(student.id, "new-jti") is True
    assert cache.get(_exam_allowed_jti_key(student.id, published_exam.id)) is None


@pytest.mark.django_db
def test_exam_jti_pin_is_enforced_during_active_exam_lock(
    student: User,
    published_exam: Contest,
) -> None:
    ContestParticipant.objects.create(
        contest=published_exam,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
    )
    set_exam_allowed_jti(student.id, published_exam.id, "pinned-jti")

    assert is_access_token_allowed(student.id, "other-jti") is False
    assert cache.get(_exam_allowed_jti_key(student.id, published_exam.id)) == "pinned-jti"
