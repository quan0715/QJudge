"""The agent's persisted upgrade job: one JSON file and one log under deploy/.agent/."""

from __future__ import annotations

import json
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from ..envfile import write_private
from ..release_lock import release_locked


def _agent_dir(deploy_dir: Path) -> Path:
    return deploy_dir / ".agent"


def job_path(deploy_dir: Path) -> Path:
    return _agent_dir(deploy_dir) / "job.json"


def log_path(deploy_dir: Path) -> Path:
    return _agent_dir(deploy_dir) / "job.log"


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ensure_dir(deploy_dir: Path) -> None:
    _agent_dir(deploy_dir).mkdir(mode=0o700, exist_ok=True)


def read_job(deploy_dir: Path) -> dict | None:
    try:
        job = json.loads(job_path(deploy_dir).read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return None
    return job if isinstance(job, dict) else None


def write_job(deploy_dir: Path, job: dict) -> None:
    _ensure_dir(deploy_dir)
    write_private(job_path(deploy_dir), json.dumps(job, indent=2) + "\n")


def reset_log(deploy_dir: Path) -> None:
    _ensure_dir(deploy_dir)
    write_private(log_path(deploy_dir), "")


def append_log(deploy_dir: Path, text: str) -> None:
    with log_path(deploy_dir).open("a", encoding="utf-8") as log:
        log.write(text)


def log_tail(deploy_dir: Path, lines: int = 200) -> str:
    try:
        with log_path(deploy_dir).open(encoding="utf-8", errors="replace") as log:
            return "".join(deque(log, maxlen=max(lines, 0)))
    except FileNotFoundError:
        return ""


def mark_interrupted(deploy_dir: Path) -> None:
    """Close a job left `running` by an agent that died; call it before serving requests.

    Between create_job and the CLI taking the release lock a live job also looks lockless,
    so this is only safe while no job can be starting.
    """
    job = read_job(deploy_dir)
    if job and job.get("status") == "running" and not release_locked(deploy_dir):
        write_job(deploy_dir, {**job, "status": "interrupted", "finished_at": now()})
