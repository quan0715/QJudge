"""Tests for AI message streaming functionality."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIMessage, AISession

User = get_user_model()


class MessageStreamingTestCase(TestCase):
    """Test message streaming endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )
        self.session = AISession.objects.create(
            session_id="44444444-4444-4444-4444-444444444444",
            user=self.user,
            context={"title": "existing"},
        )
        self.other_session = AISession.objects.create(
            session_id="55555555-5555-5555-5555-555555555555",
            user=self.other_user,
            context={"title": "other"},
        )

    def _mock_stream_response(self, thread_id: str):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.iter_lines.return_value = [
            f'data: {{"type":"run_started","thread_id":"{thread_id}"}}',
            'data: {"type":"agent_message_delta","content":"Hello"}',
            'data: {"type":"usage_report","input_tokens":10,"output_tokens":5,"cost_cents":1}',
            'data: {"type":"done"}',
        ]
        return mock_response

    def test_send_message_stream_to_own_session(self):
        self.client.force_authenticate(user=self.user)
        with patch("apps.ai.views._build_ai_service_headers", return_value={"X-AI-Internal-Token": "test"}), patch(
            "apps.ai.views.httpx.stream"
        ) as mock_stream:
            mock_stream.return_value.__enter__.return_value = self._mock_stream_response(
                self.session.session_id
            )
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            # Consume stream so finally-block persistence runs.
            _ = b"".join(response.streaming_content)

    def test_send_message_stream_to_other_user_session_returns_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.other_session.session_id}/send_message_stream/",
            {"content": "Hello"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_message_saved_after_streaming(self):
        self.client.force_authenticate(user=self.user)

        with patch("apps.ai.views._build_ai_service_headers", return_value={"X-AI-Internal-Token": "test"}), patch(
            "apps.ai.views.httpx.stream"
        ) as mock_stream:
            mock_stream.return_value.__enter__.return_value = self._mock_stream_response(
                self.session.session_id
            )

            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "User question"},
                format="json",
            )
            _ = b"".join(response.streaming_content)

            user_messages = AIMessage.objects.filter(
                session=self.session,
                role=AIMessage.Role.USER,
                content="User question",
            )
            assistant_messages = AIMessage.objects.filter(
                session=self.session,
                role=AIMessage.Role.ASSISTANT,
            )
            self.assertEqual(user_messages.count(), 1)
            self.assertGreaterEqual(assistant_messages.count(), 1)

    def test_non_existent_session_id_treated_as_new_backend_session(self):
        self.client.force_authenticate(user=self.user)
        backend_session_id = "66666666-6666-6666-6666-666666666666"
        ai_thread_id = "77777777-7777-7777-7777-777777777777"

        with patch("apps.ai.views._build_ai_service_headers", return_value={"X-AI-Internal-Token": "test"}), patch(
            "apps.ai.views.httpx.stream"
        ) as mock_stream:
            mock_stream.return_value.__enter__.return_value = self._mock_stream_response(
                ai_thread_id
            )
            response = self.client.post(
                f"/api/v1/ai/sessions/{backend_session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            _ = b"".join(response.streaming_content)

        self.assertTrue(
            AISession.objects.filter(session_id=ai_thread_id, user=self.user).exists()
        )

    def test_ai_service_error_handling(self):
        self.client.force_authenticate(user=self.user)

        with patch("apps.ai.views._build_ai_service_headers", return_value={"X-AI-Internal-Token": "test"}), patch(
            "apps.ai.views.httpx.stream"
        ) as mock_stream:
            mock_response = MagicMock()
            mock_response.status_code = 500
            mock_response.text = "Internal Server Error"
            mock_response.read.return_value = b"Internal Server Error"
            mock_stream.return_value.__enter__.return_value = mock_response

            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            payload = b"".join(response.streaming_content).decode("utf-8", errors="ignore")
            self.assertIn('"type": "error"', payload)


class MessagePersistenceTestCase(TestCase):
    """Test message persistence in sessions."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="persistuser",
            email="persist@example.com",
            password="testpass123",
        )
        self.session = AISession.objects.create(
            session_id="88888888-8888-8888-8888-888888888888",
            user=self.user,
            context={"title": "persist"},
        )

    def test_messages_persisted_in_database(self):
        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.USER,
            content="First question",
        )
        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.ASSISTANT,
            content="First response",
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(f"/api/v1/ai/sessions/{self.session.session_id}/", format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message_count"], 2)
        self.assertEqual(len(response.data["messages"]), 2)

    def test_message_ordering(self):
        for content, role in [
            ("First", AIMessage.Role.USER),
            ("Second", AIMessage.Role.ASSISTANT),
            ("Third", AIMessage.Role.USER),
        ]:
            AIMessage.objects.create(session=self.session, role=role, content=content)

        messages = AIMessage.objects.filter(session=self.session).order_by("created_at")
        self.assertEqual([m.content for m in messages], ["First", "Second", "Third"])
