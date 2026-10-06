"""NYCU's documented profile response contains username and email only."""

from unittest import TestCase

from apps.users.auth.providers.nycu import NYCUOAuthService


class NYCUProfileTests(TestCase):
    def test_documented_profile_supplies_identity_subject(self):
        profile = NYCUOAuthService._parse_user_info({
            "username": "student123",
            "email": "student123@nycu.edu.tw",
        })
        identity = NYCUOAuthService.normalize_identity({"user_info": profile})
        self.assertEqual(identity.provider_subject, "student123")
        self.assertTrue(identity.email_verified)

    def test_explicit_subject_takes_precedence(self):
        for field in ("sub", "id"):
            with self.subTest(field=field):
                profile = NYCUOAuthService._parse_user_info({
                    field: "provider-subject", "username": "student123",
                })
                self.assertEqual(profile["oauth_id"], "provider-subject")

    def test_email_is_not_used_as_subject(self):
        profile = NYCUOAuthService._parse_user_info({"email": "student@nycu.edu.tw"})
        identity = NYCUOAuthService.normalize_identity({"user_info": profile})
        self.assertEqual(identity.provider_subject, "")

    def test_explicit_unverified_email_stays_unverified(self):
        profile = NYCUOAuthService._parse_user_info({
            "username": "student123", "email_verified": False,
        })
        self.assertFalse(profile["email_verified"])
