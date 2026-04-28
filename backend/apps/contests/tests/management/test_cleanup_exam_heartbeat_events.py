from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.contests.models import Contest, ExamEvent
from apps.users.models import User


@pytest.fixture
def heartbeat_contest():
    owner = User.objects.create_user(
        username="heartbeat_cleanup_owner",
        email="heartbeat_cleanup_owner@example.com",
        password="testpass123",
        role="teacher",
    )
    student = User.objects.create_user(
        username="heartbeat_cleanup_student",
        email="heartbeat_cleanup_student@example.com",
        password="testpass123",
        role="student",
    )
    now = timezone.now()
    contest = Contest.objects.create(
        name="Heartbeat Cleanup Contest",
        owner=owner,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )
    return contest, student


@pytest.mark.django_db
def test_cleanup_exam_heartbeat_events_dry_run_keeps_rows(heartbeat_contest):
    contest, student = heartbeat_contest
    ExamEvent.objects.create(contest=contest, user=student, event_type="heartbeat")

    output = StringIO()
    call_command("cleanup_exam_heartbeat_events", stdout=output)

    assert "dry_run=True" in output.getvalue()
    assert "heartbeat_events=1" in output.getvalue()
    assert ExamEvent.objects.filter(event_type="heartbeat").count() == 1


@pytest.mark.django_db
def test_cleanup_exam_heartbeat_events_apply_deletes_only_heartbeat(heartbeat_contest):
    contest, student = heartbeat_contest
    ExamEvent.objects.create(contest=contest, user=student, event_type="heartbeat")
    ExamEvent.objects.create(contest=contest, user=student, event_type="heartbeat")
    ExamEvent.objects.create(contest=contest, user=student, event_type="heartbeat_timeout")
    ExamEvent.objects.create(contest=contest, user=student, event_type="tab_hidden")

    output = StringIO()
    call_command(
        "cleanup_exam_heartbeat_events",
        "--apply",
        "--batch-size=1",
        stdout=output,
    )

    assert "dry_run=False" in output.getvalue()
    assert "deleted=2" in output.getvalue()
    assert not ExamEvent.objects.filter(event_type="heartbeat").exists()
    assert ExamEvent.objects.filter(event_type="heartbeat_timeout").count() == 1
    assert ExamEvent.objects.filter(event_type="tab_hidden").count() == 1
