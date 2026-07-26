"""Tests for AI session access control and permissions."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIChatRun, AIExecutionLog, AISession

User = get_user_model()


def _create_user(username, email, password="testpass123", role="teacher"):
    return User.objects.create_user(
        username=username,
        email=email,
        password=password,
        role=role,
    )


class PublicAIRolePermissionTestCase(TestCase):
    """Public AI endpoints are available only to teachers and admins."""

    def setUp(self):
        self.client = APIClient()
        self.student = _create_user(
            "student",
            "student@example.com",
            role="student",
        )
        self.teacher = _create_user(
            "teacher",
            "teacher@example.com",
            role="teacher",
        )
        self.admin = _create_user("admin", "admin@example.com", role="admin")

    def test_student_cannot_read_public_ai_resources(self):
        self.client.force_authenticate(user=self.student)

        for endpoint in (
            "/api/v1/ai/models/",
            "/api/v1/ai/sessions/",
            "/api/v1/ai/runs/?status=active",
            "/api/v1/ai/artifacts/",
        ):
            with self.subTest(endpoint=endpoint):
                response = self.client.get(endpoint, format="json")
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_create_session_or_run(self):
        session = AISession.objects.create(
            session_id="student-session",
            user=self.student,
            context={"title": "student"},
        )
        self.client.force_authenticate(user=self.student)

        response = self.client.post(
            "/api/v1/ai/sessions/new_session/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        delay = MagicMock(return_value=MagicMock(id="must-not-run"))
        with patch("apps.ai.tasks.execute_ai_chat_run.delay", delay):
            response = self.client.post(
                f"/api/v1/ai/sessions/{session.session_id}/runs/",
                {"content": "hello"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(AIChatRun.objects.filter(session=session).exists())
        delay.assert_not_called()

    def test_teacher_and_admin_can_use_public_ai_resources(self):
        for user in (self.teacher, self.admin):
            with self.subTest(role=user.role):
                self.client.force_authenticate(user=user)
                models_response = self.client.get("/api/v1/ai/models/", format="json")
                sessions_response = self.client.get(
                    "/api/v1/ai/sessions/",
                    format="json",
                )
                create_response = self.client.post(
                    "/api/v1/ai/sessions/new_session/",
                    {},
                    format="json",
                )

                self.assertEqual(models_response.status_code, status.HTTP_200_OK)
                self.assertEqual(sessions_response.status_code, status.HTTP_200_OK)
                self.assertEqual(create_response.status_code, status.HTTP_200_OK)


class SessionAccessControlTestCase(TestCase):
    """Test access control for AI session endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.user1 = _create_user("user1", "user1@example.com")
        self.user2 = _create_user("user2", "user2@example.com")

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

    def test_unauthenticated_user_cannot_send_message(self):
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.user1_session.session_id}/runs/",
            {"content": "hello"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_can_send_message_to_own_session(self):
        self.client.force_authenticate(user=self.user1)
        delay = MagicMock(return_value=MagicMock(id="celery-access-1"))
        with patch("apps.ai.tasks.execute_ai_chat_run.delay", delay):
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.user1_session.session_id}/runs/",
                {"content": "hello"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        run = AIChatRun.objects.get(pk=response.data["id"])
        self.assertEqual(run.user, self.user1)
        self.assertEqual(run.session, self.user1_session)
        delay.assert_called_once_with(str(run.id))

    def test_user_cannot_send_message_to_other_user_session(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.post(
            f"/api/v1/ai/sessions/{self.user2_session.session_id}/runs/",
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
            role="teacher",
        )
        self.user2 = User.objects.create_user(
            username="user2",
            email="user2@example.com",
            password="testpass123",
            role="teacher",
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
            role="teacher",
        )

    def test_authenticated_user_can_create_session_placeholder(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.post("/api/v1/ai/sessions/new_session/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "pending")
        self.assertTrue(response.data["id"])
        self.assertTrue(
            AISession.objects.filter(
                session_id=response.data["id"],
                user=self.user1,
            ).exists()
        )

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
