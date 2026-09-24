import unittest
from pathlib import Path

from qjudge_cli.addon import addon_command, run_addon
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
