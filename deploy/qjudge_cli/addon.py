"""Run bundled addons, each a compose project next to QJudge."""

from __future__ import annotations

import secrets
import subprocess
from pathlib import Path

from .check import check_env
from .envfile import write_values
from .media_config import write_media_config
from .schema import Env
from .stack import Runner, compose_project, ensure_network

ADDONS = {
    "postal": {"mode_key": "EMAIL_MODE"},
    "storage": {
        "mode_key": "STORAGE_MODE",
        "up": ["up", "-d", "minio"],
        "init": ["run", "--rm", "storage-init"],
    },
    "media": {
        "mode_key": "MEDIA_MODE",
        "up": ["up", "-d", "livekit"],
    },
}
ACTIONS = ("up", "init", "check", "status", "backup", "upgrade")


def _compose(deploy_dir: Path, env_file: Path, name: str, project: str) -> list[str]:
    return [
        "docker", "compose", "--project-name", f"{project}-{name}", "--project-directory", str(deploy_dir), "--env-file", str(env_file),
        "-f", str(deploy_dir / "addons" / name / "compose.yml"),
    ]


def addon_command(deploy_dir: Path, env_file: Path, name: str, action: str, project: str = "qjudge") -> list[str]:
    return [*_compose(deploy_dir, env_file, name, project), *ADDONS[name][action]]


def run_addon(
    deploy_dir: Path,
    env_file: Path,
    env: Env,
    name: str,
    action: str,
    run: Runner = subprocess.run,
    *, backup_dir: Path | None = None,
) -> int:
    if name == "postal":
        from .postal import run_postal
        return run_postal(deploy_dir, env_file, env, action, run, backup_dir)
    if action not in ("up", "init") or backup_dir is not None:
        print(f"Unsupported action or backup option for {name}")
        return 1
    mode_key = ADDONS[name]["mode_key"]
    if env.get(mode_key, "").strip() != "bundled":
        print(f"{mode_key} is not bundled; the {name} addon is not used")
        return 1
    if name == "media" and action == "init":
        updates = {}
        if not env.get("LIVEKIT_API_KEY", "").strip():
            updates["LIVEKIT_API_KEY"] = secrets.token_hex(16)
        if not env.get("LIVEKIT_API_SECRET", "").strip():
            updates["LIVEKIT_API_SECRET"] = secrets.token_urlsafe(32)
        if updates:
            write_values(env_file, updates)
            print(f"Filled {', '.join(updates)} in {env_file}")
        else:
            print("LiveKit credentials are already set")
        return 0
    problems = check_env(env)
    for problem in problems:
        print(problem)
    if problems:
        return 1
    ensure_network(run)
    project = compose_project(env)
    # Compose cannot see bind-mounted file changes, so recreate LiveKit only
    # when its rendered config changed.
    if name == "media" and write_media_config(deploy_dir, env):
        return run([*_compose(deploy_dir, env_file, name, project), "up", "-d", "--force-recreate", "livekit"]).returncode
    return run(addon_command(deploy_dir, env_file, name, action, project)).returncode
