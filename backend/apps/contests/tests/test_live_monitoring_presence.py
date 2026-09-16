from types import SimpleNamespace
from unittest.mock import patch
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun, ExamStatus
from apps.contests.services.anti_cheat_session import active_session_key
from apps.contests.services.live_monitoring_presence import (
    get_live_snapshot,
    live_presence_cache_key,
    live_monitoring_status,
)
from apps.contests.services.livekit_service import build_live_identity, get_livekit_config
from apps.users.models import User


LIVEKIT_SETTINGS = {
    "LIVE_MONITORING_ENABLED": True,
    "LIVE_MONITORING_PROVIDER": "livekit",
    "LIVEKIT_PUBLIC_URL": "wss://livekit.test",
    "LIVEKIT_INTERNAL_URL": "http://livekit:7880",
    "LIVEKIT_API_KEY": "qjudge-test-key",
    "LIVEKIT_API_SECRET": "qjudge-test-secret",
    "LIVEKIT_NODE_IP": "10.20.0.15",
    "LIVEKIT_STUN_HOST": "turn.test.internal",
    "LIVEKIT_ENVIRONMENT": "test",
    "LIVEKIT_ROOM_PREFIX": "qjudge-exam",
}


@pytest.mark.django_db
class LiveMonitoringPresenceTests(APITestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user(
            username="presence-teacher",
            email="presence-teacher@test.com",
            password="pass",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="presence-student",
            email="presence-student@test.com",
            password="pass",
            role="student",
        )
        self.contest = Contest.objects.create(
            name="Presence Contest",
            owner=self.teacher,
            status="published",
            contest_type="paper_exam",
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            cheat_detection_enabled=True,
        )
        self.participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now,
        )
        self.run = ExamIntegrityRun.objects.create(
            contest=self.contest,
            session_state=ExamIntegrityRun.SessionState.ACTIVE,
            registry_version="presence-test",
        )
        cache.set(
            active_session_key(self.contest.id, self.student.id),
            {
                "participant_id": self.participant.id,
                "user_id": self.student.id,
                "device_id": "device-a",
                "device_kind": "desktop",
            },
            timeout=300,
        )

    def tearDown(self):
        cache.clear()

    @override_settings(**LIVEKIT_SETTINGS)
    @patch("apps.contests.services.live_monitoring_presence._list_livekit_participants")
    def test_maps_current_scope_and_published_sources_only(self, list_participants):
        config = get_livekit_config()
        identity = build_live_identity(
            config=config,
            run_id=str(self.run.id),
            participant_id=self.participant.id,
            attempt_id=str(self.participant.integrity_attempt_id),
            device_id="device-a",
            user_id=self.student.id,
        )
        list_participants.return_value = [
            SimpleNamespace(
                identity=identity,
                tracks=[SimpleNamespace(source=3), SimpleNamespace(source=1)],
            ),
            SimpleNamespace(identity="qj-old-attempt", tracks=[SimpleNamespace(source=3)]),
        ]

        snapshot = get_live_snapshot(self.contest, self.run)

        assert snapshot["stale"] is False
        assert snapshot["_status"] == "available"
        assert snapshot["targets"] == [{
            "user_id": self.student.id,
            "identity": identity,
            "sources": ["screen_share"],
        }]
        list_participants.assert_called_once()

    @override_settings(**LIVEKIT_SETTINGS)
    @patch("apps.contests.services.live_monitoring_presence._list_livekit_participants")
    def test_one_successful_snapshot_is_shared_by_all_roster_serializations(self, list_participants):
        list_participants.return_value = []

        first = get_live_snapshot(self.contest, self.run)
        second = get_live_snapshot(self.contest, self.run)

        assert first == second
        list_participants.assert_called_once()
        assert cache.get(live_presence_cache_key(str(self.run.id))) == first

    @override_settings(**LIVEKIT_SETTINGS)
    @patch("apps.contests.services.live_monitoring_presence._list_livekit_participants")
    def test_livekit_timeout_is_unknown_and_never_confirmed_online(self, list_participants):
        list_participants.side_effect = TimeoutError("test timeout")

        snapshot = get_live_snapshot(self.contest, self.run)

        assert snapshot == {
            "observed_at": None,
            "stale": True,
            "targets": [],
            "_status": "unknown",
        }
        assert cache.get(live_presence_cache_key(str(self.run.id))) is None

    def test_stale_snapshot_is_never_reported_as_available(self):
        assert live_monitoring_status({"stale": True, "_status": "available"}) == "unknown"
        assert live_monitoring_status({"stale": True, "_status": "unavailable"}) == "unavailable"
