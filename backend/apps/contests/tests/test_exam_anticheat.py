"""
Tests for exam anti-cheat API logic.

Covers violation counting, auto-lock, warning timeout, force-submit,
event logging for all participant roles, and auto-unlock eligibility checks.
"""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamStatus,
    ContestActivity,
)
from apps.contests.tasks import (
    force_submit_locked_participant,
    check_force_submit_locked,
    FORCE_SUBMIT_LOCKED_SECONDS,
)

User = get_user_model()


class ExamAntiCheatTests(APITestCase):
    """API-level tests for exam anti-cheat event logging and locking."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher",
            email="teacher@test.com",
            password="pass",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="student",
            email="student@test.com",
            password="pass",
            role="student",
        )

        now = timezone.now()
        self.contest = Contest.objects.create(
            name="Anti-Cheat Test Contest",
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
            visibility="public",
            status="published",
            cheat_detection_enabled=True,
            max_cheat_warnings=3,
            allow_auto_unlock=False,
        )

        self.participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now,
        )

        self.events_url = reverse(
            "contests:contest-exam-events", args=[self.contest.id]
        )

    # ------------------------------------------------------------------
    # 1. Single violation increments count, does not lock
    # ------------------------------------------------------------------
    def test_violation_increments_count(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(self.events_url, {"event_type": "tab_hidden"})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["violation_count"], 1)
        self.assertFalse(resp.data["locked"])

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.violation_count, 1)
        self.assertEqual(self.participant.exam_status, ExamStatus.IN_PROGRESS)

    # ------------------------------------------------------------------
    # 2. Reaching max_cheat_warnings locks participant
    # ------------------------------------------------------------------
    def test_violation_locks_at_threshold(self):
        self.client.force_authenticate(user=self.student)

        for i in range(3):
            resp = self.client.post(self.events_url, {"event_type": "tab_hidden"})
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Third violation should trigger lock
        self.assertTrue(resp.data["locked"])
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.LOCKED)
        self.assertEqual(self.participant.violation_count, 3)

    # ------------------------------------------------------------------
    # 3. warning_timeout forces lock regardless of count
    # ------------------------------------------------------------------
    def test_warning_timeout_forces_lock(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(self.events_url, {"event_type": "warning_timeout"})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["locked"])

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.LOCKED)
        self.assertIn("Warning timeout", self.participant.lock_reason)

    # ------------------------------------------------------------------
    # 4. Custom lock_reason is stored on participant
    # ------------------------------------------------------------------
    def test_custom_lock_reason(self):
        self.client.force_authenticate(user=self.student)
        custom_reason = "Student opened DevTools"
        resp = self.client.post(
            self.events_url,
            {
                "event_type": "warning_timeout",
                "lock_reason": custom_reason,
            },
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.lock_reason, custom_reason)

    # ------------------------------------------------------------------
    # 5. Owner/teacher participant should also be logged (no bypass)
    # ------------------------------------------------------------------
    def test_owner_participant_event_is_logged(self):
        ContestParticipant.objects.create(
            contest=self.contest,
            user=self.teacher,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.teacher)
        resp = self.client.post(self.events_url, {"event_type": "tab_hidden"})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("violation_count", resp.data)
        self.assertFalse(resp.data.get("bypass", False))

        self.assertEqual(
            ExamEvent.objects.filter(
                contest=self.contest,
                user=self.teacher,
                event_type="tab_hidden",
            ).count(),
            1,
        )

    # ------------------------------------------------------------------
    # 6. auto_unlock_at is returned when allow_auto_unlock is enabled
    # ------------------------------------------------------------------
    def test_auto_unlock_at_in_response(self):
        self.contest.allow_auto_unlock = True
        self.contest.auto_unlock_minutes = 5
        self.contest.save()

        self.client.force_authenticate(user=self.student)
        # Trigger lock via warning_timeout
        resp = self.client.post(self.events_url, {"event_type": "warning_timeout"})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["locked"])
        self.assertIsNotNone(resp.data.get("auto_unlock_at"))

    # ------------------------------------------------------------------
    # 7. force_submit_locked_participant transitions to SUBMITTED
    # ------------------------------------------------------------------
    def test_force_submit_locked_task(self):
        self.participant.exam_status = ExamStatus.LOCKED
        self.participant.locked_at = timezone.now() - timedelta(minutes=5)
        self.participant.lock_reason = "test lock"
        self.participant.save()

        result = force_submit_locked_participant(self.participant.id)

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)
        self.assertIsNotNone(self.participant.left_at)

        # ExamEvent with force_submit_locked should exist
        self.assertTrue(
            ExamEvent.objects.filter(
                contest=self.contest,
                user=self.student,
                event_type="force_submit_locked",
            ).exists()
        )

        # ContestActivity audit trail
        self.assertTrue(
            ContestActivity.objects.filter(
                contest=self.contest,
                user=self.student,
                action_type="auto_submit",
            ).exists()
        )

    # ------------------------------------------------------------------
    # 8. check_force_submit skips auto-unlock-eligible participants
    # ------------------------------------------------------------------
    def test_check_force_submit_skips_auto_unlock_eligible(self):
        self.contest.allow_auto_unlock = True
        self.contest.auto_unlock_minutes = 1  # 60s < 180s threshold
        self.contest.save()

        self.participant.exam_status = ExamStatus.LOCKED
        self.participant.locked_at = timezone.now() - timedelta(minutes=4)
        self.participant.save()

        result = check_force_submit_locked()

        # Participant should still be locked (skipped by force-submit)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.LOCKED)

    # ------------------------------------------------------------------
    # 9. check_force_submit processes eligible participant
    # ------------------------------------------------------------------
    def test_check_force_submit_processes_eligible(self):
        self.contest.allow_auto_unlock = False
        self.contest.save()

        self.participant.exam_status = ExamStatus.LOCKED
        self.participant.locked_at = timezone.now() - timedelta(minutes=4)
        self.participant.save()

        # With CELERY_TASK_ALWAYS_EAGER the .delay() inside check_force_submit_locked
        # runs synchronously, so the participant will be submitted after this call.
        check_force_submit_locked()

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)
