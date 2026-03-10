"""Tests for API Key endpoint role-based access (teacher+ only)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import UserAPIKey

User = get_user_model()

FAKE_KEY = "sk-ant-api03-fakekey1234567890"


class APIKeyRolePermissionTestCase(TestCase):
    """Verify that API key endpoints return 403 for students."""

    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            username="student1",
            email="student@example.com",
            password="testpass123",
            role="student",
        )
        self.teacher = User.objects.create_user(
            username="teacher1",
            email="teacher@example.com",
            password="testpass123",
            role="teacher",
        )
        self.admin = User.objects.create_user(
            username="admin1",
            email="admin@example.com",
            password="testpass123",
            role="admin",
        )
        self.api_key_url = "/api/v1/users/me/api-key"
        self.validate_url = "/api/v1/users/me/api-key/validate"
        self.usage_url = "/api/v1/users/me/api-key/usage"

    # ── Student → 403 ─────────────────────────────────────────────────

    def test_student_cannot_get_api_key(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(self.api_key_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_post_api_key(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            self.api_key_url, {"api_key": FAKE_KEY}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_delete_api_key(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.delete(self.api_key_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_validate_api_key(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            self.validate_url, {"api_key": FAKE_KEY}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_get_usage(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(self.usage_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── Teacher → allowed ──────────────────────────────────────────────

    def test_teacher_can_get_api_key(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(self.api_key_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("apps.users.services.APIKeyService.validate_anthropic_key")
    def test_teacher_can_post_api_key(self, mock_validate):
        mock_validate.return_value = (True, "")
        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(
            self.api_key_url, {"api_key": FAKE_KEY}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_teacher_can_get_usage(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(self.usage_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ── Admin → allowed ────────────────────────────────────────────────

    def test_admin_can_get_api_key(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.api_key_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_can_get_usage(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.usage_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
