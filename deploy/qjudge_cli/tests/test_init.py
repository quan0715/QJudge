import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from qjudge_cli.check import check_env
from qjudge_cli.envfile import load
from qjudge_cli.init import build_env, run_init

ORIGIN = {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu"}
BUNDLED = {**ORIGIN, "STORAGE_MODE": "bundled", "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://files.example.edu"}


def no_docker(args, **kwargs):
    return type("Result", (), {"returncode": 0})()


class InitTests(unittest.TestCase):
    def test_bundled_storage_needs_only_origin_and_public_url(self):
        env = build_env(BUNDLED)
        self.assertEqual(check_env(env), [])
        self.assertEqual(env["OBJECT_STORAGE_ENDPOINT_URL"], "http://minio:9000")
        self.assertGreaterEqual(len(env["OBJECT_STORAGE_SECRET_KEY"]), 8)

    def test_generated_secrets_differ_and_pass_password_rules(self):
        env = build_env(BUNDLED)
        passwords = [env[k] for k in ("POSTGRES_ADMIN_PASSWORD", "DB_PASSWORD", "AI_DB_PASSWORD")]
        self.assertEqual(len(set(passwords)), 3)
        self.assertEqual(check_env(env), [])

    def test_given_values_are_kept(self):
        env = build_env({**BUNDLED, "DB_PASSWORD": "chosen-password", "OBJECT_STORAGE_BUCKET": "files"})
        self.assertEqual(env["DB_PASSWORD"], "chosen-password")
        self.assertEqual(env["OBJECT_STORAGE_BUCKET"], "files")

    def test_bundled_media_gets_livekit_keys(self):
        env = build_env({**BUNDLED, "MEDIA_MODE": "bundled"})
        self.assertTrue(env["LIVEKIT_API_KEY"])
        self.assertTrue(env["LIVEKIT_API_SECRET"])

    def test_interactive_asks_only_missing_required_keys(self):
        asked = []
        answers = {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu", "STORAGE_MODE": "bundled",
                   "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://files.example.edu"}

        def ask(key):
            asked.append(key.name)
            return answers.get(key.name, "")

        env = build_env({}, ask=ask)
        self.assertEqual(check_env(env), [])
        self.assertNotIn("DB_PASSWORD", asked)
        self.assertNotIn("OBJECT_STORAGE_ENDPOINT_URL", asked)
        self.assertIn("STORAGE_MODE", asked)

    def test_interactive_offers_optional_keys_once_and_follows_up(self):
        asked = []
        answers = {"MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
                   "LIVEKIT_NODE_IP": "203.0.113.10", "LIVEKIT_TURN_HOST": "turn.example.edu"}

        def ask(key):
            asked.append(key.name)
            return answers.get(key.name, "")

        env = build_env(BUNDLED, ask=ask)
        self.assertEqual(check_env(env), [])
        self.assertEqual(asked.count("MEDIA_MODE"), 1)
        self.assertEqual(asked.count("FRONTEND_BIND_ADDRESS"), 1)
        self.assertIn("LIVEKIT_NODE_IP", asked)
        self.assertNotIn("LIVEKIT_API_KEY", asked)

    def test_writes_private_env_and_refuses_to_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            deploy = Path(directory)
            env_file = deploy / ".env"
            with redirect_stdout(io.StringIO()):
                self.assertEqual(run_init(deploy, env_file, BUNDLED, interactive=False, run=no_docker), 0)
                self.assertEqual(env_file.stat().st_mode & 0o777, 0o600)
                self.assertEqual(check_env(load(env_file)), [])
                self.assertTrue((deploy / "secrets" / "integrity").is_dir())
                self.assertEqual(run_init(deploy, env_file, BUNDLED, interactive=False, run=no_docker), 1)

    def test_non_interactive_reports_missing_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            deploy = Path(directory)
            output = io.StringIO()
            with redirect_stdout(output):
                code = run_init(deploy, deploy / ".env", ORIGIN, interactive=False, run=no_docker)
            self.assertEqual(code, 1)
            self.assertIn("STORAGE_MODE", output.getvalue())
            self.assertFalse((deploy / ".env").exists())


if __name__ == "__main__":
    unittest.main()
