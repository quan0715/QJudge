"""
Tests for the check_heartbeat_timeout periodic task.
"""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamStatus,
)
from apps.contests.services.anti_cheat_session import (
    touch_heartbeat,
    get_last_heartbeat,
    clear_heartbeat,
    HEARTBEAT_TIMEOUT_SECONDS,
)

User = get_user_model()


def _make_active_exam(owner, student, **overrides):
    defaults = dict(
        name="HB Test",
        owner=owner,
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
        status="published",
        cheat_detection_enabled=True,
    )
    defaults.update(overrides)
    contest = Contest.objects.create(**defaults)
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=timezone.now() - timedelta(minutes=10),
    )
    return contest, participant


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class HeartbeatHelperTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_touch_and_get(self):
        touch_heartbeat(1, 42)
        val = get_last_heartbeat(1, 42)
        self.assertIsNotNone(val)

    def test_clear(self):
        touch_heartbeat(1, 42)
        clear_heartbeat(1, 42)
        self.assertIsNone(get_last_heartbeat(1, 42))

    def test_get_nonexistent_returns_none(self):
        self.assertIsNone(get_last_heartbeat(999, 999))


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class CheckHeartbeatTimeoutTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(
            username="hb_owner", email="hb_owner@test.com", password="pw", role="teacher"
        )
        self.student = User.objects.create_user(
            username="hb_student", email="hb_student@test.com", password="pw"
        )

    def test_no_heartbeat_and_started_long_ago_locks(self):
        """Student who started >60s ago with no heartbeat should be locked."""
        from apps.contests.tasks import check_heartbeat_timeout

        contest, participant = _make_active_exam(self.owner, self.student)
        participant.started_at = timezone.now() - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS + 30)
        participant.save(update_fields=["started_at"])

        check_heartbeat_timeout()

        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.LOCKED)
        self.assertIn("Heartbeat timeout", participant.lock_reason)

        # Event created
        self.assertTrue(
            ExamEvent.objects.filter(
                contest=contest, user=self.student, event_type="heartbeat_timeout"
            ).exists()
        )

    def test_recent_heartbeat_not_locked(self):
        """Student with a fresh heartbeat should not be locked."""
        from apps.contests.tasks import check_heartbeat_timeout

        contest, participant = _make_active_exam(self.owner, self.student)
        touch_heartbeat(contest.id, self.student.id)

        check_heartbeat_timeout()

        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.IN_PROGRESS)

    def test_stale_heartbeat_locks(self):
        """Student whose last heartbeat is >60s old should be locked."""
        from apps.contests.tasks import check_heartbeat_timeout

        contest, participant = _make_active_exam(self.owner, self.student)

        # Write a stale heartbeat
        stale_time = (timezone.now() - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS + 10)).isoformat()
        cache.set(
            f"exam:heartbeat:{contest.id}:{self.student.id}",
            stale_time,
            timeout=300,
        )

        check_heartbeat_timeout()

        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.LOCKED)

    def test_already_locked_not_double_locked(self):
        """Already-locked participant should not get a second heartbeat_timeout event."""
        from apps.contests.tasks import check_heartbeat_timeout

        contest, participant = _make_active_exam(self.owner, self.student)
        participant.exam_status = ExamStatus.LOCKED
        participant.locked_at = timezone.now()
        participant.save(update_fields=["exam_status", "locked_at"])

        check_heartbeat_timeout()

        # Task only targets IN_PROGRESS participants
        self.assertFalse(
            ExamEvent.objects.filter(
                contest=contest, user=self.student, event_type="heartbeat_timeout"
            ).exists()
        )

    def test_submitted_not_checked(self):
        """Submitted participant should not be checked."""
        from apps.contests.tasks import check_heartbeat_timeout

        contest, participant = _make_active_exam(self.owner, self.student)
        participant.exam_status = ExamStatus.SUBMITTED
        participant.save(update_fields=["exam_status"])

        check_heartbeat_timeout()

        self.assertFalse(
            ExamEvent.objects.filter(
                contest=contest, user=self.student, event_type="heartbeat_timeout"
            ).exists()
        )

    def test_recently_started_without_heartbeat_not_locked(self):
        """Student who just started (<60s ago) but hasn't sent heartbeat yet should be safe."""
        from apps.contests.tasks import check_heartbeat_timeout

        contest, participant = _make_active_exam(self.owner, self.student)
        participant.started_at = timezone.now() - timedelta(seconds=10)
        participant.save(update_fields=["started_at"])

        check_heartbeat_timeout()

        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.IN_PROGRESS)

    def test_cheat_detection_disabled_not_checked(self):
        """Contests without cheat detection should be skipped."""
        from apps.contests.tasks import check_heartbeat_timeout

        contest, participant = _make_active_exam(
            self.owner, self.student, cheat_detection_enabled=False
        )

        check_heartbeat_timeout()

        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.IN_PROGRESS)

    def test_idempotency_guard_prevents_double_lock(self):
        """
        Two concurrent check_heartbeat_timeout calls should not create
        duplicate heartbeat_timeout events for the same participant.
        """
        from apps.contests.tasks import check_heartbeat_timeout

        contest, participant = _make_active_exam(self.owner, self.student)
        participant.started_at = timezone.now() - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS + 30)
        participant.save(update_fields=["started_at"])

        check_heartbeat_timeout()
        # Second call — participant is now LOCKED, so query won't find them
        check_heartbeat_timeout()

        events = ExamEvent.objects.filter(
            contest=contest, user=self.student, event_type="heartbeat_timeout"
        )
        self.assertEqual(events.count(), 1)
