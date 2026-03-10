"""Tests for user preferences endpoints (display_name, theme, language)."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import UserProfile

User = get_user_model()


class UserPreferencesViewTestCase(TestCase):
    """Test GET/PATCH /api/v1/auth/me/preferences"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="prefuser",
            email="pref@example.com",
            password="testpass123",
        )
        self.url = "/api/v1/auth/me/preferences"

    # ── GET ────────────────────────────────────────────────────────────

    def test_get_preferences_unauthenticated(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_preferences_ensures_profile_exists(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(UserProfile.objects.filter(user=self.user).exists())

    def test_get_preferences_returns_display_name(self):
        self.client.force_authenticate(user=self.user)
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.display_name = "Alice"
        profile.save()

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["display_name"], "Alice")

    def test_get_preferences_returns_defaults(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        data = response.data["data"]
        self.assertEqual(data["display_name"], "")
        self.assertEqual(data["preferred_language"], "zh-TW")
        self.assertEqual(data["preferred_theme"], "system")
        self.assertEqual(data["editor_font_size"], 14)
        self.assertEqual(data["editor_tab_size"], 4)

    # ── PATCH display_name ─────────────────────────────────────────────

    def test_patch_display_name(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"display_name": "Bob"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["display_name"], "Bob")

        # Verify persisted
        profile = UserProfile.objects.get(user=self.user)
        self.assertEqual(profile.display_name, "Bob")

    def test_patch_display_name_blank_allowed(self):
        self.client.force_authenticate(user=self.user)
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.display_name = "Alice"
        profile.save()

        response = self.client.patch(
            self.url,
            {"display_name": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["display_name"], "")

    def test_patch_display_name_too_long(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"display_name": "x" * 51},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── PATCH other fields ─────────────────────────────────────────────

    def test_patch_theme(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"preferred_theme": "dark"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["preferred_theme"], "dark")

    def test_patch_invalid_theme(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"preferred_theme": "neon"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_language(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"preferred_language": "en"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["preferred_language"], "en")

    def test_patch_invalid_language(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"preferred_language": "fr"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_multiple_fields(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {
                "display_name": "Charlie",
                "preferred_theme": "light",
                "preferred_language": "ja",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["display_name"], "Charlie")
        self.assertEqual(data["preferred_theme"], "light")
        self.assertEqual(data["preferred_language"], "ja")
