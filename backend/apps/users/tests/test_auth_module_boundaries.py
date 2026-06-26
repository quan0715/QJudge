import ast
import importlib
import importlib.util
from pathlib import Path

from django.test import SimpleTestCase

from apps.users.auth.contracts import NormalizedQAuthIdentity, ProviderTokenSet
from apps.users.auth.providers import BaseOAuthService
from apps.users.auth.providers.github import GitHubOAuthService

AUTH_DIR = Path(__file__).resolve().parents[1] / "auth"


def _auth_module_imports(test_case, filename):
    module_path = AUTH_DIR / filename
    test_case.assertTrue(module_path.exists(), f"{filename} is required")
    tree = ast.parse(module_path.read_text())
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = f"{'.' * node.level}{node.module or ''}"
            imports.append((module, tuple(alias.name for alias in node.names)))
        elif isinstance(node, ast.Import):
            imports.extend((alias.name, ()) for alias in node.names)
    return imports


class AuthModuleBoundaryTests(SimpleTestCase):
    def test_users_services_does_not_export_oauth_provider_classes(self):
        services = importlib.import_module("apps.users.services")

        for name in [
            "BaseOAuthService",
            "GitHubOAuthService",
            "GoogleOAuthService",
            "NYCUOAuthService",
            "OAUTH_PROVIDERS",
            "get_oauth_service",
        ]:
            self.assertFalse(hasattr(services, name), f"apps.users.services must not export {name}")

    def test_oauth_legacy_module_is_removed(self):
        self.assertIsNone(importlib.util.find_spec("apps.users.auth.legacy"))

    def test_base_oauth_service_does_not_link_users_directly(self):
        self.assertFalse(hasattr(BaseOAuthService, "get_or_create_user"))

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

    def test_account_linking_keeps_persistence_in_dedicated_modules(self):
        account_imports = _auth_module_imports(self, "account_linking.py")
        self.assertNotIn(("..models", ("ExternalIdentity", "User", "UserProfile")), account_imports)
        self.assertNotIn(("django.core.cache", ("cache",)), account_imports)
        self.assertNotIn(("django.utils", ("timezone",)), account_imports)

        external_imports = _auth_module_imports(self, "external_accounts.py")
        self.assertIn(("..models", ("ExternalIdentity",)), external_imports)
        self.assertNotIn(("..models", ("User",)), external_imports)
        self.assertNotIn(("..models", ("UserProfile",)), external_imports)

        projection_imports = _auth_module_imports(self, "user_projection.py")
        self.assertIn(("..models", ("User", "UserProfile")), projection_imports)
        self.assertNotIn(("..models", ("ExternalIdentity",)), projection_imports)
