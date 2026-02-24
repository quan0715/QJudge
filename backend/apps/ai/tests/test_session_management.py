"""Tests for AI session management functionality."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIMessage, AISession

User = get_user_model()


class SessionCRUDTestCase(TestCase):
    """Test basic session operations for authenticated users."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="testpass123",
        )
        self.session = AISession.objects.create(
            session_id="99999999-9999-9999-9999-999999999999",
            user=self.user,
            context={"title": "Test Session"},
        )
        self.other_session = AISession.objects.create(
            session_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            user=self.other_user,
            context={"title": "Other Session"},
        )

    def test_new_session_placeholder(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/v1/ai/sessions/new_session/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "pending")
        self.assertTrue(response.data["id"])

    def test_retrieve_session(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            f"/api/v1/ai/sessions/{self.session.session_id}/",
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["session_id"], self.session.session_id)

    def test_update_session_context(self):
        self.client.force_authenticate(user=self.user)
        update_data = {"context": {"key": "value", "title": "Updated"}}
        response = self.client.patch(
            f"/api/v1/ai/sessions/{self.session.session_id}/",
            update_data,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["context"]["key"], "value")
        self.assertEqual(response.data["context"]["title"], "Updated")

    def test_delete_session(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f"/api/v1/ai/sessions/{self.session.session_id}/",
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AISession.objects.filter(session_id=self.session.session_id).exists())

    def test_cannot_access_other_user_session(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            f"/api/v1/ai/sessions/{self.other_session.session_id}/",
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class SessionMessageManagementTestCase(TestCase):
    """Test message retrieval within sessions."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="msguser",
            email="msg@example.com",
            password="testpass123",
        )
        self.session = AISession.objects.create(
            session_id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            user=self.user,
            context={"title": "Message Session"},
        )

    def test_retrieve_session_with_messages(self):
        AIMessage.objects.create(session=self.session, role=AIMessage.Role.USER, content="Hello")
        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.ASSISTANT,
            content="Hi there!",
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(
            f"/api/v1/ai/sessions/{self.session.session_id}/",
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message_count"], 2)
        self.assertEqual(len(response.data["messages"]), 2)


class SessionContextManagementTestCase(TestCase):
    """Test session context endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="ctxuser",
            email="ctx@example.com",
            password="testpass123",
        )
        self.session = AISession.objects.create(
            session_id="cccccccc-cccc-cccc-cccc-cccccccccccc",
            user=self.user,
            context={"title": "Context Session"},
        )

    def test_context_retrieved_in_session(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(
            f"/api/v1/ai/sessions/{self.session.session_id}/",
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["context"]["title"], "Context Session")

    def test_context_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(
            f"/api/v1/ai/sessions/{self.session.session_id}/context/",
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["context"]["title"], "Context Session")
        self.assertEqual(response.data["session_id"], self.session.session_id)


class SessionListIsolationTestCase(TestCase):
    """Test authenticated users only see their own sessions."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="listuser",
            email="list@example.com",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="listother",
            email="listother@example.com",
            password="testpass123",
        )

        AISession.objects.create(
            session_id="dddddddd-dddd-dddd-dddd-dddddddddddd",
            user=self.user,
            context={"title": "mine-1"},
        )
        AISession.objects.create(
            session_id="eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            user=self.user,
            context={"title": "mine-2"},
        )
        AISession.objects.create(
            session_id="ffffffff-ffff-ffff-ffff-ffffffffffff",
            user=self.other_user,
            context={"title": "other"},
        )

    def test_list_only_own_sessions(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/ai/sessions/", format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        ids = {item["session_id"] for item in results}
        self.assertEqual(
            ids,
            {
                "dddddddd-dddd-dddd-dddd-dddddddddddd",
                "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            },
        )
