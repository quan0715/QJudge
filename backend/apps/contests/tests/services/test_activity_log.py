from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.contests.models import Contest, ContestActivity
from apps.contests.services.activity_log import log_contest_activity
from apps.users.models import User


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="activity-log-teacher",
        email="activity-log-teacher@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def contest(teacher: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Activity Log Contest",
        owner=teacher,
        status="published",
        visibility="public",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )


@pytest.mark.django_db
def test_log_contest_activity_creates_activity_row(
    contest: Contest,
    teacher: User,
) -> None:
    activity = log_contest_activity(
        contest=contest,
        user=teacher,
        action_type="update_contest",
        details="Updated contest settings",
    )

    assert activity is not None
    assert activity.contest == contest
    assert activity.user == teacher
    assert activity.action_type == "update_contest"
    assert activity.details == "Updated contest settings"
    assert ContestActivity.objects.filter(
        contest=contest,
        user=teacher,
        action_type="update_contest",
        details="Updated contest settings",
    ).exists()
