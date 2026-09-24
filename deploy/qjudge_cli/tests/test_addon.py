import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from stat import S_IMODE
from tempfile import TemporaryDirectory
from unittest.mock import patch

from qjudge_cli.addon import addon_command, run_addon
from qjudge_cli.envfile import load, write_values
from qjudge_cli.tests.test_check import VALID

DEPLOY = Path("/srv/qjudge/deploy")
ENV_FILE = DEPLOY / ".env"


class Recorder:
    def __init__(self, network_exists=True):
        self.calls = []
        self.network_exists = network_exists

    def __call__(self, args, **kwargs):
        self.calls.append(args)
        missing = args[:3] == ["docker", "network", "inspect"] and not self.network_exists
        return type("Result", (), {"returncode": 1 if missing else 0})()


class AddonTests(unittest.TestCase):
    def test_media_up_uses_separate_project_and_starts_both_services(self):
        command = addon_command(DEPLOY, ENV_FILE, "media", "up", "qjudge-app")
        self.assertEqual(command[-4:], ["up", "-d", "livekit", "coturn"])
        self.assertEqual(command[command.index("--project-name") + 1], "qjudge-app-media")

    def test_media_init_generates_only_missing_values_and_preserves_existing(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("MEDIA_MODE=bundled\nLIVEKIT_NODE_IP=192.0.2.10\nLIVEKIT_TURN_HOST=turn.example.test\nLIVEKIT_API_KEY=existing-key\n# keep this comment\n")
            output = StringIO()
            with patch("qjudge_cli.addon.secrets.token_urlsafe", side_effect=["generated-api", "generated-turn"]), redirect_stdout(output):
                code = run_addon(DEPLOY, env_file, load(env_file), "media", "init")
            values = load(env_file)
            self.assertEqual(code, 0)
            self.assertEqual(values["LIVEKIT_API_KEY"], "existing-key")
            self.assertEqual(values["LIVEKIT_API_SECRET"], "generated-api")
            self.assertEqual(values["LIVEKIT_TURN_SECRET"], "generated-turn")
            self.assertIn("# keep this comment", env_file.read_text())
            self.assertNotIn("generated-api", output.getvalue())
            self.assertNotIn("generated-turn", output.getvalue())
            self.assertEqual(S_IMODE(env_file.stat().st_mode), 0o600)

    def test_media_init_generates_all_empty_credentials(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("MEDIA_MODE=bundled\n")
            output = StringIO()
            with patch("qjudge_cli.addon.secrets.token_hex", return_value="generated-key"), patch("qjudge_cli.addon.secrets.token_urlsafe", side_effect=["generated-api", "generated-turn"]), redirect_stdout(output):
                code = run_addon(DEPLOY, env_file, load(env_file), "media", "init")
            values = load(env_file)
            self.assertEqual(code, 0)
            self.assertEqual(values["LIVEKIT_API_KEY"], "generated-key")
            self.assertEqual(values["LIVEKIT_API_SECRET"], "generated-api")
            self.assertEqual(values["LIVEKIT_TURN_SECRET"], "generated-turn")
            for secret in ("generated-key", "generated-api", "generated-turn"):
                self.assertNotIn(secret, output.getvalue())

    def test_media_init_refuses_disabled_or_external_mode_without_side_effects(self):
        for mode in ("external", "disabled"):
            with self.subTest(mode=mode), TemporaryDirectory() as directory:
                env_file = Path(directory) / ".env"
                env_file.write_text(f"MEDIA_MODE={mode}\n")
                run = Recorder()
                code = run_addon(DEPLOY, env_file, load(env_file), "media", "init", run=run)
                self.assertEqual(code, 1)
                self.assertEqual(env_file.read_text(), f"MEDIA_MODE={mode}\n")
                self.assertEqual(run.calls, [])

    def test_media_init_preserves_existing_api_and_turn_secrets(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("MEDIA_MODE=bundled\nLIVEKIT_API_KEY=existing-key\nLIVEKIT_API_SECRET=existing-api-secret\nLIVEKIT_TURN_SECRET=existing-turn-secret\n")
            with patch("qjudge_cli.addon.secrets.token_hex") as token_hex, patch("qjudge_cli.addon.secrets.token_urlsafe") as token_urlsafe, patch("qjudge_cli.addon.write_values") as writer:
                code = run_addon(DEPLOY, env_file, load(env_file), "media", "init")
            values = load(env_file)
            self.assertEqual(code, 0)
            self.assertEqual(values["LIVEKIT_API_KEY"], "existing-key")
            self.assertEqual(values["LIVEKIT_API_SECRET"], "existing-api-secret")
            self.assertEqual(values["LIVEKIT_TURN_SECRET"], "existing-turn-secret")
            token_hex.assert_not_called()
            token_urlsafe.assert_not_called()
            writer.assert_not_called()

    def test_media_init_updates_last_duplicate_empty_credential(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "MEDIA_MODE=bundled\nLIVEKIT_API_KEY=old-key\n"
                "LIVEKIT_API_KEY=\nLIVEKIT_API_SECRET=existing-api\n"
                "LIVEKIT_TURN_SECRET=existing-turn\n"
            )
            with patch("qjudge_cli.addon.secrets.token_hex", return_value="new-key"):
                self.assertEqual(run_addon(DEPLOY, env_file, load(env_file), "media", "init"), 0)
            self.assertEqual(load(env_file)["LIVEKIT_API_KEY"], "new-key")
            self.assertIn("LIVEKIT_API_KEY=old-key\nLIVEKIT_API_KEY=new-key\n", env_file.read_text())

    def test_env_writer_replace_failure_preserves_original_and_removes_temp(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            original = b"MEDIA_MODE=bundled\n# keep\nLIVEKIT_API_KEY=\n"
            env_file.write_bytes(original)
            with patch("qjudge_cli.envfile.os.replace", side_effect=OSError("replace failed")):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    write_values(env_file, {"LIVEKIT_API_KEY": "new-key"})
            self.assertEqual(env_file.read_bytes(), original)
            self.assertEqual(list(Path(directory).iterdir()), [env_file])

    def test_env_writer_skips_replace_without_effective_updates(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            original = b"LIVEKIT_API_KEY=existing-key\n"
            env_file.write_bytes(original)
            with patch("qjudge_cli.envfile.os.replace") as replace:
                write_values(env_file, {"LIVEKIT_API_KEY": "new-key"})
                write_values(env_file, {})
            replace.assert_not_called()
            self.assertEqual(env_file.read_bytes(), original)

    def test_media_up_refuses_external_mode_without_compose(self):
        for mode in ("external", "disabled"):
            with self.subTest(mode=mode), TemporaryDirectory() as directory:
                deploy_dir = Path(directory)
                env_file = deploy_dir / ".env"
                env_file.write_text(f"MEDIA_MODE={mode}\n")
                run = Recorder()
                code = run_addon(deploy_dir, env_file, load(env_file), "media", "up", run=run)
                self.assertEqual(code, 1)
                self.assertEqual(run.calls, [])
                self.assertFalse((deploy_dir / "secrets").exists())

    def test_media_up_writes_config_before_compose(self):
        with TemporaryDirectory() as directory:
            deploy_dir = Path(directory)
            env_file = deploy_dir / ".env"
            media_env = {**VALID, "MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.test", "LIVEKIT_API_KEY": "api-key", "LIVEKIT_API_SECRET": "api-secret", "LIVEKIT_NODE_IP": "192.0.2.10", "LIVEKIT_TURN_HOST": "turn.example.test", "LIVEKIT_TURN_SECRET": "turn-secret"}
            env_file.write_text("\n".join(f"{key}={value}" for key, value in media_env.items()) + "\n")

            class ConfigRecorder(Recorder):
                def __call__(self, args, **kwargs):
                    if args[:2] == ["docker", "compose"]:
                        self_outer.assertTrue((deploy_dir / "secrets" / "livekit.json").is_file())
                        self_outer.assertTrue((deploy_dir / "secrets" / "turnserver.conf").is_file())
                        self_outer.assertNotIn("api-secret", " ".join(args))
                        self_outer.assertNotIn("turn-secret", " ".join(args))
                    return super().__call__(args, **kwargs)

            self_outer = self
            run = ConfigRecorder()
            self.assertEqual(run_addon(deploy_dir, env_file, media_env, "media", "up", run=run), 0)

    def test_media_up_creates_shared_network_before_compose(self):
        with TemporaryDirectory() as directory:
            deploy_dir = Path(directory)
            env_file = deploy_dir / ".env"
            media_env = {**VALID, "MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.test", "LIVEKIT_API_KEY": "api-key", "LIVEKIT_API_SECRET": "api-secret", "LIVEKIT_NODE_IP": "192.0.2.10", "LIVEKIT_TURN_HOST": "turn.example.test", "LIVEKIT_TURN_SECRET": "turn-secret"}
            env_file.write_text("\n".join(f"{key}={value}" for key, value in media_env.items()) + "\n")
            run = Recorder(network_exists=False)
            self.assertEqual(run_addon(deploy_dir, env_file, media_env, "media", "up", run=run), 0)
            self.assertEqual(run.calls[1], ["docker", "network", "create", "qjudge"])
            self.assertEqual(run.calls[2][-5:], ["up", "-d", "--force-recreate", "livekit", "coturn"])
            self.assertEqual(run.calls[3][-4:], ["up", "-d", "livekit", "coturn"])

    def test_media_up_recreates_only_services_whose_config_changed(self):
        with TemporaryDirectory() as directory:
            deploy_dir = Path(directory)
            env_file = deploy_dir / ".env"
            media_env = {**VALID, "MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.test", "LIVEKIT_API_KEY": "api-key", "LIVEKIT_API_SECRET": "api-secret", "LIVEKIT_NODE_IP": "192.0.2.10", "LIVEKIT_TURN_HOST": "turn.example.test", "LIVEKIT_TURN_SECRET": "turn-secret"}
            run_addon(deploy_dir, env_file, media_env, "media", "up", run=Recorder())

            unchanged = Recorder()
            self.assertEqual(run_addon(deploy_dir, env_file, media_env, "media", "up", run=unchanged), 0)
            self.assertEqual([call[-4:] for call in unchanged.calls[1:]], [["up", "-d", "livekit", "coturn"]])

            rotated = Recorder()
            self.assertEqual(run_addon(deploy_dir, env_file, {**media_env, "LIVEKIT_API_SECRET": "new-secret"}, "media", "up", run=rotated), 0)
            self.assertEqual(rotated.calls[1][-4:], ["up", "-d", "--force-recreate", "livekit"])
            self.assertEqual(rotated.calls[2][-4:], ["up", "-d", "livekit", "coturn"])

    def test_media_compose_uses_verified_image_digests(self):
        compose = (Path(__file__).resolve().parents[2] / "addons" / "media" / "compose.yml").read_text()
        self.assertIn("livekit/livekit-server:v1.13.7@sha256:6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3", compose)
        self.assertIn("coturn/coturn:4.6.3@sha256:71c3c990283385567f11794ee692e3a47b66fd9b0bb39e42afbe776e331dd888", compose)
        self.assertIn('"${FRONTEND_BIND_ADDRESS:-127.0.0.1}:7880:7880"', compose)
        self.assertIn('user: "0:0"', compose.split("  coturn:", 1)[1])

    def test_coturn_mounts_tls_certificates_and_publishes_tls_only_on_loopback(self):
        compose = (Path(__file__).resolve().parents[2] / "addons" / "media" / "compose.yml").read_text()
        coturn = compose.split("  coturn:", 1)[1]
        self.assertIn(
            "source: /etc/letsencrypt\n        target: /etc/letsencrypt\n"
            "        read_only: true\n        bind:\n          create_host_path: false",
            coturn,
        )
        tls_ports = [line.strip() for line in coturn.splitlines() if line.strip().startswith("- ") and ":5349" in line]
        self.assertEqual(tls_ports, ['- "127.0.0.1:5349:5349/tcp"'])

    def test_storage_up_command(self):
        self.assertEqual(
            addon_command(DEPLOY, ENV_FILE, "storage", "up"),
            [
                "docker", "compose", "--project-name", "qjudge-storage", "--project-directory", "/srv/qjudge/deploy",
                "--env-file", "/srv/qjudge/deploy/.env",
                "-f", "/srv/qjudge/deploy/addons/storage/compose.yml",
                "up", "-d", "minio",
            ],
        )

    def test_storage_init_runs_one_off_service(self):
        self.assertEqual(addon_command(DEPLOY, ENV_FILE, "storage", "init")[-3:], ["run", "--rm", "storage-init"])

    def test_refuses_when_storage_is_external(self):
        run = Recorder()
        code = run_addon(DEPLOY, ENV_FILE, {**VALID, "STORAGE_MODE": "external"}, "storage", "up", run=run)
        self.assertEqual(code, 1)
        self.assertEqual(run.calls, [])

    def test_refuses_invalid_env(self):
        run = Recorder()
        code = run_addon(DEPLOY, ENV_FILE, {**VALID, "OBJECT_STORAGE_BUCKET": ""}, "storage", "up", run=run)
        self.assertEqual(code, 1)
        self.assertEqual(run.calls, [])

    def test_creates_missing_network_before_running(self):
        run = Recorder(network_exists=False)
        code = run_addon(DEPLOY, ENV_FILE, VALID, "storage", "init", run=run)
        self.assertEqual(code, 0)
        self.assertEqual(run.calls[1], ["docker", "network", "create", "qjudge"])
        self.assertEqual(run.calls[2][-3:], ["run", "--rm", "storage-init"])


if __name__ == "__main__":
    unittest.main()

class ProjectIsolationTests(unittest.TestCase):
    def test_explicit_project_overrides_compose_project_name(self):
        run = Recorder()
        code = run_addon(DEPLOY, ENV_FILE, {**VALID, "COMPOSE_PROJECT_NAME": "qjudge-app"}, "storage", "up", run=run)
        self.assertEqual(code, 0)
        command = run.calls[-1]
        self.assertIn("--project-name", command)
        self.assertEqual(command[command.index("--project-name") + 1], "qjudge-app-storage")
