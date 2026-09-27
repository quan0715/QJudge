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


def secrets_commands(deploy_dir: Path, image: str) -> list[list[str]]:
    """Create missing AI OAuth and Integrity keys under deploy/secrets; existing keys are kept."""
    secrets = deploy_dir / "secrets"
    base = ["docker", "run", "--rm", "--network", "none", "--user", "0:0",
            "-v", f"{deploy_dir / 'bootstrap'}:/bootstrap:ro"]
    return [
        [*base, "-v", f"{secrets}:/oauth-secrets", image,
         "python", "/bootstrap/bootstrap_ai_oauth_keys.py",
         "--private-key", "/oauth-secrets/ai-oauth-ed25519-private.pem",
         "--public-key", "/oauth-secrets/ai-oauth-ed25519-public.pem"],
        [*base, "-v", f"{secrets / 'integrity'}:/bootstrap-secrets", image,
         "python", "/bootstrap/bootstrap_integrity_secrets.py",
         "--secrets-dir", "/bootstrap-secrets", "--resident-gid", "10001"],
    ]


def bootstrap_secrets(deploy_dir: Path, image: str, run: Runner) -> bool:
    return all(run(command).returncode == 0 for command in secrets_commands(deploy_dir, image))


def ensure_network(run: Runner) -> None:
    if run(["docker", "network", "inspect", NETWORK], capture_output=True).returncode != 0:
        run(["docker", "network", "create", NETWORK], check=True)
