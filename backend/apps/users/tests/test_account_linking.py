from django.test import TestCase

from apps.users.auth.account_linking import link_qauth_identity
from apps.users.auth.contracts import NormalizedQAuthIdentity
from apps.users.models import ExternalIdentity, User


class QAuthAccountLinkingTests(TestCase):
    def test_link_qauth_identity_reuses_same_provider_subject(self):
        existing = User.objects.create_user(
            username="linked-user",
            email="old@example.edu",
            password="password123",
            auth_provider="email",
        )
        ExternalIdentity.objects.create(
            user=existing,
            provider_key="github",
            subject="github-sub-1",
            email="old@example.edu",
            email_verified=True,
            profile_snapshot={"id": "github-sub-1"},
        )

        linked = link_qauth_identity(
            NormalizedQAuthIdentity(
                email_verified=True,
                provider_key="github",
                provider_subject="github-sub-1",
                email="new@example.edu",
                username="new-github-name",
                raw_profile={"id": "github-sub-1", "email": "new@example.edu"},
            )
        )

        existing.refresh_from_db()
        identity = ExternalIdentity.objects.get(provider_key="github", subject="github-sub-1")
        self.assertEqual(linked.id, existing.id)
        self.assertEqual(existing.username, "linked-user")
        self.assertEqual(existing.auth_provider, "github")
        self.assertEqual(existing.oauth_id, "github-sub-1")
        self.assertEqual(identity.user_id, existing.id)
        self.assertEqual(identity.email, "new@example.edu")
        self.assertEqual(identity.profile_snapshot["email"], "new@example.edu")

    def test_link_qauth_identity_attaches_same_email_user(self):
        existing = User.objects.create_user(
            username="email-user",
            email="student@example.edu",
            password="password123",
            auth_provider="email",
        )

        linked = link_qauth_identity(
            NormalizedQAuthIdentity(
                email_verified=True,
                provider_key="nycu",
                provider_subject="nycu-sub-1",
                email="student@example.edu",
                username="nycu-name",
                avatar_url="https://id.example.edu/avatar.png",
                raw_profile={"sub": "nycu-sub-1"},
            )
        )

        existing.refresh_from_db()
        self.assertEqual(linked.id, existing.id)
        self.assertEqual(existing.username, "email-user")
        self.assertEqual(existing.auth_provider, "nycu")
        self.assertEqual(existing.oauth_id, "nycu-sub-1")
        self.assertTrue(
            ExternalIdentity.objects.filter(
                user=existing,
                provider_key="nycu",
                subject="nycu-sub-1",
            ).exists()
        )
        existing.profile.refresh_from_db()
        self.assertEqual(existing.profile.avatar_source, "oauth")
        self.assertEqual(existing.profile.avatar_url, "https://id.example.edu/avatar.png")

    def test_link_qauth_identity_creates_user_with_unique_username(self):
        User.objects.create_user(
            username="student",
            email="taken@example.edu",
            password="password123",
        )

        linked = link_qauth_identity(
            NormalizedQAuthIdentity(
                email_verified=True,
                provider_key="google",
                provider_subject="google-sub-1",
                email="new@example.edu",
                username="student",
                raw_profile={"sub": "google-sub-1"},
            )
        )

        self.assertEqual(linked.email, "new@example.edu")
        self.assertTrue(linked.username.startswith("student"))
        self.assertNotEqual(linked.username, "student")
        self.assertEqual(linked.auth_provider, "google")
        self.assertEqual(linked.oauth_id, "google-sub-1")
        self.assertTrue(
            ExternalIdentity.objects.filter(
                user=linked,
                provider_key="google",
                subject="google-sub-1",
            ).exists()
        )
