from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from apps.users.models import TeacherActivationInvite

User = get_user_model()


class TeacherActivationInviteTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_activation",
            email="admin-activation@example.com",
            password="password123",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.student = User.objects.create_user(
            username="student_activation",
            email="student-activation@example.com",
            password="password123",
            role="student",
        )
        self.other_user = User.objects.create_user(
            username="other_activation",
            email="other-activation@example.com",
            password="password123",
            role="student",
        )
        self.issue_url = reverse("users:teacher-activation-issue")
        self.preview_url = reverse("users:teacher-activation-preview")
        self.consume_url = reverse("users:teacher-activation-consume")

    def _issue_invite(self, email: str):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.issue_url, {"email": email}, format="json")
        self.client.force_authenticate(user=None)
        return response

    def test_admin_can_issue_teacher_activation_invite(self):
        response = self._issue_invite("new-teacher@example.com")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["data"]["email"], "new-teacher@example.com")
        self.assertIn("teacher-activation?token=", response.data["data"]["activation_url"])
        self.assertIn("已產生", response.data["message"])
        self.assertEqual(TeacherActivationInvite.objects.count(), 1)

    def test_admin_cannot_issue_invite_for_existing_teacher(self):
        teacher = User.objects.create_user(
            username="teacher_existing",
            email="teacher-existing@example.com",
            password="password123",
            role="teacher",
        )
        response = self._issue_invite(teacher.email)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "INVITE_NOT_ALLOWED")

    def test_preview_returns_pending_invite_state(self):
        issue_response = self._issue_invite(self.student.email)
        token = issue_response.data["data"]["activation_url"].split("token=")[1]

        response = self.client.get(f"{self.preview_url}?token={token}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["status"], "pending")
        self.assertTrue(response.data["data"]["requires_login"])
        self.assertFalse(response.data["data"]["can_consume"])

    def test_matching_user_can_consume_invite_and_become_teacher(self):
        issue_response = self._issue_invite(self.student.email)
        token = issue_response.data["data"]["activation_url"].split("token=")[1]

        self.client.force_authenticate(user=self.student)
        response = self.client.post(self.consume_url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        invite = TeacherActivationInvite.objects.get(email=self.student.email)
        self.assertEqual(self.student.role, "teacher")
        self.assertIsNotNone(invite.consumed_at)
        self.assertEqual(invite.consumed_by_id, self.student.id)
        self.assertEqual(response.data["data"]["user"]["role"], "teacher")

    def test_consume_rejects_authenticated_user_with_different_email(self):
        issue_response = self._issue_invite(self.student.email)
        token = issue_response.data["data"]["activation_url"].split("token=")[1]

        self.client.force_authenticate(user=self.other_user)
        response = self.client.post(self.consume_url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["error"]["code"], "INVITE_EMAIL_MISMATCH")
        self.student.refresh_from_db()
        self.assertEqual(self.student.role, "student")
