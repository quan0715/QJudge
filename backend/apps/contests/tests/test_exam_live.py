from datetime import timedelta
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun, ExamStatus
from apps.contests.services.anti_cheat_session import active_session_key
from apps.contests.services.livekit_service import (
    build_video_grants,
    close_live_room_for_run,
    live_room_name_for_run,
)
from apps.users.models import User
from livekit import api


LIVEKIT_SETTINGS = {
    "LIVE_MONITORING_ENABLED": True,
    "LIVE_MONITORING_PROVIDER": "livekit",
    "LIVEKIT_PUBLIC_URL": "wss://livekit.example.test",
    "LIVEKIT_INTERNAL_URL": "http://livekit:7880",
    "LIVEKIT_API_KEY": "qjudge-test-key",
    "LIVEKIT_API_SECRET": "qjudge-test-secret",
    "LIVEKIT_NODE_IP": "192.0.2.10",
    "LIVEKIT_STUN_HOST": "stun.internal:3478",
    "LIVEKIT_ROOM_PREFIX": "qjudge-test-exam",
    "LIVEKIT_TOKEN_TTL_SECONDS": 120,
}


class TestLiveKitGrantUnit:
    def test_publisher_grant_only_publishes_allowed_video_sources(self):
        grants = build_video_grants("publisher", "room-1", ["screen_share", "webcam"])

        assert grants.room_join is True
        assert grants.room == "room-1"
        assert grants.can_publish is True
        assert grants.can_subscribe is False
        assert grants.can_publish_data is False
        assert grants.can_update_own_metadata is False
        assert grants.can_publish_sources == ["screen_share", "camera"]
        assert grants.room_create is False
        assert grants.room_list is False
        assert grants.room_record is False
        assert grants.room_admin is False

    def test_subscriber_grant_cannot_publish_or_manage_rooms(self):
        grants = build_video_grants("subscriber", "room-1", [])

        assert grants.room_join is True
        assert grants.can_publish is False
        assert grants.can_subscribe is True
        assert grants.can_publish_data is False
        assert grants.can_publish_sources == []
        assert grants.room_create is False
        assert grants.room_list is False
        assert grants.room_record is False
        assert grants.room_admin is False


