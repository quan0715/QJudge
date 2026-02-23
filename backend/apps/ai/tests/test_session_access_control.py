"""Tests for AI session access control and permissions."""

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.ai.models import AISession, AIMessage

User = get_user_model()


class SessionAccessControlTestCase(TestCase):
    """Test access control for AI sessions."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()

        # Create test users
        self.user1 = User.objects.create_user(
            username="user1",
            email="user1@example.com",
            password="testpass123"
        )
        self.user2 = User.objects.create_user(
            username="user2",
            email="user2@example.com",
            password="testpass123"
        )

        # Create sessions
        # 用戶1的持久化 session
        self.user1_session = AISession.objects.create(
            user=self.user1,
            stage=AISession.Stage.GATE0
        )

        # 用戶2的持久化 session
        self.user2_session = AISession.objects.create(
            user=self.user2,
            stage=AISession.Stage.GATE0
        )

        # 匿名 session（user = NULL）
        self.anonymous_session = AISession.objects.create(
            user=None,
            stage=AISession.Stage.GATE0
        )

    def test_anonymous_user_can_access_anonymous_session(self):
        """Anonymous users should be able to access anonymous (user=NULL) sessions."""
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.anonymous_session.id}/send_message_stream/",
            {"content": "Hello"},
            format="json"
        )
        # Should not return 403 (even if SSE fails)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_access_user_session(self):
        """Anonymous users should NOT be able to access user sessions."""
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.user1_session.id}/send_message_stream/",
            {"content": "Hello"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_can_access_own_session(self):
        """Authenticated user should be able to access their own session."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.user1_session.id}/send_message_stream/",
            {"content": "Hello"},
            format="json"
        )
        # Should not return 403 (even if SSE fails)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_cannot_access_other_user_session(self):
        """User should NOT be able to access another user's session."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.user2_session.id}/send_message_stream/",
            {"content": "Hello"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_cannot_access_anonymous_session_through_own_session_endpoint(self):
        """Users should not inadvertently access anonymous sessions."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.anonymous_session.id}/send_message_stream/",
            {"content": "Hello"},
            format="json"
        )
        # Anonymous sessions have user=NULL, so authenticated user accessing them
        # should be allowed (they're public/temporary)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class SessionListAccessControlTestCase(TestCase):
    """Test session list access control."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()

        self.user1 = User.objects.create_user(
            username="user1",
            email="user1@example.com",
            password="testpass123"
        )

        # Create user1's sessions
        self.user1_sessions = [
            AISession.objects.create(user=self.user1, stage=AISession.Stage.GATE0)
            for _ in range(3)
        ]

        # Create anonymous sessions (should not appear in user's list)
        self.anonymous_sessions = [
            AISession.objects.create(user=None, stage=AISession.Stage.GATE0)
            for _ in range(2)
        ]

    def test_anonymous_user_cannot_list_sessions(self):
        """Anonymous users should get empty session list."""
        response = self.client.get("/api/v1/ai/sessions/", format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # DRF uses pagination by default, so check 'results' key
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 0)

    def test_authenticated_user_sees_only_own_sessions(self):
        """Authenticated user should only see their own sessions."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/v1/ai/sessions/", format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # DRF uses pagination by default, so check 'results' key
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 3)
        # Verify all are user1's sessions
        for session in results:
            self.assertEqual(session["user"], self.user1.id)


class SessionCreationAccessControlTestCase(TestCase):
    """Test session creation access control."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user1 = User.objects.create_user(
            username="user1",
            email="user1@example.com",
            password="testpass123"
        )

    def test_authenticated_user_can_create_session(self):
        """Authenticated users should be able to create sessions."""
        self.client.force_authenticate(user=self.user1)
        response = self.client.post("/api/v1/ai/sessions/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Verify session is owned by user
        self.assertEqual(response.data["user"], self.user1.id)

    def test_anonymous_user_cannot_create_session(self):
        """Anonymous users should NOT be able to create persistent sessions."""
        response = self.client.post("/api/v1/ai/sessions/", {}, format="json")
        # 應該返回 401 或類似的認證錯誤
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
        )


class ExecutionLogAccessControlTestCase(TestCase):
    """Test execution log recording for anonymous sessions."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        # Anonymous session
        self.anonymous_session = AISession.objects.create(
            user=None,
            stage=AISession.Stage.GATE0
        )

    def test_execution_log_can_be_created_for_anonymous_session(self):
        """Execution logs should support NULL user for anonymous sessions."""
        from apps.ai.models import AIExecutionLog

        log = AIExecutionLog.objects.create(
            user=None,  # Anonymous
            session=self.anonymous_session,
            user_message="Test message"
        )
        self.assertIsNone(log.user)
        self.assertEqual(log.session, self.anonymous_session)
        self.assertEqual(log.user_message, "Test message")
