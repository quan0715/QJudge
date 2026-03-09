"""
Tests for exam anti-cheat API logic.

Covers violation counting, auto-lock, warning timeout, force-submit,
event logging for all participant roles, and auto-unlock eligibility checks.
"""
from datetime import timedelta
from unittest.mock import patch

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvidenceJob,
    ExamEvidenceVideo,
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
        self.co_owner = User.objects.create_user(
            username="coowner",
            email="coowner@test.com",
            password="pass",
            role="teacher",
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
        self.contest.admins.add(self.co_owner)

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

    def test_paused_violation_at_threshold_creates_pending_evidence_job(self):
        self.client.force_authenticate(user=self.student)
        self.participant.exam_status = ExamStatus.PAUSED
        self.participant.violation_count = self.contest.max_cheat_warnings - 1
        self.participant.save()

        with patch("apps.contests.services.exam_submission.enqueue_compile_video") as mock_compile:
            with self.captureOnCommitCallbacks(execute=True):
                resp = self.client.post(
                    self.events_url,
                    {
                        "event_type": "tab_hidden",
                        "metadata": {"upload_session_id": "session-paused-1"},
                    },
                    format="json",
                )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["exam_status"], ExamStatus.SUBMITTED)
        mock_compile.assert_not_called()

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)
        self.assertIn("Auto-submitted", self.participant.submit_reason)
        self.assertTrue(
            ExamEvidenceJob.objects.filter(
                contest=self.contest,
                participant=self.participant,
                upload_session_id="session-paused-1",
            ).exists()
        )

    def test_locked_violation_auto_submits_and_creates_pending_job(self):
        self.client.force_authenticate(user=self.student)
        self.participant.exam_status = ExamStatus.LOCKED
        self.participant.violation_count = self.contest.max_cheat_warnings
        self.participant.locked_at = timezone.now()
        self.participant.save()

        with patch("apps.contests.services.exam_submission.enqueue_compile_video") as mock_compile:
            with self.captureOnCommitCallbacks(execute=True):
                resp = self.client.post(self.events_url, {"event_type": "tab_hidden"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["exam_status"], ExamStatus.SUBMITTED)
        mock_compile.assert_not_called()

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)
        self.assertIn("Auto-submitted", self.participant.submit_reason)
        self.assertTrue(
            ExamEvidenceJob.objects.filter(
                contest=self.contest,
                participant=self.participant,
                upload_session_id="default",
            ).exists()
        )

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
    # 3b. capture_upload_degraded should be informational only
    # ------------------------------------------------------------------
    def test_capture_upload_degraded_does_not_increase_violation_or_lock(self):
        self.client.force_authenticate(user=self.student)

        resp = self.client.post(
            self.events_url,
            {"event_type": "capture_upload_degraded"},
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["violation_count"], 0)
        self.assertFalse(resp.data["locked"])

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.violation_count, 0)
        self.assertEqual(self.participant.exam_status, ExamStatus.IN_PROGRESS)
        self.assertTrue(
            ExamEvent.objects.filter(
                contest=self.contest,
                user=self.student,
                event_type="capture_upload_degraded",
            ).exists()
        )

    def test_exam_lifecycle_events_accept_forced_capture_metadata(self):
        self.client.force_authenticate(user=self.student)
        payload = {
            "event_type": "exam_entered",
            "metadata": {
                "forced_capture_requested": True,
                "forced_capture_reason": "exam_entered:paper_exam_answering",
                "forced_capture_result": "uploaded",
                "forced_capture_uploaded": True,
                "forced_capture_seq": 9,
                "upload_session_id": "session-entered-1",
            },
        }

        response = self.client.post(self.events_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.violation_count, 0)
        self.assertEqual(self.participant.exam_status, ExamStatus.IN_PROGRESS)
        event = ExamEvent.objects.get(
            contest=self.contest,
            user=self.student,
            event_type="exam_entered",
        )
        self.assertEqual(event.metadata["forced_capture_result"], "uploaded")
        self.assertEqual(event.metadata["upload_session_id"], "session-entered-1")

    def test_screen_share_stopped_in_terminating_phase_does_not_lock(self):
        self.client.force_authenticate(user=self.student)

        resp = self.client.post(
            self.events_url,
            {
                "event_type": "screen_share_stopped",
                "metadata": {
                    "phase": "TERMINATING",
                    "event_idempotency_key": "term-1",
                },
            },
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get("decision"), "terminal_guard")
        self.assertFalse(resp.data["locked"])

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.IN_PROGRESS)
        self.assertEqual(self.participant.violation_count, 0)

    def test_duplicate_event_idempotency_key_counts_once(self):
        self.client.force_authenticate(user=self.student)
        payload = {
            "event_type": "tab_hidden",
            "metadata": {"event_idempotency_key": "same-key-1"},
        }

        first = self.client.post(self.events_url, payload, format="json")
        second = self.client.post(self.events_url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data.get("decision"), "dedupe_hit")
        self.assertTrue(second.data.get("dedupe_hit"))

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.violation_count, 1)
        self.assertEqual(
            ExamEvent.objects.filter(
                contest=self.contest,
                user=self.student,
                event_type="tab_hidden",
            ).count(),
            1,
        )

    def test_submitted_status_event_is_logged_without_escalation(self):
        self.client.force_authenticate(user=self.student)
        self.participant.exam_status = ExamStatus.SUBMITTED
        self.participant.violation_count = 2
        self.participant.save(update_fields=["exam_status", "violation_count"])

        resp = self.client.post(
            self.events_url,
            {
                "event_type": "warning_timeout",
                "metadata": {
                    "phase": "TERMINAL",
                    "event_idempotency_key": "submitted-1",
                },
            },
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get("decision"), "terminal_guard")
        self.assertEqual(resp.data["exam_status"], ExamStatus.SUBMITTED)

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)
        self.assertEqual(self.participant.violation_count, 2)
        self.assertTrue(
            ExamEvent.objects.filter(
                contest=self.contest,
                user=self.student,
                event_type="warning_timeout",
            ).exists()
        )

    # ------------------------------------------------------------------
    # 4. lock_reason is set by server (client lock_reason is ignored)
    # ------------------------------------------------------------------
    def test_lock_reason_set_by_server(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(
            self.events_url,
            {
                "event_type": "warning_timeout",
                "lock_reason": "Student opened DevTools",  # should be ignored
            },
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        # Server sets lock_reason based on event_type, not client input
        self.assertEqual(
            self.participant.lock_reason,
            "Warning timeout: student did not acknowledge warning within 30 seconds",
        )

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

    def test_videos_lists_pending_job_for_submitted_participant(self):
        self.client.force_authenticate(user=self.student)
        end_url = reverse("contests:contest-exam-end-exam", args=[self.contest.id])
        response = self.client.post(
            end_url,
            {"upload_session_id": "session-review-1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.teacher)
        videos_url = reverse("contests:contest-exam-videos", args=[self.contest.id])
        response = self.client.get(videos_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["has_video"], False)
        self.assertEqual(response.data[0]["upload_session_id"], "session-review-1")
        self.assertEqual(response.data[0]["job_status"], "pending")

    def test_end_exam_never_auto_enqueues_video_compile(self):
        self.client.force_authenticate(user=self.student)
        end_url = reverse("contests:contest-exam-end-exam", args=[self.contest.id])

        with patch("apps.contests.services.exam_submission.enqueue_compile_video") as mock_compile:
            response = self.client.post(
                end_url,
                {"upload_session_id": "session-manual-only-1"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_compile.assert_not_called()
        self.assertTrue(
            ExamEvidenceJob.objects.filter(
                contest=self.contest,
                participant=self.participant,
                upload_session_id="session-manual-only-1",
            ).exists()
        )

    def test_videos_get_does_not_create_missing_jobs(self):
        self.client.force_authenticate(user=self.teacher)
        videos_url = reverse("contests:contest-exam-videos", args=[self.contest.id])

        response = self.client.get(videos_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])
        self.assertEqual(ExamEvidenceJob.objects.count(), 0)

    def test_video_compile_uses_requested_session(self):
        ExamEvidenceJob.objects.create(
            contest=self.contest,
            participant=self.participant,
            upload_session_id="session-manual-1",
        )

        self.client.force_authenticate(user=self.teacher)
        compile_url = reverse("contests:contest-exam-video-compile", args=[self.contest.id])
        with patch("apps.contests.views.exam_evidence.enqueue_compile_video") as mock_compile:
            response = self.client.post(
                compile_url,
                {
                    "targets": [
                        {
                            "user_id": self.student.id,
                            "upload_session_id": "session-manual-1",
                        }
                    ]
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_compile.assert_called_once_with(self.participant.id, "session-manual-1")

    def test_owner_can_delete_exam_video_and_pending_job(self):
        job = ExamEvidenceJob.objects.create(
            contest=self.contest,
            participant=self.participant,
            upload_session_id="session-delete-1",
        )
        video = ExamEvidenceVideo.objects.create(
            contest=self.contest,
            participant=self.participant,
            upload_session_id="session-delete-1",
            bucket="anticheat-videos",
            object_key="contest_1/user_1/session_delete_1.mp4",
            duration_seconds=10,
            frame_count=10,
            size_bytes=1234,
        )

        paginator = type(
            "Paginator",
            (),
            {
                "paginate": lambda self, **kwargs: [
                    {"Contents": [{"Key": "contest_1/user_1/session_session-delete-1/frame_000001.webp"}]}
                ]
            },
        )()

        self.client.force_authenticate(user=self.teacher)
        delete_url = reverse("contests:contest-exam-video-delete", args=[self.contest.id])
        with patch("apps.contests.views.exam_evidence.get_s3_client") as mock_get_client:
            mock_client = mock_get_client.return_value
            mock_client.get_paginator.return_value = paginator
            response = self.client.post(
                delete_url,
                {
                    "targets": [
                        {
                            "user_id": self.student.id,
                            "upload_session_id": "session-delete-1",
                        }
                    ]
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["deleted"]), 1)
        self.assertEqual(response.data["blocked"], [])
        mock_client.delete_object.assert_called_once_with(
            Bucket=video.bucket,
            Key=video.object_key,
        )
        mock_client.delete_objects.assert_called()
        self.assertFalse(ExamEvidenceJob.objects.filter(id=job.id).exists())
        self.assertFalse(ExamEvidenceVideo.objects.filter(id=video.id).exists())

    def test_co_owner_cannot_delete_exam_video(self):
        ExamEvidenceJob.objects.create(
            contest=self.contest,
            participant=self.participant,
            upload_session_id="session-delete-blocked",
        )

        self.client.force_authenticate(user=self.co_owner)
        delete_url = reverse("contests:contest-exam-video-delete", args=[self.contest.id])
        response = self.client.post(
            delete_url,
            {
                "targets": [
                    {
                        "user_id": self.student.id,
                        "upload_session_id": "session-delete-blocked",
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(
            ExamEvidenceJob.objects.filter(
                contest=self.contest,
                participant=self.participant,
                upload_session_id="session-delete-blocked",
            ).exists()
        )
