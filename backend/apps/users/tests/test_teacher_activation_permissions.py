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
        self.issue_url = "/api/v1/magic-links"

    def _inspect_url(self, token: str) -> str:
        return f"/api/v1/magic-links/{token}"

    def _redeem_url(self, token: str) -> str:
        return f"/api/v1/magic-links/{token}/redeem"

    def _issue_invite(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.issue_url,
            {"purpose": "teacher_activation"},
            format="json",
        )
        self.client.force_authenticate(user=None)
        return response

    def _token_from_issue_response(self, response) -> str:
        return response.data["data"]["magic_link_url"].rstrip("/").split("/magic-links/")[1]

    # ── Issue permission tests ──────────────────────────────

    def test_student_cannot_issue_invite(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            self.issue_url,
            {"purpose": "teacher_activation"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_cannot_issue_invite(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(
            self.issue_url,
            {"purpose": "teacher_activation"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_issue_invite(self):
        response = self.client.post(
            self.issue_url,
            {"purpose": "teacher_activation"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ── Preview tests ───────────────────────────────────────

    def test_preview_with_invalid_token_returns_404(self):
        response = self.client.get("/api/v1/magic-links/bogus_token_12345")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error"]["code"], "MAGIC_LINK_NOT_FOUND")

    def test_preview_shows_can_consume_when_authenticated(self):
        issue_response = self._issue_invite()
        token = self._token_from_issue_response(issue_response)

        self.client.force_authenticate(user=self.student)
        response = self.client.get(self._inspect_url(token))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["data"]["requires_login"])
        self.assertTrue(response.data["data"]["can_consume"])
        self.assertTrue(response.data["data"]["can_redeem"])
        self.assertEqual(response.data["data"]["current_user_email"], self.student.email)

    # ── Consume edge cases ──────────────────────────────────

    def test_unauthenticated_consume_returns_401(self):
        issue_response = self._issue_invite()
        token = self._token_from_issue_response(issue_response)

        response = self.client.post(self._redeem_url(token), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_expired_invite_cannot_be_consumed(self):
        issue_response = self._issue_invite()
        token = self._token_from_issue_response(issue_response)

        # Force expire the invite
        invite = TeacherActivationInvite.objects.get()
        invite.expires_at = timezone.now() - timedelta(hours=1)
        invite.save(update_fields=["expires_at"])

        self.client.force_authenticate(user=self.student)
        response = self.client.post(self._redeem_url(token), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "MAGIC_LINK_EXPIRED")

    def test_consume_with_invalid_token_returns_404(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            "/api/v1/magic-links/nonexistent_token/redeem", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error"]["code"], "MAGIC_LINK_NOT_FOUND")

    def test_already_teacher_consuming_invite_stays_teacher(self):
        """If a teacher consumes an invite, they should remain teacher (idempotent)."""
        issue_response = self._issue_invite()
        token = self._token_from_issue_response(issue_response)

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(self._redeem_url(token), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.role, "teacher")
        invite = TeacherActivationInvite.objects.get()
        self.assertIsNotNone(invite.consumed_at)
