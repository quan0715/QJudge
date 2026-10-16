"""What the host agent reports and does: release status, update checks, upgrades, containers, ingress probes."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

from ..envfile import load
from ..ingress import IngressEntry, ingress_entries
from ..release import HttpStatus, _ps_rows, http_status, read_version
from ..release_lock import release_locked
from ..stack import Runner, compose_project
from . import state
from .install import restart_self
from .jobs import create_job, git, latest_main, run_job

Spawn = Callable[[Callable[[], None]], None]

PROBE_TIMEOUT = 5
# The probes' own timeouts do not cover name resolution; a stuck lookup must not hold the answer.
PROBE_DEADLINE = PROBE_TIMEOUT + 1
DOCKER_TIMEOUT = 30
DETAIL_LIMIT = 200
SEPARATOR = "\x1f"
PROJECT_LABEL = "com.docker.compose.project"
SERVICE_LABEL = "com.docker.compose.service"


def _spawn_thread(work: Callable[[], None]) -> None:
    threading.Thread(target=work, daemon=True).start()


def _http_get(url: str) -> int:
    """Status of url as a client of the public address would see it; 0 when nothing answers."""
    parts = urlsplit(url)
    return http_status(url, parts.netloc, parts.scheme)


def _tcp_connect(host: str, port: int) -> None:
    socket.create_connection((host, port), timeout=PROBE_TIMEOUT).close()


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class AgentService:
    def __init__(
        self,
        deploy_dir: Path,
        env_file: Path,
        *,
        run: Runner = subprocess.run,
        popen: Callable[..., subprocess.Popen] = subprocess.Popen,
        http_status: HttpStatus = http_status,
        spawn: Spawn = _spawn_thread,
        http_get: Callable[[str], int] = _http_get,
        tcp_connect: Callable[[str, int], None] = _tcp_connect,
        after_success: Callable[[], None] | None = None,
    ):
        self.deploy_dir = deploy_dir
        self.env_file = env_file
        self.run, self.popen, self.http_status = run, popen, http_status
        self.spawn, self.http_get, self.tcp_connect = spawn, http_get, tcp_connect
        # The agent runs the code it was started with, so it restarts itself onto the new release.
        self.after_success = after_success or (lambda: restart_self(deploy_dir, env_file, run))

    def status(self) -> dict:
        # Probe the lock first: an agent job writes `running` before its CLI takes the lock, so a
        # lock seen held always has the running job visible by the time the job is read.
        locked = release_locked(self.deploy_dir)
        job = state.read_job(self.deploy_dir)
        version = read_version(self.deploy_dir)
        return {
            "version": {
                "current": version.get("current"),
                "previous": version.get("previous"),
                "deployed_at": self._deployed_at(),
            },
            "job": job,
            "log": state.log_tail(self.deploy_dir),
            # A CLI upgrade or rollback somebody started on the host, not a job of this agent.
            "external_busy": locked and (job or {}).get("status") != "running",
        }

    def _deployed_at(self) -> str | None:
        try:
            return _iso(os.stat(self.deploy_dir / ".version").st_mtime)
        except FileNotFoundError:
            return None

    def check(self) -> dict:
        repo = str(self.deploy_dir.parent)
        sha = latest_main(self.deploy_dir, self.run)
        current = read_version(self.deploy_dir).get("current")
        return {
            "latest": {"sha": sha, **self._commit(repo, sha)},
            "releases": self._releases(repo, current) if current else [],
            "update_available": current != sha,
        }

    def _commit(self, repo: str, sha: str) -> dict:
        result = git(self.run, repo, "log", "-1", "--format=%s%x1f%ct", sha)
        if result.returncode != 0:
            raise RuntimeError(f"git log {sha} failed: {(result.stderr or '').strip()}")
        subject, _, stamp = (result.stdout or "").rstrip("\n").rpartition(SEPARATOR)
        return {"subject": subject, "committed_at": _iso(int(stamp)) if stamp.isdigit() else None}

    def _releases(self, repo: str, current: str) -> list[dict]:
        try:
            result = git(self.run, repo, "log", "--first-parent", "--format=%H%x1f%s", f"{current}..origin/main")
        except RuntimeError:
            return []
        if result.returncode != 0:
            # The commit list is only a preview; it must not hide that an update exists.
            return []
        releases = []
        for line in (result.stdout or "").splitlines():
            sha, _, subject = line.partition(SEPARATOR)
            if sha:
                releases.append({"sha": sha, "subject": subject})
        return releases

    def start_upgrade(self, target: str, triggered_by: str) -> dict:
        job = create_job(self.deploy_dir, target, triggered_by, self.run)
        try:
            self.spawn(lambda: self._work(job))
        except Exception as error:
            # No worker will ever finish this job.
            self._fail(job, error)
            raise
        return job

    def _work(self, job: dict) -> None:
        try:
            done = run_job(self.deploy_dir, self.env_file, job, self.popen, self.run, self.http_status)
        except Exception as error:
            # Last resort: a job left `running` would block every later upgrade until the agent restarts.
            self._fail(job, error)
            return
        if done["status"] == "succeeded":
            try:
                self.after_success()
            except Exception as error:
                print(f"warning: agent not restarted: {error}", file=sys.stderr)

    def _fail(self, job: dict, error: Exception) -> None:
        try:
            state.append_log(self.deploy_dir, f"agent error: {error}\n")
        except OSError:
            pass
        recorded = state.read_job(self.deploy_dir)
        current = recorded if recorded and recorded.get("id") == job["id"] else job
        if current.get("status") != "running":
            return
        try:
            state.write_job(self.deploy_dir, {**current, "status": "failed", "finished_at": state.now()})
        except OSError:
            # mark_interrupted settles it when the agent next starts.
            pass

    def containers(self) -> dict:
        project = compose_project(load(self.env_file))
        ids = self._docker("ps", "-a", "-q", "--filter", f"label={PROJECT_LABEL}").split()
        rows = _ps_rows(self._docker("container", "inspect", *ids)) if ids else []
        containers = []
        for row in rows:
            labels = (row.get("Config") or {}).get("Labels") or {}
            owner = labels.get(PROJECT_LABEL, "")
            # The stack itself plus its addons (`<project>-storage`, `-media`, `-postal`, ...).
            if owner == project or owner.startswith(f"{project}-"):
                container_state = row.get("State") or {}
                containers.append({
                    "project": owner,
                    "service": labels.get(SERVICE_LABEL, ""),
                    "state": container_state.get("Status", ""),
                    "health": (container_state.get("Health") or {}).get("Status", ""),
                })
        return {"containers": sorted(containers, key=lambda c: (c["project"], c["service"]))}

    def _docker(self, *args: str) -> str:
        try:
            result = self.run(["docker", *args], capture_output=True, text=True, timeout=DOCKER_TIMEOUT)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"docker {args[0]} timed out after {DOCKER_TIMEOUT}s") from None
        if result.returncode != 0:
            raise RuntimeError(f"docker {args[0]} failed: {(result.stderr or '').strip()}")
        return result.stdout or ""

    def ingress(self) -> dict:
        entries = ingress_entries(load(self.env_file))
        rows: list[dict | None] = [None] * len(entries)

        def probe(index: int, entry: IngressEntry) -> None:
            rows[index] = self._probe(entry)

        threads = [threading.Thread(target=probe, args=(index, entry), daemon=True)
                   for index, entry in enumerate(entries)]
        for thread in threads:
            thread.start()
        deadline = time.monotonic() + PROBE_DEADLINE
        for thread in threads:
            thread.join(max(deadline - time.monotonic(), 0))
        return {"entries": [row or self._row(entry, False, "timed out") for row, entry in zip(rows, entries)]}

    def _probe(self, entry: IngressEntry) -> dict:
        try:
            ok, detail = self._reach(entry)
        except Exception as error:
            ok, detail = False, str(error) or type(error).__name__
        return self._row(entry, ok, detail)

    def _reach(self, entry: IngressEntry) -> tuple[bool, str]:
        if entry.expect == "tcp":
            host, _, port = entry.probe.rpartition(":")
            if not host or not port.isdigit():
                return False, f"not a host:port address: {entry.probe!r}"
            self.tcp_connect(host, int(port))
            return True, "connected"
        parts = urlsplit(entry.probe)
        if parts.scheme not in ("http", "https") or not parts.netloc:
            return False, f"not an absolute URL (is QJUDGE_PUBLIC_ORIGIN set?): {entry.probe!r}"
        status = self.http_get(entry.probe)
        ok = status == 200 if entry.expect == "200" else 0 < status < 500
        return ok, f"HTTP {status}"

    @staticmethod
    def _row(entry: IngressEntry, ok: bool, detail: str) -> dict:
        return {"id": entry.id, "public": entry.public, "target": entry.target, "probe": entry.probe,
                "ok": ok, "detail": detail[:DETAIL_LIMIT]}
