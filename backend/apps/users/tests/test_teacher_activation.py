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

    def test_admin_can_issue_teacher_activation_invite(self):
        response = self._issue_invite()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["data"]["email"], "")
        self.assertEqual(response.data["data"]["purpose"], "teacher_activation")
        self.assertIn("/magic-links/", response.data["data"]["magic_link_url"])
        self.assertEqual(response.data["data"]["activation_url"], response.data["data"]["magic_link_url"])
        self.assertIn("已產生", response.data["message"])
        self.assertEqual(TeacherActivationInvite.objects.count(), 1)

    def test_preview_returns_pending_invite_state(self):
        issue_response = self._issue_invite()
        token = self._token_from_issue_response(issue_response)

        response = self.client.get(self._inspect_url(token))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["purpose"], "teacher_activation")
        self.assertEqual(response.data["data"]["status"], "pending")
        self.assertTrue(response.data["data"]["requires_login"])
        self.assertFalse(response.data["data"]["can_consume"])
        self.assertFalse(response.data["data"]["can_redeem"])

    def test_matching_user_can_consume_invite_and_become_teacher(self):
        issue_response = self._issue_invite()
        token = self._token_from_issue_response(issue_response)

        self.client.force_authenticate(user=self.student)
        response = self.client.post(self._redeem_url(token), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        invite = TeacherActivationInvite.objects.get()
        self.assertEqual(self.student.role, "teacher")
        self.assertIsNotNone(invite.consumed_at)
        self.assertEqual(invite.consumed_by_id, self.student.id)
        self.assertEqual(response.data["data"]["user"]["role"], "teacher")
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)

    def test_any_authenticated_student_can_consume_invite(self):
        issue_response = self._issue_invite()
        token = self._token_from_issue_response(issue_response)

        self.client.force_authenticate(user=self.other_user)
        response = self.client.post(self._redeem_url(token), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.other_user.refresh_from_db()
        self.assertEqual(self.other_user.role, "teacher")

    def test_consumed_invite_cannot_be_reused(self):
        issue_response = self._issue_invite()
        token = self._token_from_issue_response(issue_response)

        self.client.force_authenticate(user=self.student)
        first_response = self.client.post(self._redeem_url(token), {}, format="json")
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.other_user)
        second_response = self.client.post(self._redeem_url(token), {}, format="json")
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second_response.data["error"]["code"], "MAGIC_LINK_ALREADY_REDEEMED")
