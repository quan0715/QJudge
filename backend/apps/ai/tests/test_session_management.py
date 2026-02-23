"""Tests for AI session management functionality."""

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.ai.models import AISession, AIMessage

User = get_user_model()


class SessionCRUDTestCase(TestCase):
    """Test basic CRUD operations for sessions."""

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

    def test_create_session(self):
        """Test creating a new session."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/v1/ai/sessions/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["user"], self.user.id)

    def test_retrieve_session(self):
        """Test retrieving a specific session."""
        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            f"/api/v1/ai/sessions/{self.session.id}/",
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.session.id)

    def test_update_session(self):
        """Test updating session context."""
        self.client.force_authenticate(user=self.user)
        update_data = {"context": {"key": "value"}}
        response = self.client.patch(
            f"/api/v1/ai/sessions/{self.session.id}/",
            update_data,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["context"]["key"], "value")

    def test_delete_session(self):
        """Test deleting a session."""
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f"/api/v1/ai/sessions/{self.session.id}/",
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        # Verify session is deleted
        self.assertFalse(AISession.objects.filter(id=self.session.id).exists())


class SessionMessageManagementTestCase(TestCase):
    """Test message creation and retrieval within sessions."""

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

    def test_retrieve_session_with_messages(self):
        """Test retrieving a session includes its messages."""
        # Create some messages
        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.USER,
            content="Hello"
        )
        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.ASSISTANT,
            content="Hi there!"
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(
            f"/api/v1/ai/sessions/{self.session.id}/",
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message_count"], 2)
        self.assertEqual(len(response.data["messages"]), 2)


class SessionContextManagementTestCase(TestCase):
    """Test session context storage and retrieval."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.session = AISession.objects.create(
            user=self.user,
            stage=AISession.Stage.GATE0,
            context={"title": "Test Session"}
        )

    def test_context_retrieved_in_session(self):
        """Test that session context is included in responses."""
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(
            f"/api/v1/ai/sessions/{self.session.id}/",
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["context"]["title"], "Test Session")

    def test_context_endpoint(self):
        """Test the context-specific endpoint."""
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(
            f"/api/v1/ai/sessions/{self.session.id}/context/",
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("context", response.data)


class AnonymousSessionLifecycleTestCase(TestCase):
    """Test the lifecycle of anonymous sessions."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.session = AISession.objects.create(
            user=None,  # Anonymous
            stage=AISession.Stage.GATE0
        )

    def test_anonymous_session_has_no_owner(self):
        """Anonymous sessions should have user=NULL."""
        self.assertIsNone(self.session.user)

    def test_anonymous_session_can_be_accessed_without_auth(self):
        """Anonymous sessions should be accessible without authentication."""
        # This is tested in test_session_access_control.py
        # But we verify the model property here
        self.assertIsNone(self.session.user)
        self.assertTrue(AISession.objects.filter(
            id=self.session.id,
            user__isnull=True
        ).exists())

    def test_messages_can_be_created_in_anonymous_session(self):
        """Messages should be creatable in anonymous sessions."""
        message = AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.USER,
            content="Anonymous message"
        )
        self.assertEqual(message.session, self.session)
        self.assertEqual(message.content, "Anonymous message")