@pytest.mark.django_db
class ExamLiveApiTests(APITestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user(
            username="live-teacher",
            email="live-teacher@test.com",
            password="pass",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="live-student",
            email="live-student@test.com",
            password="pass",
            role="student",
        )
        self.outsider = User.objects.create_user(
            username="live-outsider",
            email="live-outsider@test.com",
            password="pass",
            role="student",
        )
        self.contest = Contest.objects.create(
            name="LiveKit Contest",
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
            registry_version="test-registry",
            health=ExamIntegrityRun.Health.HEALTHY,
        )
        cache.set(
            active_session_key(self.contest.id, self.student.id),
            {
                "contest_id": self.contest.id,
                "participant_id": self.participant.id,
                "user_id": self.student.id,
                "device_id": "device-a",
            },
            timeout=300,
        )

    def tearDown(self):
        cache.clear()

    def _publisher_scope(self, **overrides):
        scope = {
            "run_id": str(self.run.id),
            "participant_id": self.participant.id,
            "attempt_id": str(self.participant.integrity_attempt_id),
            "device_id": "device-a",
        }
        scope.update(overrides)
        return scope

    def _post_token(self, user, payload):
        self.client.force_authenticate(user=user)
        return self.client.post(
            f"/api/v1/contests/{self.contest.id}/exam/live/token/",
            payload,
            format="json",
            HTTP_X_DEVICE_ID="device-a",
        )

    @override_settings(**LIVEKIT_SETTINGS)
    @patch("apps.contests.views.exam_live.ensure_live_room")
    def test_student_gets_scope_bound_publisher_token(self, ensure_room):
        response = self._post_token(
            self.student,
            {"role": "publisher", "upload_scope": self._publisher_scope()},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["server_url"] == LIVEKIT_SETTINGS["LIVEKIT_PUBLIC_URL"]
        assert response.data["room_name"].startswith("qjudge-test-exam-")
        assert response.data["run_id"] == str(self.run.id)
        assert response.data["role"] == "publisher"
        assert response.data["allowed_sources"] == ["screen_share"]
        assert response.data["token"]
        assert response.data["expires_at"]
        assert response.data["identity"].startswith("qj-")
        assert len(response.data["identity"]) == 51
        assert str(self.run.id) not in response.data["identity"]
        assert "device-a" not in response.data["identity"]
        assert "qjudge-test-secret" not in str(response.data)
        assert response["Cache-Control"] == "no-store"

        claims = api.TokenVerifier(
            LIVEKIT_SETTINGS["LIVEKIT_API_KEY"], LIVEKIT_SETTINGS["LIVEKIT_API_SECRET"]
        ).verify(response.data["token"])
        assert claims.identity == response.data["identity"]
        assert claims.video.room == response.data["room_name"]
        assert claims.video.can_publish is True
        assert claims.video.can_subscribe is False
        assert claims.video.can_publish_sources == ["screen_share"]
        ensure_room.assert_called_once()

    @override_settings(**LIVEKIT_SETTINGS)
    @patch("apps.contests.views.exam_live.ensure_live_room")
    def test_manager_gets_subscriber_token_for_current_run(self, ensure_room):
        response = self._post_token(self.teacher, {"role": "subscriber"})

        assert response.status_code == status.HTTP_200_OK
        assert response.data["role"] == "subscriber"
        assert response.data["run_id"] == str(self.run.id)
        assert response.data["allowed_sources"] == []
        assert response.data["identity"]
        ensure_room.assert_called_once()

        claims = api.TokenVerifier(
            LIVEKIT_SETTINGS["LIVEKIT_API_KEY"], LIVEKIT_SETTINGS["LIVEKIT_API_SECRET"]
        ).verify(response.data["token"])
        assert claims.video.can_publish is False
        assert claims.video.can_subscribe is True
        assert claims.video.room_admin is False

    @override_settings(**LIVEKIT_SETTINGS)
    @patch("apps.contests.views.exam_live.get_live_snapshot")
    def test_manager_targets_returns_one_shared_snapshot_contract(self, get_snapshot):
        get_snapshot.return_value = {
            "observed_at": "2026-09-16T09:00:00+00:00",
            "stale": False,
            "targets": [{
                "user_id": self.student.id,
                "identity": "qj-opaque-student",
                "sources": ["screen_share"],
            }],
            "_status": "available",
        }
        self.client.force_authenticate(user=self.teacher)

        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/exam/live/targets/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "observed_at": "2026-09-16T09:00:00+00:00",
            "stale": False,
            "targets": [{
                "user_id": self.student.id,
                "identity": "qj-opaque-student",
                "sources": ["screen_share"],
            }],
        }
        get_snapshot.assert_called_once_with(self.contest, self.run)

    @override_settings(**LIVEKIT_SETTINGS)
    @patch("apps.contests.management.commands.close_live_monitoring_room.close_live_room")
    def test_cleanup_command_is_scoped_and_explicitly_confirmed(self, close_room):
        close_room.return_value = True
        dry_run = StringIO()

        call_command(
            "close_live_monitoring_room",
            contest_id=str(self.contest.id),
            run_id=str(self.run.id),
            stdout=dry_run,
        )

        assert dry_run.getvalue()
        assert '"dry_run": true' in dry_run.getvalue()
        close_room.assert_not_called()

        confirmed = StringIO()
        call_command(
            "close_live_monitoring_room",
            contest_id=str(self.contest.id),
            run_id=str(self.run.id),
            confirm=True,
            stdout=confirmed,
        )

        close_room.assert_called_once_with(live_room_name_for_run(self.run))
        assert '"closed": true' in confirmed.getvalue()

    @override_settings(**LIVEKIT_SETTINGS)
    @patch("apps.contests.services.livekit_service.close_live_room", return_value=False)
    def test_cleanup_failure_leaves_a_retry_marker(self, close_room):
        assert close_live_room_for_run(self.run) is False

        self.run.refresh_from_db()
        assert "live_cleanup_pending" in self.run.warnings
        close_room.assert_called_once_with(live_room_name_for_run(self.run))

        close_room.return_value = True
        assert close_live_room_for_run(self.run) is True
        self.run.refresh_from_db()
        assert "live_cleanup_pending" not in self.run.warnings

    @override_settings(
        LIVE_MONITORING_ENABLED=False,
        LIVE_MONITORING_PROVIDER="livekit",
    )
    def test_config_reports_disabled_without_provider_credentials(self):
        self.client.force_authenticate(user=self.student)

        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/exam/live/config/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "enabled": False,
            "configured": False,
            "provider": "disabled",
        }

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        LIVE_MONITORING_PROVIDER="livekit",
        LIVEKIT_PUBLIC_URL="",
        LIVEKIT_INTERNAL_URL="",
        LIVEKIT_API_KEY="",
        LIVEKIT_API_SECRET="",
    )
    def test_enabled_but_unconfigured_returns_503_without_minting(self):
        response = self._post_token(
            self.student,
            {"role": "publisher", "upload_scope": self._publisher_scope()},
        )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data == {
            "error": "Live monitoring is temporarily unavailable."
        }

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        LIVE_MONITORING_PROVIDER="cloudflare",
        LIVEKIT_PUBLIC_URL="wss://livekit.example.test",
        LIVEKIT_INTERNAL_URL="http://livekit:7880",
        LIVEKIT_API_KEY="qjudge-test-key",
        LIVEKIT_API_SECRET="qjudge-test-secret",
        LIVEKIT_NODE_IP="192.0.2.10",
        LIVEKIT_STUN_HOST="stun.internal:3478",
    )
    def test_unsupported_provider_is_not_reported_as_livekit(self):
        self.client.force_authenticate(user=self.student)

        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/exam/live/config/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "enabled": True,
            "configured": False,
            "provider": "disabled",
        }

    @override_settings(**LIVEKIT_SETTINGS)
    def test_malformed_token_request_returns_400(self):
        response = self._post_token(self.student, {})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data

    @override_settings(**LIVEKIT_SETTINGS)
    def test_non_object_token_request_returns_400(self):
        self.client.force_authenticate(user=self.student)

        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/exam/live/token/",
            [],
            format="json",
            HTTP_X_DEVICE_ID="device-a",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data

    @override_settings(**LIVEKIT_SETTINGS)
    def test_wrong_attempt_scope_returns_409(self):
        response = self._post_token(
            self.student,
            {
                "role": "publisher",
                "upload_scope": self._publisher_scope(attempt_id="00000000-0000-0000-0000-000000000000"),
            },
        )

        assert response.status_code == status.HTTP_409_CONFLICT

    @override_settings(**LIVEKIT_SETTINGS)
    def test_submitted_participant_cannot_mint_publisher_token(self):
        self.participant.exam_status = ExamStatus.SUBMITTED
        self.participant.save(update_fields=["exam_status"])

        response = self._post_token(
            self.student,
            {"role": "publisher", "upload_scope": self._publisher_scope()},
        )

        assert response.status_code == status.HTTP_409_CONFLICT

    @override_settings(**LIVEKIT_SETTINGS)
    def test_student_cannot_mint_subscriber_token(self):
        response = self._post_token(self.student, {"role": "subscriber"})

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @override_settings(**LIVEKIT_SETTINGS)
    def test_unregistered_user_cannot_mint_publisher_token(self):
        response = self._post_token(
            self.outsider,
            {"role": "publisher", "upload_scope": self._publisher_scope()},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @override_settings(**LIVEKIT_SETTINGS)
    def test_subscriber_without_current_run_returns_409(self):
        self.run.session_state = ExamIntegrityRun.SessionState.CLOSED
        self.run.save(update_fields=["session_state"])

        response = self._post_token(self.teacher, {"role": "subscriber"})

        assert response.status_code == status.HTTP_409_CONFLICT
