import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from qjudge_cli.agent.install import (
    AGENT_TOKEN_NAME, agent_compose, agent_up, agent_variables, ensure_token, restart_self,
)
from qjudge_cli.tests.test_check import VALID
from qjudge_cli.agent.state import write_job
from qjudge_cli.tests.test_release import FakeHost


class AgentInstallTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.deploy = Path(self.directory.name) / "deploy"
        self.deploy.mkdir()
        self.env_file = self.deploy / ".env"
        self.env_file.write_text("".join(f"{k}={v}\n" for k, v in VALID.items()))

    def tearDown(self):
        self.directory.cleanup()

    def test_token_is_created_once_and_kept(self):
        first = ensure_token(self.deploy)
        self.assertEqual(ensure_token(self.deploy), first)
        self.assertEqual((self.deploy / "secrets" / "agent-token").stat().st_mode & 0o777, 0o600)

    def test_token_file_name_is_shared_with_the_server(self):
        self.assertEqual(AGENT_TOKEN_NAME, "agent-token")

    def test_variables_require_the_docker_socket(self):
        self.assertIsNone(agent_variables(self.deploy, socket=self.deploy / "missing.sock"))
        socket = self.deploy / "docker.sock"; socket.touch()
        variables = agent_variables(self.deploy, socket=socket)
        self.assertEqual(variables["QJUDGE_REPO_DIR"], str(self.deploy.parent.resolve()))
        self.assertEqual(variables["QJUDGE_AGENT_UID"], str(os.getuid()))
        self.assertEqual(variables["QJUDGE_AGENT_GID"], str(os.getgid()))
        self.assertEqual(variables["QJUDGE_DOCKER_GID"], str(socket.stat().st_gid))

    def test_agent_up_builds_then_recreates_in_its_own_project(self):
        host = FakeHost(); socket = self.deploy / "docker.sock"; socket.touch()
        self.assertTrue(agent_up(self.deploy, self.env_file, run=host, socket=socket))
        commands = host.commands()
        self.assertTrue(all("--project-name qjudge-agent" in c for c in commands))
        self.assertTrue(commands[-2].endswith(" build") and commands[-1].endswith("up -d --force-recreate"))

    def test_agent_up_passes_the_variables_to_compose(self):
        host = FakeHost(); socket = self.deploy / "docker.sock"; socket.touch()
        seen = []
        original = host.__call__

        def run(args, **kwargs):
            seen.append(kwargs.get("env"))
            return original(args, **kwargs)

        self.assertTrue(agent_up(self.deploy, self.env_file, run=run, socket=socket))
        self.assertTrue(seen)
        self.assertTrue((self.deploy / "secrets" / AGENT_TOKEN_NAME).is_file())
        for env in seen:
            self.assertEqual(env["QJUDGE_REPO_DIR"], str(self.deploy.parent.resolve()))
            self.assertIn("QJUDGE_DOCKER_GID", env)

    def test_agent_up_warns_and_fails_without_the_docker_socket(self):
        host = FakeHost(); output = io.StringIO()
        with redirect_stdout(output):
            ok = agent_up(self.deploy, self.env_file, run=host, socket=self.deploy / "missing.sock")
        self.assertFalse(ok)
        self.assertIn("warning: agent not started: ", output.getvalue())
        self.assertEqual(host.calls, [])

    def test_agent_up_warns_when_compose_fails(self):
        host = FakeHost(fail_on=("up -d --force-recreate",)); socket = self.deploy / "docker.sock"
        socket.touch(); output = io.StringIO()
        with redirect_stdout(output):
            self.assertFalse(agent_up(self.deploy, self.env_file, run=host, socket=socket))
        self.assertIn("warning: agent not started: ", output.getvalue())

    def test_agent_up_stops_after_a_failed_build(self):
        host = FakeHost(fail_on=(" build",)); socket = self.deploy / "docker.sock"
        socket.touch()
        with redirect_stdout(io.StringIO()):
            self.assertFalse(agent_up(self.deploy, self.env_file, run=host, socket=socket))
        self.assertFalse(any("force-recreate" in c for c in host.commands()))

    def test_agent_up_never_raises_when_docker_cannot_run(self):
        socket = self.deploy / "docker.sock"; socket.touch()

        def missing_docker(args, **kwargs):
            raise FileNotFoundError("docker")

        output = io.StringIO()
        with redirect_stdout(output):
            self.assertFalse(agent_up(self.deploy, self.env_file, run=missing_docker, socket=socket))
        self.assertIn("warning: agent not started: ", output.getvalue())

    def test_agent_compose_uses_the_project_name_of_the_stack(self):
        command = agent_compose(self.deploy, self.env_file, {"COMPOSE_PROJECT_NAME": "judge"})
        self.assertEqual(command[:4], ["docker", "compose", "--project-name", "judge-agent"])
        self.assertEqual(command[-2:], ["-f", str(self.deploy / "agent" / "compose.yml")])

    def test_restart_self_uses_a_one_off_container(self):
        host = FakeHost()
        restart_self(self.deploy, self.env_file, run=host)
        self.assertIn("run -d --rm --no-deps agent python3 deploy/qjudge agent up", host.commands()[-1])

    def test_restart_self_reports_the_compose_result(self):
        self.assertTrue(restart_self(self.deploy, self.env_file, run=FakeHost()))
        with redirect_stdout(io.StringIO()):
            self.assertFalse(restart_self(self.deploy, self.env_file, run=FakeHost(fail_on=("run -d",))))

    def test_agent_up_keeps_an_admitted_job_alive(self):
        host = FakeHost()
        socket = self.deploy / "docker.sock"; socket.touch()
        write_job(self.deploy, {"status": "running"})
        with redirect_stdout(io.StringIO()):
            self.assertFalse(agent_up(self.deploy, self.env_file, run=host, socket=socket))
        self.assertEqual(host.commands(), [])

    def test_custom_external_env_path_survives_install_and_self_restart(self):
        with tempfile.TemporaryDirectory() as external_dir:
            external = Path(external_dir) / "production.env"
            external.write_text(self.env_file.read_text())
            socket = self.deploy / "docker.sock"; socket.touch()
            seen = []

            def run(args, **kwargs):
                seen.append((args, kwargs["env"]))
                return FakeHost()(args, **kwargs)

            self.assertTrue(agent_up(self.deploy, external, run=run, socket=socket))
            self.assertTrue(restart_self(self.deploy, external, run=run))
            for args, env in seen:
                self.assertEqual(args[args.index("--env-file") + 1], str(external.resolve()))
                self.assertEqual(env["QJUDGE_AGENT_ENV_FILE"], str(external.resolve()))
            self.assertEqual(seen[-1][0][-2:], ["--env-file", str(external.resolve())])
