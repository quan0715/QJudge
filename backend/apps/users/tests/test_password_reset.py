"""Tests for forgot/reset password endpoints."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.forgot_url = "/api/v1/auth/forgot-password"
        self.reset_url = "/api/v1/auth/reset-password"
        self.email_user = User.objects.create_user(
            username="email_reset_user",
            email="email_reset_user@example.com",
            password="StrongPass123!",
            auth_provider="email",
        )
        self.oauth_user = User.objects.create_user(
            username="oauth_reset_user",
            email="oauth_reset_user@example.com",
            password="StrongPass123!",
            auth_provider="nycu-oauth",
        )

    def test_forgot_password_issues_token_for_email_user(self):
        response = self.client.post(
            self.forgot_url,
            {"email": self.email_user.email},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

        self.email_user.refresh_from_db()
        self.assertIsNotNone(self.email_user.password_reset_token)
        self.assertIsNotNone(self.email_user.password_reset_expires_at)

    def test_forgot_password_returns_success_for_unknown_or_oauth_email(self):
        response_unknown = self.client.post(
            self.forgot_url,
            {"email": "unknown@example.com"},
            format="json",
        )
        self.assertEqual(response_unknown.status_code, status.HTTP_200_OK)
        self.assertTrue(response_unknown.data["success"])

        response_oauth = self.client.post(
            self.forgot_url,
            {"email": self.oauth_user.email},
            format="json",
        )
        self.assertEqual(response_oauth.status_code, status.HTTP_200_OK)
        self.assertTrue(response_oauth.data["success"])
        self.oauth_user.refresh_from_db()
        self.assertIsNone(self.oauth_user.password_reset_token)

    def test_reset_password_with_invalid_token_fails(self):
        response = self.client.post(
            self.reset_url,
            {
                "token": "invalid-token",
                "new_password": "BrandNewPass123!",
                "new_password_confirm": "BrandNewPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["error"]["code"], "INVALID_RESET_TOKEN")

    def test_reset_password_with_expired_token_fails(self):
        self.email_user.password_reset_token = "expired-token"
        self.email_user.password_reset_expires_at = timezone.now() - timedelta(minutes=1)
        self.email_user.save(update_fields=["password_reset_token", "password_reset_expires_at"])

        response = self.client.post(
            self.reset_url,
            {
                "token": "expired-token",
                "new_password": "BrandNewPass123!",
                "new_password_confirm": "BrandNewPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])

    def test_reset_password_success(self):
        self.email_user.password_reset_token = "valid-token"
        self.email_user.password_reset_expires_at = timezone.now() + timedelta(minutes=30)
        self.email_user.save(update_fields=["password_reset_token", "password_reset_expires_at"])

        response = self.client.post(
            self.reset_url,
            {
                "token": "valid-token",
                "new_password": "BrandNewPass123!",
                "new_password_confirm": "BrandNewPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

        self.email_user.refresh_from_db()
        self.assertTrue(self.email_user.check_password("BrandNewPass123!"))
        self.assertIsNone(self.email_user.password_reset_token)
        self.assertIsNone(self.email_user.password_reset_expires_at)
