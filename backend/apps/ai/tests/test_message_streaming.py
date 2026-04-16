"""Tests for AI message streaming functionality."""
from unittest.mock import AsyncMock, MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIMessage, AISession

User = get_user_model()


def _create_user(username, email, password="testpass123"):
    """Helper: create a test user."""
    return User.objects.create_user(
        username=username, email=email, password=password,
    )


def _mock_async_stream(thread_id: str):
    """Build mock for httpx.AsyncClient.stream (async context manager)."""
    lines = [
        f'data: {{"type":"run_started","thread_id":"{thread_id}"}}\n\n',
        'data: {"type":"agent_message_delta","content":"Hello"}\n\n',
        'data: {"type":"usage_report","input_tokens":10,"output_tokens":5,"cost_cents":1}\n\n',
        'data: {"type":"done"}\n\n',
    ]

    mock_response = MagicMock()
    mock_response.status_code = 200

    async def aiter_bytes():
        for line in lines:
            yield line.encode("utf-8")

    mock_response.aiter_bytes = aiter_bytes

    # async context manager for client.stream()
    stream_cm = AsyncMock()
    stream_cm.__aenter__.return_value = mock_response
    stream_cm.__aexit__.return_value = None

    # async context manager for AsyncClient()
    mock_client = MagicMock()
    mock_client.stream.return_value = stream_cm

    client_cm = AsyncMock()
    client_cm.__aenter__.return_value = mock_client
    client_cm.__aexit__.return_value = None

    return client_cm


def _mock_async_stream_error():
    """Build mock for httpx.AsyncClient returning 500."""
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"
    mock_response.aread = AsyncMock(return_value=b"Internal Server Error")

    stream_cm = AsyncMock()
    stream_cm.__aenter__.return_value = mock_response
    stream_cm.__aexit__.return_value = None

    mock_client = MagicMock()
    mock_client.stream.return_value = stream_cm

    client_cm = AsyncMock()
    client_cm.__aenter__.return_value = mock_client
    client_cm.__aexit__.return_value = None

    return client_cm


class MessageStreamingTestCase(TestCase):
    """Test message streaming endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.user = _create_user("testuser", "test@example.com")
        self.other_user = _create_user("otheruser", "other@example.com")
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

    def test_send_message_stream_to_own_session(self):
        self.client.force_authenticate(user=self.user)
        with patch(
            "apps.ai.services.session_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch(
            "apps.ai.services.session_runtime.httpx.AsyncClient",
            return_value=_mock_async_stream(self.session.session_id),
        ):
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            _ = b"".join(response)

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

        with patch(
            "apps.ai.services.session_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch(
            "apps.ai.services.session_runtime.httpx.AsyncClient",
            return_value=_mock_async_stream(self.session.session_id),
        ):
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "User question"},
                format="json",
            )
            _ = b"".join(response)

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

        with patch(
            "apps.ai.services.session_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch(
            "apps.ai.services.session_runtime.httpx.AsyncClient",
            return_value=_mock_async_stream(ai_thread_id),
        ):
            response = self.client.post(
                f"/api/v1/ai/sessions/{backend_session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            _ = b"".join(response)

        self.assertTrue(
            AISession.objects.filter(session_id=ai_thread_id, user=self.user).exists()
        )

    def test_ai_service_error_handling(self):
        self.client.force_authenticate(user=self.user)

        with patch(
            "apps.ai.services.session_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch(
            "apps.ai.services.session_runtime.httpx.AsyncClient",
            return_value=_mock_async_stream_error(),
        ):
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/send_message_stream/",
                {"content": "Hello"},
                format="json",
            )

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            payload = b"".join(response).decode("utf-8", errors="ignore")
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
