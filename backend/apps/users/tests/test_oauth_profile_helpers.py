from django.test import SimpleTestCase

from apps.users.auth.providers.profile import merge_missing_profile_fields


class OAuthProfileHelperTests(SimpleTestCase):
    def test_merge_missing_profile_fields_fills_only_empty_values(self):
        profile = {
            "username": "",
            "email": "",
            "oauth_id": "",
            "avatar_url": "",
        }

        merge_missing_profile_fields(
            profile,
            {
                "sub": "subject-1",
                "email": "student@example.edu",
                "name": "Student Name",
                "picture": "https://example.edu/avatar.png",
                "email_verified": False,
            },
        )

        self.assertEqual(
            profile,
            {
                "username": "Student Name",
                "email": "student@example.edu",
                "oauth_id": "subject-1",
                "avatar_url": "https://example.edu/avatar.png",
                "email_verified": False,
            },
        )

    def test_merge_missing_profile_fields_preserves_existing_values(self):
        profile = {
            "username": "Existing Name",
            "email": "existing@example.edu",
            "oauth_id": "existing-sub",
            "avatar_url": "https://example.edu/existing.png",
            "email_verified": True,
        }

        merge_missing_profile_fields(
            profile,
            {
                "sub": "fallback-sub",
                "email": "fallback@example.edu",
                "name": "Fallback Name",
                "picture": "https://example.edu/fallback.png",
                "email_verified": False,
            },
        )

        self.assertEqual(
            profile,
            {
                "username": "Existing Name",
                "email": "existing@example.edu",
                "oauth_id": "existing-sub",
                "avatar_url": "https://example.edu/existing.png",
                "email_verified": True,
            },
        )
