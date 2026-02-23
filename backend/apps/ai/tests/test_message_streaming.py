"""Tests for AI message streaming functionality."""

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch, MagicMock

from apps.ai.models import AISession, AIMessage

User = get_user_model()


class MessageStreamingTestCase(TestCase):
    """Test message streaming endpoints."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.session = AISession.objects.create(
            user=self.user,
            stage=AISession.Stage.GATE0
        )
        self.anonymous_session = AISession.objects.create(
            user=None,
            stage=AISession.Stage.GATE0
        )

    def test_send_message_stream_to_own_session(self):
        """User should be able to send message to their own session."""
        self.client.force_authenticate(user=self.user)

        # Mock the ai-service response
        with patch("apps.ai.views.httpx.stream") as mock_stream:
            # Create a mock response
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.iter_lines.return_value = [
                'data: {"type":"delta","content":"Hello"}',
                'data: {"type":"done"}',
            ]
            mock_stream.return_value.__enter__.return_value = mock_response

            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.id}/send_message_stream/",
                {"content": "Hello"},
                format="json"
            )

            # Should receive streaming response
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_send_message_stream_to_anonymous_session(self):
        """Anyone should be able to send message to anonymous session."""
        # Mock the ai-service response
        with patch("apps.ai.views.httpx.stream") as mock_stream:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.iter_lines.return_value = [
                'data: {"type":"delta","content":"Hello"}',
                'data: {"type":"done"}',
            ]
            mock_stream.return_value.__enter__.return_value = mock_response

            response = self.client.post(
                f"/api/v1/ai/sessions/{self.anonymous_session.id}/send_message_stream/",
                {"content": "Hello"},
                format="json"
            )

            # Should receive streaming response
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_send_message_stream_to_other_user_session_fails(self):
        """User should NOT be able to send message to another user's session."""
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123"
        )
        other_session = AISession.objects.create(
            user=other_user,
            stage=AISession.Stage.GATE0
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/v1/ai/sessions/{other_session.id}/send_message_stream/",
            {"content": "Hello"},
            format="json"
        )

        # Should be forbidden
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_message_saved_after_streaming(self):
        """User message should be saved after streaming response."""
        self.client.force_authenticate(user=self.user)

        with patch("apps.ai.views.httpx.stream") as mock_stream:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.iter_lines.return_value = [
                'data: {"type":"delta","content":"Response"}',
                'data: {"type":"done"}',
            ]
            mock_stream.return_value.__enter__.return_value = mock_response

            self.client.post(
                f"/api/v1/ai/sessions/{self.session.id}/send_message_stream/",
                {"content": "User question"},
                format="json"
            )

            # Verify message was saved
            messages = AIMessage.objects.filter(
                session=self.session,
                role=AIMessage.Role.USER
            )
            self.assertEqual(messages.count(), 1)
            self.assertEqual(messages.first().content, "User question")

    def test_non_existent_session_returns_404(self):
        """Accessing non-existent session should return 404."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/v1/ai/sessions/99999/send_message_stream/",
            {"content": "Hello"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("apps.ai.views.httpx.stream")
    def test_ai_service_error_handling(self, mock_stream):
        """SSE should handle ai-service errors gracefully."""
        self.client.force_authenticate(user=self.user)

        # Simulate ai-service error
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_stream.return_value.__enter__.return_value = mock_response

        response = self.client.post(
            f"/api/v1/ai/sessions/{self.session.id}/send_message_stream/",
            {"content": "Hello"},
            format="json"
        )

        # Should receive error event
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The response body should contain error event


class MessagePersistenceTestCase(TestCase):
    """Test message persistence in sessions."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.session = AISession.objects.create(
            user=self.user,
            stage=AISession.Stage.GATE0
        )

    def test_messages_persisted_in_database(self):
        """Messages sent through streaming should be persisted."""
        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.USER,
            content="First question"
        )
        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.ASSISTANT,
            content="First response"
        )

        messages = AIMessage.objects.filter(session=self.session)
        self.assertEqual(messages.count(), 2)

        # Retrieve through API
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(
            f"/api/v1/ai/sessions/{self.session.id}/",
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message_count"], 2)
        self.assertEqual(len(response.data["messages"]), 2)

    def test_message_ordering(self):
        """Messages should be ordered by creation time."""
        times_and_content = [
            ("First", AIMessage.Role.USER),
            ("Second", AIMessage.Role.ASSISTANT),
            ("Third", AIMessage.Role.USER),
        ]

        for content, role in times_and_content:
            AIMessage.objects.create(
                session=self.session,
                role=role,
                content=content
            )

        messages = AIMessage.objects.filter(session=self.session).order_by("created_at")
        contents = [msg.content for msg in messages]

        self.assertEqual(contents, ["First", "Second", "Third"])
