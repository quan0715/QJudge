"""
Extended teacher activation invite tests.

Covers:
- Non-admin cannot issue invites
- Expired invite cannot be consumed
- Preview reflects authenticated user state
- Already-teacher user consuming invite is idempotent
- Missing/empty token returns proper errors
"""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from apps.users.models import TeacherActivationInvite

User = get_user_model()


class TeacherActivationPermissionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="ta_perm_admin",
            email="ta_perm_admin@example.com",
            password="password123",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.teacher = User.objects.create_user(
            username="ta_perm_teacher",
            email="ta_perm_teacher@example.com",
            password="password123",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="ta_perm_student",
            email="ta_perm_student@example.com",
            password="password123",
            role="student",
        )
        self.issue_url = reverse("users:teacher-activation-issue")
        self.preview_url = reverse("users:teacher-activation-preview")
        self.consume_url = reverse("users:teacher-activation-consume")

    def _issue_invite(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.issue_url, {}, format="json")
        self.client.force_authenticate(user=None)
        return response

    # ── Issue permission tests ──────────────────────────────

    def test_student_cannot_issue_invite(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(self.issue_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_cannot_issue_invite(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(self.issue_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_issue_invite(self):
        response = self.client.post(self.issue_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ── Preview tests ───────────────────────────────────────

    def test_preview_without_token_returns_400(self):
        response = self.client.get(self.preview_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "TOKEN_REQUIRED")

    def test_preview_with_invalid_token_returns_404(self):
        response = self.client.get(f"{self.preview_url}?token=bogus_token_12345")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error"]["code"], "INVITE_NOT_FOUND")

    def test_preview_shows_can_consume_when_authenticated(self):
        issue_response = self._issue_invite()
        token = issue_response.data["data"]["activation_url"].split("token=")[1]

        self.client.force_authenticate(user=self.student)
        response = self.client.get(f"{self.preview_url}?token={token}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["data"]["requires_login"])
        self.assertTrue(response.data["data"]["can_consume"])
        self.assertEqual(response.data["data"]["current_user_email"], self.student.email)

    # ── Consume edge cases ──────────────────────────────────

    def test_unauthenticated_consume_returns_401(self):
        issue_response = self._issue_invite()
        token = issue_response.data["data"]["activation_url"].split("token=")[1]

        response = self.client.post(self.consume_url, {"token": token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_expired_invite_cannot_be_consumed(self):
        issue_response = self._issue_invite()
        token = issue_response.data["data"]["activation_url"].split("token=")[1]

        # Force expire the invite
        invite = TeacherActivationInvite.objects.get()
        invite.expires_at = timezone.now() - timedelta(hours=1)
        invite.save(update_fields=["expires_at"])

        self.client.force_authenticate(user=self.student)
        response = self.client.post(self.consume_url, {"token": token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "INVITE_EXPIRED")

    def test_consume_with_invalid_token_returns_404(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            self.consume_url, {"token": "nonexistent_token"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error"]["code"], "INVITE_NOT_FOUND")

    def test_consume_without_token_returns_400(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(self.consume_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_already_teacher_consuming_invite_stays_teacher(self):
        """If a teacher consumes an invite, they should remain teacher (idempotent)."""
        issue_response = self._issue_invite()
        token = issue_response.data["data"]["activation_url"].split("token=")[1]

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(self.consume_url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.role, "teacher")
        invite = TeacherActivationInvite.objects.get()
        self.assertIsNotNone(invite.consumed_at)
