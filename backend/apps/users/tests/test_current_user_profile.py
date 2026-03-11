"""Tests for /api/v1/auth/me profile updates."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class CurrentUserProfileUpdateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/v1/auth/me"
        self.email_user = User.objects.create_user(
            username="email_user",
            email="email_user@example.com",
            password="StrongPass123!",
            auth_provider="email",
        )
        self.oauth_user = User.objects.create_user(
            username="oauth_user",
            email="oauth_user@example.com",
            password="StrongPass123!",
            auth_provider="nycu-oauth",
        )

    def test_email_user_can_update_username_and_email(self):
        self.client.force_authenticate(user=self.email_user)
        response = self.client.patch(
            self.url,
            {"username": "email_user_new", "email": "email_user_new@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["role"], "student")
        self.email_user.refresh_from_db()
        self.assertEqual(self.email_user.username, "email_user_new")
        self.assertEqual(self.email_user.email, "email_user_new@example.com")

    def test_email_user_update_rejects_duplicate_username(self):
        User.objects.create_user(
            username="existing_name",
            email="existing_name@example.com",
            password="StrongPass123!",
            auth_provider="email",
        )
        self.client.force_authenticate(user=self.email_user)
        response = self.client.patch(
            self.url,
            {"username": "existing_name"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])
        self.assertIn("username", response.data["error"]["details"])

    def test_oauth_user_cannot_update_username_or_email(self):
        self.client.force_authenticate(user=self.oauth_user)
        response = self.client.patch(
            self.url,
            {"username": "oauth_user_new"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["error"]["code"], "ACCOUNT_FIELDS_LOCKED")

    def test_empty_patch_returns_current_user(self):
        self.client.force_authenticate(user=self.email_user)
        response = self.client.patch(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["username"], self.email_user.username)
