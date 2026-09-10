"""POST /exam/start/ records what the client claims its pre-check verified."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant, ExamEvent, ExamStatus
from apps.contests.services.precheck_record import normalize_precheck_payload

User = get_user_model()

VALID_PAYLOAD = {
    "screen_count": 1,
    "is_extended": False,
    "display_surface": "monitor",
    "fullscreen": True,
    "webcam_granted": False,
    "pwa_mode": False,
    "policy_version": "2026-09-10.1",
    "checks": [
        {"id": "singleMonitor", "status": "pass"},
        {"id": "shareScreen", "status": "pass"},
        {"id": "fullscreen", "status": "pass"},
    ],
    "device": {
        "device_kind": "desktop",
        "is_tablet": False,
        "is_pwa_mode": False,
        "active_sources": ["screen_share"],
    },
}


class PrecheckRecordNormalizeTests(APITestCase):
    def test_rejects_non_mappings_and_empty_payloads(self):
        for payload in (None, "monitor", [], {}, {"unknown": "field"}):
            self.assertIsNone(normalize_precheck_payload(payload))

    def test_marks_every_record_as_a_client_assertion(self):
        normalized = normalize_precheck_payload(VALID_PAYLOAD)

        self.assertEqual(normalized["asserted_by"], "client")

    def test_drops_fields_of_the_wrong_shape_instead_of_storing_them(self):
        normalized = normalize_precheck_payload(
            {
                "screen_count": "one",
                "is_extended": "no",
                "display_surface": "monitor",
                "fullscreen": True,
                "checks": [
                    {"id": "singleMonitor", "status": "pass"},
                    {"id": "shareScreen", "status": "made-up"},
                    "not-a-check",
                ],
                "device": {"device_kind": "desktop", "is_tablet": "yes"},
            }
        )

        self.assertNotIn("screen_count", normalized)
        self.assertNotIn("is_extended", normalized)
        self.assertEqual(normalized["display_surface"], "monitor")
        self.assertTrue(normalized["fullscreen"])
        self.assertEqual(normalized["checks"], [{"id": "singleMonitor", "status": "pass"}])
        self.assertEqual(normalized["device"], {"device_kind": "desktop"})

    def test_booleans_are_not_accepted_as_a_screen_count(self):
        self.assertIsNone(normalize_precheck_payload({"screen_count": True}))


class PrecheckRecordApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com", password="password",
            is_staff=True, role="admin",
        )
        self.student = User.objects.create_user(
            username="student", email="student@example.com", password="password",
        )
        self.contest = Contest.objects.create(
            name="Precheck Contest",
            start_time=timezone.now() - timedelta(minutes=5),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.owner,
            contest_type="paper_exam",
            status="published",
            cheat_detection_enabled=True,
        )
        self.participant = ContestParticipant.objects.create(
            contest=self.contest, user=self.student,
        )
        self.url = reverse("contests:contest-exam-start-exam", args=[self.contest.id])
        self.client.force_authenticate(user=self.student)

    def _events(self):
        return ExamEvent.objects.filter(
            contest=self.contest, user=self.student, event_type="precheck_passed",
        )

    def test_start_records_the_precheck_result(self):
        response = self.client.post(
            self.url,
            {"precheck": VALID_PAYLOAD, "precheck_client_occurred_at_ms": 1_785_000_000_000},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event = self._events().get()
        self.assertEqual(event.client_occurred_at_ms, 1_785_000_000_000)
        self.assertIsNotNone(event.server_received_at)
        self.assertEqual(event.metadata["precheck"]["display_surface"], "monitor")
        self.assertEqual(event.metadata["precheck"]["asserted_by"], "client")
        self.assertEqual(
            event.metadata["integrity"],
            {"definition_id": "precheck_passed", "phase": "triggered", "action": "record"},
        )

    def test_resume_from_paused_records_a_second_precheck(self):
        self.client.post(self.url, {"precheck": VALID_PAYLOAD}, format="json")
        self.participant.refresh_from_db()
        self.participant.exam_status = ExamStatus.PAUSED
        self.participant.save(update_fields=["exam_status"])

        response = self.client.post(self.url, {"precheck": VALID_PAYLOAD}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "resumed")
        self.assertEqual(self._events().count(), 2)

    def test_start_without_a_precheck_payload_still_starts_the_exam(self):
        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.IN_PROGRESS)
        self.assertFalse(self._events().exists())

    def test_unmonitored_contest_records_nothing(self):
        self.contest.cheat_detection_enabled = False
        self.contest.save(update_fields=["cheat_detection_enabled"])

        response = self.client.post(self.url, {"precheck": VALID_PAYLOAD}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self._events().exists())

    def test_a_refused_start_leaves_no_precheck_record(self):
        self.participant.exam_status = ExamStatus.SUBMITTED
        self.participant.save(update_fields=["exam_status"])
        self.contest.allow_multiple_joins = False
        self.contest.save(update_fields=["allow_multiple_joins"])

        response = self.client.post(self.url, {"precheck": VALID_PAYLOAD}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self._events().exists())

    def test_precheck_record_does_not_count_as_a_violation(self):
        self.client.post(self.url, {"precheck": VALID_PAYLOAD}, format="json")

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.violation_count, 0)
