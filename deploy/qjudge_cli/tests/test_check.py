import unittest

from qjudge_cli.check import check_env

VALID = {
    "QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu",
    "SECRET_KEY": "s3cret-value",
    "POSTGRES_ADMIN_PASSWORD": "Admin123",
    "DB_PASSWORD": "Web123",
    "AI_DB_PASSWORD": "Ai123",
    "CREDENTIAL_LEASE_SECRET": "lease-secret",
    "STORAGE_MODE": "bundled",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://files.example.edu",
    "OBJECT_STORAGE_ENDPOINT_URL": "http://minio:9000",
    "OBJECT_STORAGE_ACCESS_KEY": "access",
    "OBJECT_STORAGE_SECRET_KEY": "secret",
    "OBJECT_STORAGE_BUCKET": "qjudge",
}


def with_changes(**changes):
    env = dict(VALID)
    for key, value in changes.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    return env


def error_keys(env):
    return [error.split(":", 1)[0] for error in check_env(env)]


class CheckTests(unittest.TestCase):
    def test_valid_env_has_no_errors(self):
        self.assertEqual(check_env(VALID), [])

    def test_missing_required_key(self):
        self.assertEqual(error_keys(with_changes(SECRET_KEY=None)), ["SECRET_KEY"])

    def test_empty_required_key_counts_as_missing(self):
        self.assertEqual(error_keys(with_changes(SECRET_KEY="")), ["SECRET_KEY"])

    def test_unknown_key_is_reported(self):
        self.assertEqual(error_keys(with_changes(FRONTEND_PORT="8080")), ["FRONTEND_PORT"])

    def test_origin_must_not_have_path(self):
        env = with_changes(QJUDGE_PUBLIC_ORIGIN="https://judge.example.edu/app")
        self.assertEqual(error_keys(env), ["QJUDGE_PUBLIC_ORIGIN"])

    def test_origin_must_use_http_or_https(self):
        env = with_changes(QJUDGE_PUBLIC_ORIGIN="judge.example.edu")
        self.assertEqual(error_keys(env), ["QJUDGE_PUBLIC_ORIGIN"])

    def test_public_storage_must_be_https_when_origin_is_https(self):
        env = with_changes(OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="http://files.example.edu")
        self.assertEqual(error_keys(env), ["OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"])

    def test_public_storage_may_be_http_when_origin_is_http(self):
        env = with_changes(
            QJUDGE_PUBLIC_ORIGIN="http://10.0.0.5:8080",
            OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="http://10.0.0.5:9000",
        )
        self.assertEqual(check_env(env), [])

    def test_storage_mode_must_be_known(self):
        self.assertEqual(error_keys(with_changes(STORAGE_MODE="s3")), ["STORAGE_MODE"])

    def test_db_passwords_reject_url_reserved_characters(self):
        env = with_changes(DB_PASSWORD="has@symbol", AI_DB_PASSWORD="ok123")
        self.assertEqual(error_keys(env), ["DB_PASSWORD"])

    def test_db_passwords_accept_url_unreserved_characters(self):
        env = with_changes(DB_PASSWORD="qjudge_web-dev.1~x")
        self.assertEqual(check_env(env), [])

    def test_media_external_requires_livekit_keys(self):
        env = with_changes(MEDIA_MODE="external")
        self.assertEqual(
            error_keys(env),
            ["LIVEKIT_PUBLIC_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
        )

    def test_livekit_url_accepts_wss(self):
        env = with_changes(
            MEDIA_MODE="external",
            LIVEKIT_PUBLIC_URL="wss://live.example.edu",
            LIVEKIT_API_KEY="key",
            LIVEKIT_API_SECRET="secret",
        )
        self.assertEqual(check_env(env), [])

    def test_media_mode_must_be_known(self):
        self.assertEqual(error_keys(with_changes(MEDIA_MODE="local")), ["MEDIA_MODE"])

    def test_trusted_proxies_required_when_gateway_is_not_local(self):
        env = with_changes(GATEWAY_BIND_ADDRESS="10.0.0.5")
        self.assertEqual(error_keys(env), ["QJUDGE_TRUSTED_PROXIES"])

    def test_trusted_proxies_optional_when_gateway_is_local(self):
        self.assertEqual(check_env(with_changes(GATEWAY_BIND_ADDRESS="127.0.0.1")), [])

    def test_trusted_proxies_must_be_addresses(self):
        env = with_changes(GATEWAY_BIND_ADDRESS="10.0.0.5", QJUDGE_TRUSTED_PROXIES="10.0.0.2, nginx-host")
        self.assertEqual(error_keys(env), ["QJUDGE_TRUSTED_PROXIES"])

    def test_trusted_proxies_accept_ips_and_cidrs(self):
        env = with_changes(GATEWAY_BIND_ADDRESS="10.0.0.5", QJUDGE_TRUSTED_PROXIES="10.0.0.2, 192.168.0.0/24")
        self.assertEqual(check_env(env), [])

    def test_trusted_proxies_ignore_trailing_comma(self):
        env = with_changes(GATEWAY_BIND_ADDRESS="10.0.0.5", QJUDGE_TRUSTED_PROXIES="10.0.0.2,")
        self.assertEqual(check_env(env), [])

    def test_trusted_proxies_reject_trust_all(self):
        env = with_changes(GATEWAY_BIND_ADDRESS="10.0.0.5", QJUDGE_TRUSTED_PROXIES="0.0.0.0/0")
        self.assertEqual(error_keys(env), ["QJUDGE_TRUSTED_PROXIES"])


if __name__ == "__main__":
    unittest.main()
