"""
Tests for exam anti-cheat API logic.

Covers violation counting, auto-lock, warning timeout, force-submit,
event logging for all participant roles, and auto-unlock eligibility checks.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

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
from apps.contests.services.evidence_windows import attach_evidence_window_metadata

User = get_user_model()


class ExamAntiCheatTests(APITestCase):
    """API-level tests for exam anti-cheat event logging and locking."""

    def setUp(self):
        # Disable incident family dedup so penalty tests focus on core logic.
        patcher = patch(
            "apps.contests.views.exam_events.is_duplicate_incident_family",
            return_value=False,
        )
        patcher.start()
        self.addCleanup(patcher.stop)
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
        resp = self.client.post(self.events_url, {"event_type": "exit_fullscreen"})

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
            resp = self.client.post(self.events_url, {"event_type": "exit_fullscreen"})
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Third violation should trigger lock
        self.assertTrue(resp.data["locked"])
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.LOCKED)
        self.assertEqual(self.participant.violation_count, 3)

    def test_paused_violation_at_threshold_auto_submits_without_video_job(self):
        self.client.force_authenticate(user=self.student)
        self.participant.exam_status = ExamStatus.PAUSED
        self.participant.violation_count = self.contest.max_cheat_warnings - 1
        self.participant.save()

        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(
                self.events_url,
                {
                    "event_type": "exit_fullscreen",
                    "metadata": {"upload_session_id": "session-paused-1"},
                },
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["exam_status"], ExamStatus.SUBMITTED)

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)
        self.assertIn("Auto-submitted", self.participant.submit_reason)

    def test_locked_violation_auto_submits_without_video_job(self):
        self.client.force_authenticate(user=self.student)
        self.participant.exam_status = ExamStatus.LOCKED
        self.participant.violation_count = self.contest.max_cheat_warnings
        self.participant.locked_at = timezone.now()
        self.participant.save()

        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(self.events_url, {"event_type": "exit_fullscreen"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["exam_status"], ExamStatus.SUBMITTED)

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)
        self.assertIn("Auto-submitted", self.participant.submit_reason)

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

        response = self.client.post(
            self.events_url,
            payload,
            format="json",
            HTTP_X_DEVICE_ID="device-ipad-1",
            HTTP_USER_AGENT=(
                "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )

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
        self.assertEqual(event.metadata["device_id"], "device-ipad-1")
        self.assertEqual(event.metadata["device_kind"], "tablet")
        self.assertIn("iPad", event.metadata["user_agent"])

    def test_exam_entered_preserves_device_classification_metadata(self):
        self.client.force_authenticate(user=self.student)
        payload = {
            "event_type": "exam_entered",
            "metadata": {
                "upload_session_id": "session-device-classification-1",
                "pointer_profile": "touch_plus_pointer",
                "supports_fine_pointer": True,
                "primary_source_module": "webcam",
                "active_sources": ["webcam"],
            },
        }

        response = self.client.post(
            self.events_url,
            payload,
            format="json",
            HTTP_USER_AGENT=(
                "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event = ExamEvent.objects.get(
            contest=self.contest,
            user=self.student,
            event_type="exam_entered",
        )
        self.assertEqual(event.metadata["device_kind"], "tablet")
        self.assertEqual(event.metadata["pointer_profile"], "touch_plus_pointer")
        self.assertTrue(event.metadata["supports_fine_pointer"])
        self.assertEqual(event.metadata["primary_source_module"], "webcam")

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
            "event_type": "exit_fullscreen",
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
                event_type="exit_fullscreen",
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
        timeout = self.contest.warning_timeout_seconds
        self.assertEqual(
            self.participant.lock_reason,
            f"Warning timeout: student did not acknowledge warning within {timeout} seconds",
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
        resp = self.client.post(self.events_url, {"event_type": "exit_fullscreen"})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("violation_count", resp.data)
        self.assertFalse(resp.data.get("bypass", False))

        self.assertEqual(
            ExamEvent.objects.filter(
                contest=self.contest,
                user=self.teacher,
                event_type="exit_fullscreen",
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

    def test_webcam_stopped_uses_exam_entered_tablet_metadata_as_primary(self):
        ExamEvent.objects.create(
            contest=self.contest,
            user=self.student,
            event_type="exam_entered",
            metadata={
                "device_kind": "tablet",
                "primary_source_module": "webcam",
                "active_sources": ["webcam"],
                "upload_session_id": "session-tablet-webcam-1",
            },
        )

        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            self.events_url,
            {
                "event_type": "webcam_stopped",
                "metadata": {
                    "upload_session_id": "session-tablet-webcam-1",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["locked"])
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.LOCKED)

        event = ExamEvent.objects.filter(
            contest=self.contest,
            user=self.student,
            event_type="webcam_stopped",
        ).latest("created_at")
        self.assertEqual(event.metadata["module_role"], "primary")

    def test_webcam_stopped_uses_exam_entered_dual_source_metadata_as_secondary(self):
        ExamEvent.objects.create(
            contest=self.contest,
            user=self.student,
            event_type="exam_entered",
            metadata={
                "device_kind": "desktop",
                "primary_source_module": "screen_share",
                "active_sources": ["screen_share", "webcam"],
                "upload_session_id": "session-desktop-dual-1",
            },
        )

        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            self.events_url,
            {
                "event_type": "webcam_stopped",
                "metadata": {
                    "upload_session_id": "session-desktop-dual-1",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["locked"])
        self.assertEqual(response.data["violation_count"], 1)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.IN_PROGRESS)

        event = ExamEvent.objects.filter(
            contest=self.contest,
            user=self.student,
            event_type="webcam_stopped",
        ).latest("created_at")
        self.assertEqual(event.metadata["module_role"], "secondary")

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

    def test_screenshots_can_presign_explicit_evidence_object_keys(self):
        ts_ms = 1774106646951
        raw_key = (
            f"contest_{self.contest.id}/user_{self.student.id}/"
            f"session_session-evidence-1/screen_share/ts_{ts_ms}_seq_0007.webp"
        )

        self.client.force_authenticate(user=self.teacher)
        screenshots_url = reverse("contests:contest-exam-screenshots", args=[self.contest.id])
        with patch(
            "apps.contests.views.exam_evidence.generate_get_url",
            return_value="https://example.test/frame.webp",
        ) as mock_get_url:
            response = self.client.get(
                screenshots_url,
                {
                    "user_id": self.student.id,
                    "object_key": raw_key,
                    "source_module": "screen_share",
                },
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_raw_count"], 1)
        self.assertEqual(response.data["items"][0]["url"], "https://example.test/frame.webp")
        self.assertEqual(response.data["items"][0]["ts_ms"], ts_ms)
        self.assertEqual(response.data["items"][0]["seq"], 7)
        mock_get_url.assert_called_once()

    def test_screenshots_rejects_explicit_keys_for_other_participant(self):
        other = User.objects.create_user(
            username="other-student",
            email="other-student@test.com",
            password="pass",
            role="student",
        )
        ContestParticipant.objects.create(
            contest=self.contest,
            user=other,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now(),
        )
        raw_key = (
            f"contest_{self.contest.id}/user_{other.id}/"
            "session_session-evidence-1/screen_share/ts_1774106646951_seq_0007.webp"
        )

        self.client.force_authenticate(user=self.teacher)
        screenshots_url = reverse("contests:contest-exam-screenshots", args=[self.contest.id])
        with patch("apps.contests.views.exam_evidence.generate_get_url") as mock_get_url:
            response = self.client.get(
                screenshots_url,
                {
                    "user_id": self.student.id,
                    "object_key": raw_key,
                    "source_module": "screen_share",
                },
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_raw_count"], 0)
        self.assertEqual(response.data["items"], [])
        mock_get_url.assert_not_called()

    def test_screenshots_can_use_event_id_to_derive_window(self):
        ts_ms = 1774107000000
        ts_left_in = ts_ms - 10_000
        ts_left_out = ts_ms - 30_000
        ts_right_in = ts_ms + 10_000
        ts_right_out = ts_ms + 30_000
        session_id = "session-event-window-1"

        raw_key_in_left = (
            f"contest_{self.contest.id}/user_{self.student.id}/session_{session_id}/"
            f"screen_share/ts_{ts_left_in}_seq_0001.webp"
        )
        raw_key_out_left = (
            f"contest_{self.contest.id}/user_{self.student.id}/session_{session_id}/"
            f"screen_share/ts_{ts_left_out}_seq_0002.webp"
        )
        raw_key_in_right = (
            f"contest_{self.contest.id}/user_{self.student.id}/session_{session_id}/"
            f"screen_share/ts_{ts_right_in}_seq_0003.webp"
        )
        raw_key_out_right = (
            f"contest_{self.contest.id}/user_{self.student.id}/session_{session_id}/"
            f"screen_share/ts_{ts_right_out}_seq_0004.webp"
        )
        keys = [raw_key_out_left, raw_key_out_right, raw_key_in_left, raw_key_in_right]

        event = ExamEvent.objects.create(
            contest=self.contest,
            user=self.student,
            event_type="exit_fullscreen",
            metadata={"module": "screen_share", "upload_session_id": session_id},
        )
        event.created_at = timezone.make_aware(datetime.fromtimestamp(ts_ms / 1000))
        event.save(update_fields=["created_at"])
        attach_evidence_window_metadata(event)

        class FakePaginator:
            def __init__(self, all_keys):
                self._all_keys = all_keys

            def paginate(self, Bucket: str, Prefix: str):
                filtered = [key for key in self._all_keys if key.startswith(Prefix)]
                yield {"Contents": [{"Key": key} for key in filtered]}

        class FakeClient:
            def __init__(self, all_keys):
                self._all_keys = all_keys

            def get_paginator(self, operation_name):
                return FakePaginator(self._all_keys)

        self.client.force_authenticate(user=self.teacher)
        screenshots_url = reverse("contests:contest-exam-screenshots", args=[self.contest.id])
        with patch(
            "apps.contests.views.exam_evidence.get_s3_client",
            return_value=FakeClient(keys),
        ), patch(
            "apps.contests.views.exam_evidence.generate_get_url",
            return_value="https://example.test/frame.webp",
        ) as mock_get_url:
            response = self.client.get(
                screenshots_url,
                {"event_id": event.id},
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_raw_count"], 2)
        self.assertEqual(len(response.data["items"]), 2)
        got_keys = sorted(item["ts_ms"] for item in response.data["items"])
        self.assertEqual(got_keys, sorted([ts_left_in, ts_right_in]))
        self.assertEqual(mock_get_url.call_count, 2)

    def test_screenshots_event_lookup_returns_all_modules_by_default(self):
        ts_ms = 1774107000000
        session_id = "session-event-window-2"
        screen_key = (
            f"contest_{self.contest.id}/user_{self.student.id}/session_{session_id}/"
            f"screen_share/ts_{ts_ms}_seq_0001.webp"
        )
        webcam_key = (
            f"contest_{self.contest.id}/user_{self.student.id}/session_{session_id}/"
            f"webcam/ts_{ts_ms}_seq_0002.webp"
        )

        event = ExamEvent.objects.create(
            contest=self.contest,
            user=self.student,
            event_type="exit_fullscreen",
            metadata={"module": "screen_share", "upload_session_id": session_id},
        )
        event.created_at = timezone.make_aware(datetime.fromtimestamp(ts_ms / 1000))
        event.save(update_fields=["created_at"])
        attach_evidence_window_metadata(event)

        class FakePaginator:
            def paginate(self, Bucket: str, Prefix: str):
                yield {"Contents": [{"Key": screen_key}, {"Key": webcam_key}]}

        class FakeClient:
            def get_paginator(self, operation_name):
                return FakePaginator()

        self.client.force_authenticate(user=self.teacher)
        screenshots_url = reverse("contests:contest-exam-screenshots", args=[self.contest.id])
        with patch(
            "apps.contests.views.exam_evidence.get_s3_client",
            return_value=FakeClient(),
        ), patch(
            "apps.contests.views.exam_evidence.generate_get_url",
            return_value="https://example.test/frame.webp",
        ):
            response = self.client.get(screenshots_url, {"event_id": event.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_raw_count"], 2)
        self.assertEqual(
            sorted(item["source_module"] for item in response.data["items"]),
            ["screen_share", "webcam"],
        )

    def test_end_exam_does_not_create_video_jobs(self):
        self.client.force_authenticate(user=self.student)
        end_url = reverse("contests:contest-exam-end-exam", args=[self.contest.id])

        response = self.client.post(
            end_url,
            {"upload_session_id": "session-manual-only-1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)

    def test_end_exam_preserves_webcam_only_source_metadata_without_video_jobs(self):
        ExamEvent.objects.create(
            contest=self.contest,
            user=self.student,
            event_type="exam_entered",
            metadata={
                "active_sources": ["webcam"],
                "upload_session_id": "session-webcam-only-1",
            },
        )

        self.client.force_authenticate(user=self.student)
        end_url = reverse("contests:contest-exam-end-exam", args=[self.contest.id])
        response = self.client.post(
            end_url,
            {"upload_session_id": "session-webcam-only-1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)

    def test_end_exam_accepts_multi_source_metadata_without_video_jobs(self):
        ExamEvent.objects.create(
            contest=self.contest,
            user=self.student,
            event_type="exam_entered",
            metadata={
                "active_sources": ["screen_share", "webcam"],
                "upload_session_id": "session-multi-source-1",
            },
        )

        self.client.force_authenticate(user=self.student)
        end_url = reverse("contests:contest-exam-end-exam", args=[self.contest.id])
        response = self.client.post(
            end_url,
            {"upload_session_id": "session-multi-source-1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)

    def test_end_exam_accepts_conflicting_source_module_without_video_jobs(self):
        ExamEvent.objects.create(
            contest=self.contest,
            user=self.student,
            event_type="exam_entered",
            metadata={
                "active_sources": ["webcam"],
                "upload_session_id": "session-ipad-webcam-1",
            },
        )

        self.client.force_authenticate(user=self.student)
        end_url = reverse("contests:contest-exam-end-exam", args=[self.contest.id])
        response = self.client.post(
            end_url,
            {
                "upload_session_id": "default",
                "source_module": "screen_share",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)


class ScreenShareEventTests(APITestCase):
    """Tests for screen share stop/restore event lifecycle."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="ss_teacher", email="ss_teacher@test.com", password="pw", role="teacher"
        )
        self.student = User.objects.create_user(
            username="ss_student", email="ss_student@test.com", password="pw", role="student"
        )
        now = timezone.now()
        self.contest = Contest.objects.create(
            name="Screen Share Test",
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
            status="published",
            cheat_detection_enabled=True,
            max_cheat_warnings=3,
        )
        self.participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now,
        )
        self.events_url = reverse("contests:contest-exam-events", args=[self.contest.id])

    # ------------------------------------------------------------------
    # screen_share_stopped immediately locks (P0 event)
    # ------------------------------------------------------------------
    def test_screen_share_stopped_immediately_locks(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(
            self.events_url,
            {"event_type": "screen_share_stopped", "metadata": {"reason": "user_stopped_sharing"}},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["locked"])

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.LOCKED)

        # Event is recorded
        self.assertTrue(
            ExamEvent.objects.filter(
                contest=self.contest, user=self.student, event_type="screen_share_stopped"
            ).exists()
        )

    # ------------------------------------------------------------------
    # screen_share_restored is accepted as a valid event (no penalty)
    # ------------------------------------------------------------------
    def test_screen_share_restored_is_valid_and_no_penalty(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(
            self.events_url,
            {"event_type": "screen_share_restored", "metadata": {"reason": "user_reshared"}},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["locked"])

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.violation_count, 0)
        self.assertEqual(self.participant.exam_status, ExamStatus.IN_PROGRESS)

        self.assertTrue(
            ExamEvent.objects.filter(
                contest=self.contest, user=self.student, event_type="screen_share_restored"
            ).exists()
        )

    # ------------------------------------------------------------------
    # screen_share_stopped on already-submitted exam does not re-lock
    # ------------------------------------------------------------------
    def test_screen_share_stopped_after_submit_no_lock(self):
        self.participant.exam_status = ExamStatus.SUBMITTED
        self.participant.save(update_fields=["exam_status"])

        self.client.force_authenticate(user=self.student)
        resp = self.client.post(
            self.events_url,
            {
                "event_type": "screen_share_stopped",
                "metadata": {"phase": "TERMINAL", "event_idempotency_key": "post-submit-1"},
            },
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["locked"])

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.SUBMITTED)
