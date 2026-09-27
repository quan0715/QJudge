import unittest
from pathlib import Path

from qjudge_cli.stack import bootstrap_secrets, secrets_commands

DEPLOY = Path("/srv/qjudge/deploy")


class SecretsTests(unittest.TestCase):
    def test_commands_run_both_bootstrap_scripts_offline_as_root(self):
        ai_oauth, integrity = secrets_commands(DEPLOY, "qjudge/backend:dev")
        base = ["docker", "run", "--rm", "--network", "none", "--user", "0:0",
                "-v", "/srv/qjudge/deploy/bootstrap:/bootstrap:ro"]
        self.assertEqual(ai_oauth, [
            *base, "-v", "/srv/qjudge/deploy/secrets:/oauth-secrets", "qjudge/backend:dev",
            "python", "/bootstrap/bootstrap_ai_oauth_keys.py",
            "--private-key", "/oauth-secrets/ai-oauth-ed25519-private.pem",
            "--public-key", "/oauth-secrets/ai-oauth-ed25519-public.pem",
        ])
        self.assertEqual(integrity, [
            *base, "-v", "/srv/qjudge/deploy/secrets/integrity:/bootstrap-secrets", "qjudge/backend:dev",
            "python", "/bootstrap/bootstrap_integrity_secrets.py",
            "--secrets-dir", "/bootstrap-secrets", "--resident-gid", "10001",
        ])

    def test_bootstrap_stops_at_the_first_failure(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            return type("Result", (), {"returncode": 1})()

        self.assertFalse(bootstrap_secrets(DEPLOY, "qjudge/backend:dev", run))
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
