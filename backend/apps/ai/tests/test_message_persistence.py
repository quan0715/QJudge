"""Tests for AI chat message persistence."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIMessage, AISession

User = get_user_model()


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
