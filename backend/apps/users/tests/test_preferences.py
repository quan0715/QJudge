"""Tests for user preferences endpoints (display_name, theme, language)."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import UserProfile

User = get_user_model()


class UserPreferencesViewTestCase(TestCase):
    """Test GET/PATCH /api/v1/users/me/preferences"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="prefuser",
            email="pref@example.com",
            password="testpass123",
        )
        self.url = "/api/v1/users/me/preferences"

    # ── GET ────────────────────────────────────────────────────────────

    def test_get_preferences_unauthenticated(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_preferences_ensures_profile_exists(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.json()), {"data", "meta"})
        self.assertTrue(UserProfile.objects.filter(user=self.user).exists())

    def test_get_preferences_returns_display_name(self):
        self.client.force_authenticate(user=self.user)
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.display_name = "Alice"
        profile.save()

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["data"]["profile"]["display_name"], "Alice")

    def test_get_preferences_returns_defaults(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        data = response.json()["data"]
        self.assertEqual(data["profile"]["display_name"], "")
        self.assertIsNone(data["profile"]["avatar_url"])
        self.assertEqual(data["preferences"]["preferred_language"], "zh-TW")
        self.assertEqual(data["preferences"]["preferred_theme"], "system")
        self.assertEqual(data["preferences"]["editor_font_size"], 14)
        self.assertEqual(data["preferences"]["editor_tab_size"], 4)

    # ── PATCH display_name ─────────────────────────────────────────────

    def test_patch_display_name(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"profile": {"display_name": "Bob"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.json()), {"data", "meta"})
        self.assertEqual(response.json()["data"]["profile"]["display_name"], "Bob")

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
            {"profile": {"display_name": ""}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["data"]["profile"]["display_name"], "")

    def test_patch_display_name_too_long(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"profile": {"display_name": "x" * 51}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── PATCH other fields ─────────────────────────────────────────────

    def test_patch_theme(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"preferences": {"preferred_theme": "dark"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["data"]["preferences"]["preferred_theme"], "dark")

    def test_patch_editor_font_size_out_of_range(self):
        self.client.force_authenticate(user=self.user)
        for size in (8, 30):
            response = self.client.patch(self.url, {"preferences": {"editor_font_size": size}}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, size)

    def test_patch_invalid_theme(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"preferences": {"preferred_theme": "neon"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_language(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"preferences": {"preferred_language": "en"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["data"]["preferences"]["preferred_language"], "en")

    def test_patch_invalid_language(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"preferences": {"preferred_language": "fr"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_multiple_fields(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"profile": {"display_name": "Charlie", "avatar_url": "https://cdn.example.com/avatar.png"}, "preferences": {"preferred_theme": "light", "preferred_language": "ja"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()["data"]
        self.assertEqual(data["profile"]["display_name"], "Charlie")
        self.assertEqual(data["profile"]["avatar_url"], "https://cdn.example.com/avatar.png")
        self.assertEqual(data["preferences"]["preferred_theme"], "light")
        self.assertEqual(data["preferences"]["preferred_language"], "ja")

    def test_patch_avatar_url_and_mark_manual_source(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"profile": {"avatar_url": "https://img.example.com/u1.webp"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["data"]["profile"]["avatar_url"], "https://img.example.com/u1.webp")

        profile = UserProfile.objects.get(user=self.user)
        self.assertEqual(profile.avatar_url, "https://img.example.com/u1.webp")
        self.assertEqual(profile.avatar_source, "manual")

    def test_patch_avatar_url_rejects_invalid_scheme(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            self.url,
            {"profile": {"avatar_url": "ftp://img.example.com/u1.webp"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_avatar_url_blank_clears(self):
        self.client.force_authenticate(user=self.user)
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.avatar_url = "https://img.example.com/u1.webp"
        profile.avatar_source = "oauth"
        profile.save()

        response = self.client.patch(
            self.url,
            {"profile": {"avatar_url": ""}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.json()["data"]["profile"]["avatar_url"])

        profile.refresh_from_db()
        self.assertEqual(profile.avatar_url, "")
        self.assertEqual(profile.avatar_source, "manual")

    def test_patch_onboarding_completed_at(self):
        self.client.force_authenticate(user=self.user)
        completed_at = timezone.now().replace(microsecond=0)

        response = self.client.patch(
            self.url,
            {"onboarding_completed_at": completed_at.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        profile = UserProfile.objects.get(user=self.user)
        self.assertIsNotNone(profile.onboarding_completed_at)

    def test_patch_onboarding_completed_at_uses_server_time_when_client_clock_is_ahead(self):
        self.client.force_authenticate(user=self.user)
        future_time = (timezone.now() + timedelta(minutes=5)).isoformat()

        response = self.client.patch(
            self.url,
            {"onboarding_completed_at": future_time},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        profile = UserProfile.objects.get(user=self.user)
        self.assertIsNotNone(profile.onboarding_completed_at)
        self.assertLess(
            abs((profile.onboarding_completed_at - timezone.now()).total_seconds()),
            5,
        )

    # ── Incident 2026-04-07 regression tests ──────────────────────────

    def test_patch_invalid_preferred_language_zh_hant(self):
        """zh-hant was a legacy default that should be rejected."""
        self.client.force_authenticate(user=self.user)
        for lang in ["zh-hant", "zh", "en-US", "fr", ""]:
            response = self.client.patch(
                self.url,
                {"preferences": {"preferred_language": lang}},
                format="json",
            )
            self.assertEqual(
                response.status_code,
                status.HTTP_400_BAD_REQUEST,
                f"Expected 400 for preferred_language={lang!r}",
            )

    def test_patch_preferred_language_all_valid(self):
        self.client.force_authenticate(user=self.user)
        for lang in ["zh-TW", "en", "ja", "ko"]:
            response = self.client.patch(
                self.url,
                {"preferences": {"preferred_language": lang}},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.json()["data"]["preferences"]["preferred_language"], lang)

    def test_onboarding_completed_at_uses_server_time(self):
        """Backend should ignore the provided timestamp and use server time."""
        self.client.force_authenticate(user=self.user)
        past_time = (timezone.now() - timedelta(hours=1)).isoformat()

        response = self.client.patch(
            self.url,
            {"onboarding_completed_at": past_time},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        profile = UserProfile.objects.get(user=self.user)
        self.assertIsNotNone(profile.onboarding_completed_at)
        diff = abs((profile.onboarding_completed_at - timezone.now()).total_seconds())
        self.assertLess(diff, 5, "Server should set onboarding time to ~now()")

    def test_preferences_response_shape(self):
        """GET response must contain all expected fields with correct types."""
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.json()["data"]
        expected_fields = {"profile", "preferences", "onboarding_completed_at"}
        self.assertEqual(set(data.keys()), expected_fields)

        self.assertIsInstance(data["preferences"]["preferred_language"], str)
        self.assertIn(data["preferences"]["preferred_language"], ["zh-TW", "en", "ja", "ko"])
        self.assertIn(data["preferences"]["preferred_theme"], ["light", "dark", "system"])
        self.assertIsInstance(data["preferences"]["editor_font_size"], int)
        self.assertIn(data["preferences"]["editor_tab_size"], [2, 4])
