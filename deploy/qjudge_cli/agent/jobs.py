"""Start an upgrade job and run `qjudge upgrade` as a subprocess, recording progress."""

from __future__ import annotations

import os
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Callable

from ..release import STEP_MARKER, STEPS, HttpStatus, site_ready
from ..release_lock import AGENT_JOB_ENV, ReleaseBusy, release_locked
from ..stack import Runner
from . import state

Popen = Callable[..., subprocess.Popen]

# Bounds a git call that waits on the network, so a stalled fetch cannot hold the start lock forever.
GIT_TIMEOUT = 60

# Makes the busy check and the job write one step, so two requests cannot both pass the check.
_start_lock = threading.Lock()


class TargetNotLatest(Exception):
    def __init__(self, latest: str):
        super().__init__(f"target is not the latest main: {latest}")
        self.latest = latest


def git(run: Runner, repo: str, *args: str) -> subprocess.CompletedProcess:
    command = ["git", "-C", repo, *args]
    try:
        return run(command, capture_output=True, text=True, timeout=GIT_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"git {' '.join(args)} timed out after {GIT_TIMEOUT}s") from None


def latest_main(deploy_dir: Path, run: Runner) -> str:
    repo = str(deploy_dir.parent)
    fetch = git(run, repo, "fetch", "origin", "main")
    if fetch.returncode != 0:
        # A stale origin/main would let an outdated target through as "latest".
        raise RuntimeError(f"git fetch origin main failed: {(fetch.stderr or '').strip()}")
    head = git(run, repo, "rev-parse", "origin/main")
    sha = (head.stdout or "").strip()
    if head.returncode != 0 or not sha:
        raise RuntimeError(f"git rev-parse origin/main failed: {(head.stderr or '').strip()}")
    return sha


def create_job(deploy_dir: Path, target: str, triggered_by: str, run: Runner) -> dict:
    with _start_lock:
        running = (state.read_job(deploy_dir) or {}).get("status") == "running"
        # An OSError from the probe (missing deploy dir, symlinked lock) is the caller's to report.
        if running or release_locked(deploy_dir):
            raise ReleaseBusy
        latest = latest_main(deploy_dir, run)
        if target != latest:
            raise TargetNotLatest(latest)
        job = {
            "id": uuid.uuid4().hex,
            "target": target,
            "triggered_by": triggered_by,
            "started_at": state.now(),
            "finished_at": None,
            "status": "running",
            "step": None,
            "site_healthy": None,
        }
        state.reset_log(deploy_dir)
        state.write_job(deploy_dir, job)
        return job


def _step_of(line: str) -> str | None:
    if not line.startswith(STEP_MARKER):
        return None
    step = line[len(STEP_MARKER):].strip()
    return step if step in STEPS else None


def _execute(deploy_dir: Path, job: dict, popen: Popen) -> int:
    command = [str(deploy_dir / "qjudge"), "upgrade", job["target"]]
    try:
        # Unbuffered so plain output lines reach the log as they happen; no stdin so a prompt cannot hang the job.
        process = popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, encoding="utf-8", errors="replace",
                        env={**os.environ, AGENT_JOB_ENV: "1", "PYTHONUNBUFFERED": "1"})
    except OSError as error:
        try:
            state.append_log(deploy_dir, f"cannot start {command[0]}: {error}\n")
        except OSError:
            pass
        return 1
    for line in process.stdout:
        try:
            state.append_log(deploy_dir, line)
            step = _step_of(line)
            if step and step != job["step"]:
                job["step"] = step
                state.write_job(deploy_dir, job)
        except OSError:
            # Keep draining so the CLI never blocks on a full pipe.
            continue
    return process.wait()


def _site_healthy(deploy_dir: Path, env_file: Path, run: Runner, http_status: HttpStatus) -> bool:
    try:
        return bool(site_ready(deploy_dir, env_file, run=run, http_status=http_status))
    except Exception:
        # The job must still reach its final status when the health probe itself breaks.
        return False


def run_job(deploy_dir: Path, env_file: Path, job: dict, popen: Popen, run: Runner,
            http_status: HttpStatus) -> dict:
    job = dict(job)
    code = _execute(deploy_dir, job, popen)
    job["status"] = "succeeded" if code == 0 else "failed"
    if code != 0:
        job["site_healthy"] = _site_healthy(deploy_dir, env_file, run, http_status)
    job["finished_at"] = state.now()
    state.write_job(deploy_dir, job)
    return job
