"""Run bundled addons, each a compose project next to QJudge."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Callable

from .check import check_env
from .schema import Env

NETWORK = "qjudge"
ADDONS = {
    "storage": {
        "mode_key": "STORAGE_MODE",
        "up": ["up", "-d", "minio"],
        "init": ["run", "--rm", "storage-init"],
    },
}
ACTIONS = ("up", "init")


def addon_command(deploy_dir: Path, env_file: Path, name: str, action: str, project: str = "qjudge") -> list[str]:
    return [
        "docker", "compose", "--project-name", f"{project}-{name}", "--project-directory", str(deploy_dir), "--env-file", str(env_file),
        "-f", str(deploy_dir / "addons" / name / "compose.yml"), *ADDONS[name][action],
    ]


def run_addon(
    deploy_dir: Path,
    env_file: Path,
    env: Env,
    name: str,
    action: str,
    run: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> int:
    mode_key = ADDONS[name]["mode_key"]
    if env.get(mode_key, "").strip() != "bundled":
        print(f"{mode_key} is not bundled; the {name} addon is not used")
        return 1
    problems = check_env(env)
    for problem in problems:
        print(problem)
    if problems:
        return 1
    if run(["docker", "network", "inspect", NETWORK], capture_output=True).returncode != 0:
        run(["docker", "network", "create", NETWORK], check=True)
    return run(addon_command(deploy_dir, env_file, name, action, env.get("COMPOSE_PROJECT_NAME", "").strip() or "qjudge")).returncode
