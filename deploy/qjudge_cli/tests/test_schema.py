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


if __name__ == "__main__":
    unittest.main()
