"""Install the host agent: a container in its own compose project that runs `agent serve`."""

from __future__ import annotations

import os
import secrets
from pathlib import Path

from ..envfile import load, write_private
from ..schema import Env
from ..stack import Runner, compose_project
from .state import read_job

AGENT_TOKEN_NAME = "agent-token"
DOCKER_SOCKET = Path("/var/run/docker.sock")


def ensure_token(deploy_dir: Path) -> str:
    """The shared secret between the agent and the backend; created once and then kept."""
    path = deploy_dir / "secrets" / AGENT_TOKEN_NAME
    if not path.is_file():
        path.parent.mkdir(exist_ok=True)
        # 0600 through mkstemp: the backend container reads it as root.
        write_private(path, secrets.token_urlsafe(32))
    return path.read_text(encoding="utf-8").strip()


def agent_variables(deploy_dir: Path, socket: Path = DOCKER_SOCKET) -> dict[str, str] | None:
    """Variables deploy/agent/compose.yml needs; None when there is no Docker socket to hand over."""
    try:
        docker_gid = socket.stat().st_gid
    except OSError:
        return None
    return {
        "QJUDGE_REPO_DIR": str(deploy_dir.parent.resolve()),
        "QJUDGE_AGENT_UID": str(os.getuid()),
        "QJUDGE_AGENT_GID": str(os.getgid()),
        "QJUDGE_DOCKER_GID": str(docker_gid),
    }


def agent_compose(deploy_dir: Path, env_file: Path, env: Env) -> list[str]:
    return [
        "docker", "compose", "--project-name", f"{compose_project(env)}-agent",
        "--project-directory", str(deploy_dir), "--env-file", str(env_file.resolve()),
        "-f", str(deploy_dir / "agent" / "compose.yml"),
    ]


def agent_up(deploy_dir: Path, env_file: Path, run: Runner, socket: Path = DOCKER_SOCKET) -> bool:
    """Build the agent image and recreate its container. Never raises: it runs after a release succeeded."""
    variables = agent_variables(deploy_dir, socket)
    if variables is None:
        print(f"warning: agent not started: {socket} not found")
        return False
    try:
        # Release callers already hold the lock; an admitted web job must survive
        # even if a terminal release acquired it before that job started its CLI.
        if (read_job(deploy_dir) or {}).get("status") == "running":
            print("warning: agent not restarted: an upgrade job is running")
            return False
        ensure_token(deploy_dir)
        command = agent_compose(deploy_dir, env_file, load(env_file))
        env = {**os.environ, **variables, "QJUDGE_AGENT_ENV_FILE": str(env_file.resolve())}
        for action in (["build"], ["up", "-d", "--force-recreate"]):
            if run([*command, *action], env=env).returncode != 0:
                print(f"warning: agent not started: docker compose {' '.join(action)} failed")
                return False
    except OSError as error:
        print(f"warning: agent not started: {error}")
        return False
    return True


def restart_self(deploy_dir: Path, env_file: Path, run: Runner) -> bool:
    """Rebuild the agent from a one-off container, which a recreate of the agent itself does not stop."""
    try:
        command = [*agent_compose(deploy_dir, env_file, load(env_file)),
                   "run", "-d", "--rm", "--no-deps", "agent", "python3", "deploy/qjudge", "agent", "up",
                   "--env-file", str(env_file.resolve())]
        env = {**os.environ, **(agent_variables(deploy_dir) or {}),
               "QJUDGE_AGENT_ENV_FILE": str(env_file.resolve())}
        if run(command, env=env).returncode == 0:
            return True
        print("warning: agent not restarted: docker compose run failed")
    except OSError as error:
        print(f"warning: agent not restarted: {error}")
    return False
