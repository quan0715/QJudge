from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant, ExamStatus
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

    @override_settings(
        LIVE_MONITORING_SPIKE_ENABLED=True,
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
        LIVE_MONITORING_SPIKE_ENABLED=True,
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
        LIVE_MONITORING_SPIKE_ENABLED=True,
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
