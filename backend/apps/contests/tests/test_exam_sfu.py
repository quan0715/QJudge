from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.services.realtime_sfu_registry import (
    get_preferred_publishers,
    get_publisher,
    get_publishers,
    register_publisher,
)
from apps.users.models import User


class ExamSfuBrokerTests(APITestCase):
    def setUp(self):
        now = timezone.now()
        self.teacher = User.objects.create_user(
            username="sfu-teacher",
            email="sfu-teacher@test.com",
            password="pass",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="sfu-student",
            email="sfu-student@test.com",
            password="pass",
            role="student",
        )
        self.contest = Contest.objects.create(
            name="SFU Contest",
            owner=self.teacher,
            status="published",
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

    def test_sfu_config_is_disabled_by_default(self):
        self.client.force_authenticate(user=self.student)

        response = self.client.get(f"/api/v1/contests/{self.contest.id}/exam/sfu/config/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["enabled"])
        self.assertFalse(response.data["configured"])
        self.assertEqual(response.data["app_id"], "")

    def test_get_preferred_publishers_reads_multiple_users(self):
        other = User.objects.create_user(
            username="sfu-student-2",
            email="sfu-student-2@test.com",
            password="pass",
            role="student",
        )
        ContestParticipant.objects.create(
            contest=self.contest,
            user=other,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now(),
        )
        register_publisher(
            contest_id=self.contest.id,
            user_id=self.student.id,
            session_id="screen-session",
            track_name="screen_share-track",
            room_id="room-1",
        )
        register_publisher(
            contest_id=self.contest.id,
            user_id=other.id,
            session_id="webcam-session",
            track_name="webcam-track",
            room_id="room-2",
        )

        publishers = get_preferred_publishers(self.contest.id, [self.student.id, other.id, 999999])

        self.assertEqual(publishers[self.student.id]["session_id"], "screen-session")
        self.assertEqual(publishers[other.id]["session_id"], "webcam-session")
        self.assertIsNone(publishers[999999])

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        CLOUDFLARE_REALTIME_API_BASE_URL="https://rtc.example.test/v1",
        LIVE_MONITORING_ROOM_PREFIX="qjudge-test-exam",
    )
    def test_participant_can_create_publisher_session_without_exposing_secret(self):
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"sessionId": "session-1"}

        self.client.force_authenticate(user=self.student)
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response) as mock_request:
            response = self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/",
                {"role": "publisher"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sessionId"], "session-1")
        self.assertEqual(
            response.data["room_id"],
            f"qjudge-test-exam-{self.contest.id}-{self.student.id}",
        )
        _, url = mock_request.call_args.args[:2]
        self.assertIn("/apps/app-test/sessions/new", url)
        self.assertIn("correlationId=", url)
        self.assertEqual(
            mock_request.call_args.kwargs["headers"]["Authorization"],
            "Bearer secret-test",
        )
        self.assertNotIn("secret-test", str(response.data))

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        CLOUDFLARE_REALTIME_API_BASE_URL="https://rtc.example.test/v1",
    )
    def test_sfu_upstream_error_response_redacts_payload(self):
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.json.return_value = {
            "errorDescription": "stack trace: upstream internal detail",
            "secret": "upstream-secret",
        }

        self.client.force_authenticate(user=self.student)
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response):
            response = self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/",
                {"role": "publisher"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data, {"error": "Live monitoring is temporarily unavailable."})
        self.assertNotIn("upstream_payload", response.data)
        self.assertNotIn("stack trace", str(response.data))
        self.assertNotIn("upstream-secret", str(response.data))

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        CLOUDFLARE_REALTIME_API_BASE_URL="https://rtc.example.test/v1",
    )
    def test_teacher_can_proxy_subscriber_track_request(self):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "requiresImmediateRenegotiation": True,
            "sessionDescription": {"type": "offer", "sdp": "v=0"},
            "tracks": [{"trackName": "screen-1"}],
        }

        self.client.force_authenticate(user=self.teacher)
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response) as mock_request:
            response = self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/sub-session/tracks/new/",
                {
                    "role": "subscriber",
                    "payload": {
                        "tracks": [
                            {
                                "location": "remote",
                                "sessionId": "publisher-session",
                                "trackName": "screen-1",
                            }
                        ]
                    },
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["requiresImmediateRenegotiation"])
        method, url = mock_request.call_args.args[:2]
        self.assertEqual(method, "POST")
        self.assertIn("/apps/app-test/sessions/sub-session/tracks/new", url)

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        CLOUDFLARE_REALTIME_API_BASE_URL="https://rtc.example.test/v1",
        LIVE_MONITORING_ROOM_PREFIX="qjudge-test-exam",
        LIVE_MONITORING_PUBLISHER_TTL_SECONDS=60,
    )
    def test_publisher_track_request_registers_active_mapping(self):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "requiresImmediateRenegotiation": False,
            "sessionDescription": {"type": "answer", "sdp": "v=0"},
            "tracks": [{"trackName": "screen-track"}],
        }

        self.client.force_authenticate(user=self.student)
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response):
            response = self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/pub-session/tracks/new/",
                {
                    "role": "publisher",
                    "payload": {
                        "sessionDescription": {"type": "offer", "sdp": "v=0"},
                        "tracks": [
                            {
                                "location": "local",
                                "mid": "0",
                                "trackName": "screen-track",
                            }
                        ],
                    },
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["publisher"]["session_id"], "pub-session")
        self.assertEqual(response.data["publisher"]["track_name"], "screen-track")
        self.assertEqual(response.data["publisher"]["source_module"], "screen_share")
        stored = get_publisher(self.contest.id, self.student.id)
        self.assertEqual(stored["session_id"], "pub-session")
        self.assertEqual(stored["track_name"], "screen-track")
        self.assertEqual(stored["source_module"], "screen_share")

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        CLOUDFLARE_REALTIME_API_BASE_URL="https://rtc.example.test/v1",
        LIVE_MONITORING_ROOM_PREFIX="qjudge-test-exam",
        LIVE_MONITORING_PUBLISHER_TTL_SECONDS=60,
    )
    def test_webcam_track_request_registers_webcam_publisher(self):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "requiresImmediateRenegotiation": False,
            "sessionDescription": {"type": "answer", "sdp": "v=0"},
            "tracks": [{"trackName": "webcam-track"}],
        }

        self.client.force_authenticate(user=self.student)
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response):
            response = self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/pub-session/tracks/new/",
                {
                    "role": "publisher",
                    "payload": {
                        "sessionDescription": {"type": "offer", "sdp": "v=0"},
                        "tracks": [
                            {
                                "location": "local",
                                "mid": "0",
                                "trackName": "webcam-track",
                            }
                        ],
                    },
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["publisher"]["source_module"], "webcam")
        stored = get_publisher(self.contest.id, self.student.id, source_module="webcam")
        self.assertEqual(stored["source_module"], "webcam")

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        LIVE_MONITORING_PUBLISHER_TTL_SECONDS=60,
    )
    def test_teacher_can_fetch_active_publisher_mapping(self):
        self.client.force_authenticate(user=self.student)
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"tracks": []}
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response):
            self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/pub-session/tracks/new/",
                {
                    "role": "publisher",
                    "payload": {
                        "tracks": [
                            {
                                "location": "local",
                                "mid": "0",
                                "trackName": "screen-track",
                            }
                        ],
                    },
                },
                format="json",
            )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/exam/sfu/publishers/{self.student.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["active"])
        self.assertEqual(response.data["publisher"]["session_id"], "pub-session")
        self.assertEqual(response.data["publisher"]["track_name"], "screen-track")
        self.assertEqual(len(response.data["publishers"]), 1)

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        LIVE_MONITORING_PUBLISHER_TTL_SECONDS=60,
    )
    def test_screen_and_webcam_publishers_can_coexist(self):
        self.client.force_authenticate(user=self.student)
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"tracks": []}
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response):
            for session_id, track_name in (
                ("screen-session", "screen_share-track"),
                ("webcam-session", "webcam-track"),
            ):
                self.client.post(
                    f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/{session_id}/tracks/new/",
                    {
                        "role": "publisher",
                        "payload": {
                            "tracks": [
                                {
                                    "location": "local",
                                    "mid": "0",
                                    "trackName": track_name,
                                }
                            ],
                        },
                    },
                    format="json",
                )

        publishers = get_publishers(self.contest.id, self.student.id)
        self.assertEqual(len(publishers), 2)
        self.assertEqual(
            {publisher["source_module"]: publisher["session_id"] for publisher in publishers},
            {"screen_share": "screen-session", "webcam": "webcam-session"},
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/exam/sfu/publishers/{self.student.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["active"])
        self.assertEqual(len(response.data["publishers"]), 2)
        self.assertEqual(response.data["publisher"]["source_module"], "screen_share")

        webcam_response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/exam/sfu/publishers/{self.student.id}/",
            {"source_module": "webcam"},
        )
        self.assertEqual(webcam_response.status_code, status.HTTP_200_OK)
        self.assertEqual(webcam_response.data["publisher"]["session_id"], "webcam-session")

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        LIVE_MONITORING_PUBLISHER_TTL_SECONDS=60,
    )
    def test_student_can_heartbeat_and_stop_own_publisher_mapping(self):
        self.client.force_authenticate(user=self.student)
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"tracks": []}
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response):
            self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/pub-session/tracks/new/",
                {
                    "role": "publisher",
                    "payload": {
                        "tracks": [
                            {
                                "location": "local",
                                "mid": "0",
                                "trackName": "screen-track",
                            }
                        ],
                    },
                },
                format="json",
            )

        heartbeat_response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/exam/sfu/publisher/heartbeat/",
            {"source_module": "screen_share"},
            format="json",
        )
        self.assertEqual(heartbeat_response.status_code, status.HTTP_200_OK)
        self.assertTrue(heartbeat_response.data["active"])

        stop_response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/exam/sfu/publisher/stop/",
            {"source_module": "screen_share"},
            format="json",
        )
        self.assertEqual(stop_response.status_code, status.HTTP_200_OK)
        self.assertFalse(stop_response.data["active"])
        self.assertIsNone(get_publisher(self.contest.id, self.student.id))

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
        LIVE_MONITORING_PUBLISHER_TTL_SECONDS=60,
    )
    def test_stale_stop_does_not_remove_newer_publisher_mapping(self):
        self.client.force_authenticate(user=self.student)
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"tracks": []}
        with patch("apps.contests.services.realtime_sfu.requests.request", return_value=mock_response):
            self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/old-session/tracks/new/",
                {
                    "role": "publisher",
                    "payload": {
                        "tracks": [
                            {
                                "location": "local",
                                "mid": "0",
                                "trackName": "old-track",
                            }
                        ],
                    },
                },
                format="json",
            )
            self.client.post(
                f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/new-session/tracks/new/",
                {
                    "role": "publisher",
                    "payload": {
                        "tracks": [
                            {
                                "location": "local",
                                "mid": "0",
                                "trackName": "new-track",
                            }
                        ],
                    },
                },
                format="json",
            )

        stop_response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/exam/sfu/publisher/stop/",
            {"session_id": "old-session"},
            format="json",
        )

        self.assertEqual(stop_response.status_code, status.HTTP_200_OK)
        self.assertTrue(stop_response.data["active"])
        self.assertEqual(stop_response.data["publisher"]["session_id"], "new-session")
        stored = get_publisher(self.contest.id, self.student.id)
        self.assertEqual(stored["session_id"], "new-session")

    @override_settings(
        LIVE_MONITORING_ENABLED=True,
        CLOUDFLARE_REALTIME_APP_ID="app-test",
        CLOUDFLARE_REALTIME_APP_SECRET="secret-test",
    )
    def test_student_cannot_create_subscriber_session(self):
        self.client.force_authenticate(user=self.student)

        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/exam/sfu/sessions/",
            {"role": "subscriber", "target_user_id": self.student.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
