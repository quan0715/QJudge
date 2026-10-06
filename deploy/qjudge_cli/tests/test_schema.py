import unittest

from qjudge_cli.schema import FEATURES, KEYS, KEYS_BY_NAME


class SchemaTests(unittest.TestCase):
    def test_key_names_are_unique(self):
        names = [key.name for key in KEYS]
        self.assertEqual(len(names), len(set(names)))

    def test_every_key_uses_a_known_feature(self):
        for key in KEYS:
            self.assertIn(key.feature, FEATURES, key.name)

    def test_every_key_has_help(self):
        for key in KEYS:
            self.assertTrue(key.help, key.name)

    def test_storage_credentials_are_always_required(self):
        key = KEYS_BY_NAME["OBJECT_STORAGE_ACCESS_KEY"]
        self.assertTrue(key.is_required({}))

    def test_livekit_keys_required_only_when_media_enabled(self):
        key = KEYS_BY_NAME["LIVEKIT_API_KEY"]
        self.assertFalse(key.is_required({}))
        self.assertFalse(key.is_required({"MEDIA_MODE": "disabled"}))
        self.assertTrue(key.is_required({"MEDIA_MODE": "external"}))
        self.assertTrue(key.is_required({"MEDIA_MODE": "bundled"}))

    def test_bundled_media_keys_required_only_when_bundled(self):
        key = KEYS_BY_NAME["LIVEKIT_NODE_IP"]
        self.assertFalse(key.is_required({"MEDIA_MODE": "external"}))
        self.assertTrue(key.is_required({"MEDIA_MODE": "bundled"}))

    def test_tunnel_token_required_when_profile_enabled(self):
        key = KEYS_BY_NAME["TUNNEL_TOKEN"]
        self.assertFalse(key.is_required({"COMPOSE_PROFILES": ""}))
        self.assertTrue(key.is_required({"COMPOSE_PROFILES": "tunnel"}))

    def test_oauth_secret_required_when_client_id_set(self):
        key = KEYS_BY_NAME["GITHUB_OAUTH_CLIENT_SECRET"]
        self.assertFalse(key.is_required({}))
        self.assertTrue(key.is_required({"GITHUB_OAUTH_CLIENT_ID": "abc"}))

    def test_generated_secrets_are_marked_secret(self):
        for name in ("SECRET_KEY", "DB_PASSWORD", "AI_DB_PASSWORD", "POSTGRES_ADMIN_PASSWORD"):
            self.assertTrue(KEYS_BY_NAME[name].secret, name)

    def test_dev_keys_are_optional(self):
        self.assertEqual(KEYS_BY_NAME["DOCKER_JUDGE_PLATFORM"].feature, "dev")
        self.assertFalse(KEYS_BY_NAME["DOCKER_JUDGE_PLATFORM"].is_required({}))
        self.assertEqual(KEYS_BY_NAME["HOST_PROJECT_ROOT"].feature, "core")
        self.assertFalse(KEYS_BY_NAME["HOST_PROJECT_ROOT"].is_required({}))

    def test_oauth_login_toggle_keys_are_optional(self):
        for name in ("AUTH_EMAIL_PASSWORD_ENABLED", "QAUTH_PROVIDER_CONNECTIONS_JSON"):
            self.assertEqual(KEYS_BY_NAME[name].feature, "oauth", name)
            self.assertFalse(KEYS_BY_NAME[name].is_required({}), name)

    def test_smtp_keys_are_optional(self):
        for name in ("EMAIL_HOST", "EMAIL_PORT", "DEFAULT_FROM_EMAIL"):
            self.assertEqual(KEYS_BY_NAME[name].feature, "smtp", name)
            self.assertFalse(KEYS_BY_NAME[name].is_required({}), name)

    def test_remote_mcp_toggle_is_gone(self):
        self.assertNotIn("QJUDGE_REMOTE_MCP_ENABLED", KEYS_BY_NAME)


if __name__ == "__main__":
    unittest.main()


class PasswordMailSchemaTests(unittest.TestCase):
    def test_enabled_reset_requires_host_and_sender(self):
        for name in ('EMAIL_HOST', 'DEFAULT_FROM_EMAIL'):
            self.assertTrue(KEYS_BY_NAME[name].is_required({'EMAIL_MODE': 'external'}))
            self.assertTrue(KEYS_BY_NAME[name].is_required({'EMAIL_MODE': 'bundled'}))
            self.assertFalse(KEYS_BY_NAME[name].is_required({'EMAIL_MODE': 'disabled'}))
        self.assertTrue(KEYS_BY_NAME['EMAIL_HOST_PASSWORD'].secret)
