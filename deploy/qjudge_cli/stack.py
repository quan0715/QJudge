"""Compose commands for the QJudge application stack."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Callable

from .schema import Env

NETWORK = "qjudge"
Runner = Callable[..., subprocess.CompletedProcess]


def compose_project(env: Env) -> str:
    return env.get("COMPOSE_PROJECT_NAME", "").strip() or "qjudge"


def app_compose(deploy_dir: Path, env_file: Path, env: Env) -> list[str]:
    return [
        "docker", "compose", "--project-name", compose_project(env),
        "--project-directory", str(deploy_dir), "--env-file", str(env_file),
        "-f", str(deploy_dir / "compose.yml"), "-f", str(deploy_dir / "compose.build.yml"),
    ]


def ensure_network(run: Runner) -> None:
    if run(["docker", "network", "inspect", NETWORK], capture_output=True).returncode != 0:
        run(["docker", "network", "create", NETWORK], check=True)
