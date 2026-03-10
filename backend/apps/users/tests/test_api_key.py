"""Tests for API Key management endpoints."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import UserAPIKey

User = get_user_model()

FAKE_KEY = "sk-ant-api03-fakekey1234567890"


class APIKeyViewTestCase(TestCase):
    """Test /api/v1/users/me/api-key endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            role="teacher",
        )
        self.url = "/api/v1/users/me/api-key"

    # ── GET ────────────────────────────────────────────────────────────

    def test_get_api_key_info_unauthenticated(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_api_key_info_no_key(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertFalse(response.data["data"]["has_key"])

    def test_get_api_key_info_with_key(self):
        self.client.force_authenticate(user=self.user)
        api_key = UserAPIKey.objects.create(user=self.user)
        api_key.set_key(FAKE_KEY)
        api_key.is_validated = True
        api_key.save()

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertTrue(data["has_key"])
        self.assertTrue(data["is_validated"])
        # Key should never be exposed in response
        self.assertNotIn("encrypted_key", data)
        self.assertNotIn("api_key", data)

    # ── POST ───────────────────────────────────────────────────────────

    def test_set_api_key_invalid_format(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {"api_key": "invalid-key"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("apps.users.services.APIKeyService.validate_anthropic_key")
    def test_set_api_key_success(self, mock_validate):
        mock_validate.return_value = (True, "")
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url,
            {"api_key": FAKE_KEY, "key_name": "Test Key"},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])

        # Verify stored and encrypted
        api_key = UserAPIKey.objects.get(user=self.user)
        self.assertTrue(api_key.is_validated)
        self.assertEqual(api_key.key_name, "Test Key")
        self.assertEqual(api_key.get_key(), FAKE_KEY)

    @patch("apps.users.services.APIKeyService.validate_anthropic_key")
    def test_set_api_key_validation_failure(self, mock_validate):
        mock_validate.return_value = (False, "Invalid API key")
        self.client.force_authenticate(user=self.user)

        response = self.client.post(self.url, {"api_key": FAKE_KEY})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(UserAPIKey.objects.filter(user=self.user).exists())

    # ── DELETE ─────────────────────────────────────────────────────────

    def test_delete_api_key_success(self):
        self.client.force_authenticate(user=self.user)
        api_key = UserAPIKey.objects.create(user=self.user)
        api_key.set_key(FAKE_KEY)
        api_key.save()

        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(UserAPIKey.objects.filter(user=self.user).exists())

    def test_delete_api_key_not_found(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class APIKeyEncryptionTestCase(TestCase):
    """Test API key encryption round-trip."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="enctest",
            email="enc@example.com",
            password="testpass123",
        )

    def test_encrypt_decrypt_roundtrip(self):
        api_key = UserAPIKey.objects.create(user=self.user)
        api_key.set_key(FAKE_KEY)
        api_key.save()

        # Re-fetch from DB to ensure binary storage works
        api_key.refresh_from_db()
        self.assertEqual(api_key.get_key(), FAKE_KEY)

    def test_encrypted_key_is_not_plaintext(self):
        api_key = UserAPIKey.objects.create(user=self.user)
        api_key.set_key(FAKE_KEY)
        api_key.save()

        raw = bytes(api_key.encrypted_key)
        self.assertNotIn(FAKE_KEY.encode(), raw)
