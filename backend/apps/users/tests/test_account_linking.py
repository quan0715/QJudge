from importlib import import_module

from django.test import TestCase

from apps.users.auth.contracts import NormalizedQAuthIdentity, ProviderTokenSet
from apps.users.models import ExternalIdentity, User


def _load_link_qauth_identity(test_case):
    try:
        module = import_module("apps.users.auth.account_linking")
    except ModuleNotFoundError:
        test_case.fail("apps.users.auth.account_linking.link_qauth_identity is required")
    return module.link_qauth_identity


class QAuthAccountLinkingTests(TestCase):
    def test_link_qauth_identity_reuses_same_provider_subject(self):
        link_qauth_identity = _load_link_qauth_identity(self)
        existing = User.objects.create_user(
            username="linked-user",
            email="old@example.edu",
            password="password123",
            auth_provider="email",
            email_verified=False,
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
        self.assertTrue(existing.email_verified)
        self.assertEqual(identity.user_id, existing.id)
        self.assertEqual(identity.email, "new@example.edu")
        self.assertEqual(identity.profile_snapshot["email"], "new@example.edu")

    def test_link_qauth_identity_attaches_same_email_user(self):
        link_qauth_identity = _load_link_qauth_identity(self)
        existing = User.objects.create_user(
            username="email-user",
            email="student@example.edu",
            password="password123",
            auth_provider="email",
            email_verified=False,
        )

        linked = link_qauth_identity(
            NormalizedQAuthIdentity(
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
        self.assertTrue(existing.email_verified)
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
        link_qauth_identity = _load_link_qauth_identity(self)
        User.objects.create_user(
            username="student",
            email="taken@example.edu",
            password="password123",
        )

        linked = link_qauth_identity(
            NormalizedQAuthIdentity(
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
        self.assertTrue(linked.email_verified)
        self.assertTrue(
            ExternalIdentity.objects.filter(
                user=linked,
                provider_key="google",
                subject="google-sub-1",
            ).exists()
        )

    def test_link_qauth_identity_does_not_persist_provider_token_set(self):
        link_qauth_identity = _load_link_qauth_identity(self)

        linked = link_qauth_identity(
            NormalizedQAuthIdentity(
                provider_key="github",
                provider_subject="github-sub-token",
                email="token-user@example.edu",
                username="token-user",
                raw_profile={"id": "github-sub-token"},
            ),
            ProviderTokenSet(access_token="secret-access-token", refresh_token="secret-refresh-token"),
        )

        identity = ExternalIdentity.objects.get(user=linked, provider_key="github")
        self.assertNotIn("secret-access-token", str(identity.profile_snapshot))
        self.assertNotIn("secret-refresh-token", str(identity.profile_snapshot))
