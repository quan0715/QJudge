from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.contests.models import Contest, ExamEvent
from apps.contests.services.evidence_windows import (
    EVIDENCE_WINDOW_AFTER_SECONDS,
    EVIDENCE_WINDOW_BEFORE_SECONDS,
    EVIDENCE_WINDOW_MAX_SECONDS,
    attach_evidence_window_metadata,
)


User = get_user_model()


class EvidenceWindowMetadataTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher",
            email="teacher@example.com",
            password="pass",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="student",
            email="student@example.com",
            password="pass",
            role="student",
        )
        now = timezone.now()
        self.contest = Contest.objects.create(
            name="Evidence Window Test",
            owner=self.teacher,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            status="published",
            cheat_detection_enabled=True,
        )

    def _event_at(self, event_type: str, occurred_at, metadata=None):
        event = ExamEvent.objects.create(
            contest=self.contest,
            user=self.student,
            event_type=event_type,
            metadata=metadata or {"module": "screen_share"},
        )
        ExamEvent.objects.filter(pk=event.pk).update(created_at=occurred_at)
        event.refresh_from_db()
        return attach_evidence_window_metadata(event)

    def _metadata_dt(self, event: ExamEvent, key: str):
        parsed = parse_datetime(event.metadata[key])
        self.assertIsNotNone(parsed)
        return parsed

    def test_single_penalized_event_gets_default_window_metadata(self):
        occurred_at = timezone.now().replace(microsecond=0)

        event = self._event_at("exit_fullscreen", occurred_at)

        self.assertIn("evidence_cluster_id", event.metadata)
        self.assertEqual(
            self._metadata_dt(event, "evidence_window_start"),
            occurred_at - timedelta(seconds=EVIDENCE_WINDOW_BEFORE_SECONDS),
        )
        self.assertEqual(
            self._metadata_dt(event, "evidence_window_end"),
            occurred_at + timedelta(seconds=EVIDENCE_WINDOW_AFTER_SECONDS),
        )
        self.assertEqual(event.metadata["evidence_source_module"], "screen_share")
        self.assertFalse(event.metadata["pre_buffer_complete"])

    def test_non_penalized_event_does_not_get_evidence_window(self):
        occurred_at = timezone.now().replace(microsecond=0)

        event = self._event_at("heartbeat", occurred_at)

        self.assertNotIn("evidence_cluster_id", event.metadata or {})

    def test_terminal_phase_penalized_event_does_not_get_evidence_window(self):
        occurred_at = timezone.now().replace(microsecond=0)

        event = self._event_at(
            "screen_share_stopped",
            occurred_at,
            {"module": "screen_share", "phase": "TERMINATING"},
        )

        self.assertNotIn("evidence_cluster_id", event.metadata or {})

    def test_nearby_penalized_events_merge_into_one_cluster_and_extend_window(self):
        base = timezone.now().replace(microsecond=0)
        first = self._event_at("exit_fullscreen", base)
        first_cluster = first.metadata["evidence_cluster_id"]

        second = self._event_at("multiple_displays", base + timedelta(seconds=15))

        first.refresh_from_db()
        self.assertEqual(second.metadata["evidence_cluster_id"], first_cluster)
        self.assertEqual(first.metadata["evidence_cluster_id"], first_cluster)
        self.assertEqual(
            self._metadata_dt(first, "evidence_window_end"),
            base + timedelta(seconds=35),
        )
        self.assertEqual(
            self._metadata_dt(second, "evidence_window_start"),
            base - timedelta(seconds=20),
        )

    def test_cluster_is_capped_at_max_duration_then_new_cluster_starts(self):
        base = timezone.now().replace(microsecond=0)
        first = self._event_at("exit_fullscreen", base)
        cluster_id = first.metadata["evidence_cluster_id"]

        for offset in (35, 70, 105):
            event = self._event_at("multiple_displays", base + timedelta(seconds=offset))
            self.assertEqual(event.metadata["evidence_cluster_id"], cluster_id)

        first.refresh_from_db()
        self.assertEqual(
            self._metadata_dt(first, "evidence_window_end"),
            base - timedelta(seconds=20) + timedelta(seconds=EVIDENCE_WINDOW_MAX_SECONDS),
        )

        next_event = self._event_at("mouse_leave", base + timedelta(seconds=140))
        self.assertNotEqual(next_event.metadata["evidence_cluster_id"], cluster_id)
