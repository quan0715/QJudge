from django.test import SimpleTestCase

from apps.users.auth.contracts import NormalizedQAuthIdentity, ProviderTokenSet
from apps.users.auth.providers import GitHubOAuthService


class OAuthProviderIdentityTests(SimpleTestCase):
    def test_provider_service_normalizes_identity_and_token_set(self):
        oauth_data = {
            "access_token": "provider-token",
            "user_info": {
                "username": "github-user",
                "email": "github@example.edu",
                "oauth_id": "12345",
                "avatar_url": "https://avatars.githubusercontent.com/u/12345",
            },
        }

        identity = GitHubOAuthService.normalize_identity(oauth_data)
        token_set = GitHubOAuthService.provider_token_set(oauth_data)

        self.assertIsInstance(identity, NormalizedQAuthIdentity)
        self.assertEqual(identity.provider_key, "github")
        self.assertEqual(identity.provider_subject, "12345")
        self.assertEqual(identity.email, "github@example.edu")
        self.assertEqual(identity.avatar_url, "https://avatars.githubusercontent.com/u/12345")
        self.assertEqual(identity.raw_profile, oauth_data["user_info"])
        self.assertIsInstance(token_set, ProviderTokenSet)
        self.assertEqual(token_set.access_token, "provider-token")
