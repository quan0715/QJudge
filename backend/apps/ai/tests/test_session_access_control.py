"""Tests for AI session access control and permissions."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIExecutionLog, AISession
from apps.users.models import UserAPIKey

User = get_user_model()

FAKE_KEY = "sk-ant-api03-fakekey1234567890"


def _create_user_with_api_key(username, email, password="testpass123"):
    user = User.objects.create_user(username=username, email=email, password=password)
    api_key = UserAPIKey.objects.create(user=user, is_validated=True, is_active=True)
    api_key.set_key(FAKE_KEY)
    api_key.save()
    return user


class SessionAccessControlTestCase(TestCase):
    """Test access control for AI session endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.user1 = _create_user_with_api_key("user1", "user1@example.com")
        self.user2 = _create_user_with_api_key("user2", "user2@example.com")

        self.user1_session = AISession.objects.create(
            session_id="11111111-1111-1111-1111-111111111111",
            user=self.user1,
            context={"title": "u1"},
        )
        self.user2_session = AISession.objects.create(
            session_id="22222222-2222-2222-2222-222222222222",
            user=self.user2,
            context={"title": "u2"},
        )

    def _mock_stream(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.iter_lines.return_value = [
            'data: {"type":"run_started","thread_id":"11111111-1111-1111-1111-111111111111"}',
            'data: {"type":"agent_message_delta","content":"ok"}',
            'data: {"type":"done"}',
        ]
        return mock_response

    def test_unauthenticated_user_cannot_send_message(self):
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.user1_session.session_id}/send_message_stream/",
            {"content": "hello"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_can_send_message_to_own_session(self):
        self.client.force_authenticate(user=self.user1)
        with patch("apps.ai.views.build_ai_service_headers", return_value={"X-AI-Internal-Token": "test"}), patch(
            "apps.ai.views.httpx.stream"
        ) as mock_stream:
            mock_stream.return_value.__enter__.return_value = self._mock_stream()
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.user1_session.session_id}/send_message_stream/",
                {"content": "hello"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_cannot_send_message_to_other_user_session(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.user2_session.session_id}/send_message_stream/",
            {"content": "hello"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class SessionListAccessControlTestCase(TestCase):
    """Test session list access control."""

    def setUp(self):
        self.client = APIClient()
        self.user1 = User.objects.create_user(
            username="user1",
            email="user1@example.com",
            password="testpass123",
        )
        self.user2 = User.objects.create_user(
            username="user2",
            email="user2@example.com",
            password="testpass123",
        )

        self.user1_sessions = [
            AISession.objects.create(
                session_id=f"u1-0000-0000-0000-00000000000{i}",
                user=self.user1,
                context={"title": f"u1-{i}"},
            )
            for i in range(3)
        ]
        AISession.objects.create(
            session_id="u2-0000-0000-0000-000000000001",
            user=self.user2,
            context={"title": "u2"},
        )

    def test_anonymous_user_cannot_list_sessions(self):
        response = self.client.get("/api/v1/ai/sessions/", format="json")
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_authenticated_user_sees_only_own_sessions(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/v1/ai/sessions/", format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 3)
        ids = {item["session_id"] for item in results}
        expected_ids = {s.session_id for s in self.user1_sessions}
        self.assertEqual(ids, expected_ids)


class SessionCreationAccessControlTestCase(TestCase):
    """Test new session placeholder endpoint access control."""

    def setUp(self):
        self.client = APIClient()
        self.user1 = User.objects.create_user(
            username="user1",
            email="user1@example.com",
            password="testpass123",
        )

    def test_authenticated_user_can_create_session_placeholder(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.post("/api/v1/ai/sessions/new_session/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "pending")
        self.assertTrue(response.data["id"])

    def test_anonymous_user_cannot_create_session_placeholder(self):
        response = self.client.post("/api/v1/ai/sessions/new_session/", {}, format="json")
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )


class ExecutionLogAccessControlTestCase(TestCase):
    """Execution log still supports user=None for service-side tracing."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="log-owner",
            email="log-owner@example.com",
            password="testpass123",
        )
        self.session = AISession.objects.create(
            session_id="33333333-3333-3333-3333-333333333333",
            user=self.user,
            context={"title": "log"},
        )

    def test_execution_log_can_be_created_with_null_user(self):
        log = AIExecutionLog.objects.create(
            user=None,
            session=self.session,
            user_message="Test message",
        )
        self.assertIsNone(log.user)
        self.assertEqual(log.session, self.session)
        self.assertEqual(log.user_message, "Test message")
