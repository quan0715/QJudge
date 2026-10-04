"""Upgrade the application stack to a git ref, or roll back to the previous one."""

from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

from .check import check_env
from .envfile import load, write_private
from .stack import Runner, app_compose, bootstrap_secrets, ensure_network

HttpStatus = Callable[[str, str, str], int]
Sleep = Callable[[float], None]

DATABASES = ("online_judge", "qjudge_ai")
APP_SERVICES = ("backend", "ai-service", "integrity-resident", "celery", "ai-worker", "integrity-reconciler")
MIGRATIONS = (
    ("backend", ("python", "manage.py", "migrate", "--noinput")),
    ("ai-service", ("sh", "-c", "python -m alembic upgrade head && python -m infrastructure.checkpoints.langgraph_store setup")),
)
# Validate with the new image before stopping the running application.
MODEL_CONFIG_CHECK = ("ai-service", ("python", "-m", "infrastructure.agent.model_config"))
JUDGE_REMOTE = "ghcr.io/quan0715/qjudge/judge"
KEEP_BACKUPS = 10
KEEP_IMAGES = 3
POSTGRES_TIMEOUT = 120
APP_TIMEOUT = 300
POLL_SECONDS = 5


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def http_status(url: str, host_header: str, proto: str) -> int:
    """Status of url as the reverse proxy would send it; redirects are not followed."""
    request = urllib.request.Request(url, headers={"Host": host_header, "X-Forwarded-Proto": proto})
    try:
        with urllib.request.build_opener(_NoRedirect).open(request, timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except (urllib.error.URLError, OSError):
        return 0


def read_version(deploy_dir: Path) -> dict[str, str]:
    path = deploy_dir / ".version"
    return {k: v for k, v in load(path).items() if v} if path.is_file() else {}


def _write_version(deploy_dir: Path, current: str, previous: str | None) -> None:
    write_private(deploy_dir / ".version", f"current={current}\n" + (f"previous={previous}\n" if previous else ""))


def _version(sha: str) -> str:
    return "sha-" + sha[:12]


def _ps_rows(text: str) -> list[dict]:
    """`compose ps --format json` prints an array or one object per line."""
    text = (text or "").strip()
    try:
        if text.startswith("["):
            return json.loads(text)
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    except ValueError:
        return []


class _Stack:
    def __init__(self, deploy_dir: Path, env_file: Path, run: Runner, sleep: Sleep, http: HttpStatus):
        self.deploy_dir = deploy_dir
        self.repo = deploy_dir.parent
        self.env_file = env_file
        self.env = load(env_file)
        self.run, self.sleep, self.http = run, sleep, http

    def git(self, *args: str) -> subprocess.CompletedProcess:
        return self.run(["git", "-C", str(self.repo), *args], capture_output=True, text=True)

    def head(self) -> str:
        return self.git("rev-parse", "HEAD").stdout.strip()

    def checkout(self, ref: str) -> bool:
        result = self.git("checkout", "--detach", ref)
        if result.returncode != 0:
            print((result.stderr or "").strip() or f"git checkout {ref} failed")
        return result.returncode == 0

    def compose(self, version: str, *args: str, **kwargs) -> subprocess.CompletedProcess:
        command = [*app_compose(self.deploy_dir, self.env_file, self.env), *args]
        return self.run(command, env={**os.environ, "QJUDGE_VERSION": version}, **kwargs)

    def judge_image(self) -> bool:
        image = f"qjudge/judge:{_version(self.head())}"
        if self.run(["docker", "image", "inspect", image], capture_output=True).returncode == 0:
            return True
        source = self.git("rev-parse", "HEAD:backend/judge")
        if source.returncode != 0 or not source.stdout.strip():
            return False
        remote = f"{JUDGE_REMOTE}:source-{source.stdout.strip()}"
        if self.run(["docker", "pull", remote]).returncode == 0:
            return self.run(["docker", "tag", remote, image]).returncode == 0
        judge = self.repo / "backend" / "judge"
        build = ["docker", "build", "-t", image, "-f", str(judge / "Dockerfile.judge"), str(judge)]
        return self.run(build).returncode == 0

    def healthy(self, version: str, services: tuple[str, ...]) -> bool:
        result = self.compose(version, "ps", "--format", "json", capture_output=True, text=True)
        health: dict[str, set] = {}
        for row in _ps_rows(result.stdout) if result.returncode == 0 else []:
            health.setdefault(row.get("Service"), set()).add(row.get("Health"))
        return all(health.get(service) == {"healthy"} for service in services)

    def app_services_ready(self, version: str) -> bool:
        result = self.compose(version, "ps", "--all", "--quiet", *APP_SERVICES,
                              capture_output=True, text=True)
        containers = result.stdout.split() if result.returncode == 0 else []
        if not containers:
            return False
        result = self.run(["docker", "container", "inspect", *containers], capture_output=True, text=True)
        if result.returncode != 0:
            return False
        rows = _ps_rows(result.stdout)
        if len(rows) != len(containers):
            return False
        services = set()
        for row in rows:
            config, state = row.get("Config", {}), row.get("State", {})
            services.add(config.get("Labels", {}).get("com.docker.compose.service"))
            if state.get("Status") != "running":
                return False
            # Inspect the target container, not this CLI version's assumptions:
            # Docker merges image healthchecks and Compose overrides (including NONE).
            check = (config.get("Healthcheck") or {}).get("Test", [])
            has_check = bool(check) and check[0] != "NONE"
            health = state.get("Health") or {}
            if (has_check or health) and health.get("Status") != "healthy":
                return False
        return services == set(APP_SERVICES)

    def app_ready(self, version: str) -> bool:
        if not self.app_services_ready(version):
            return False
        host = self.env.get("FRONTEND_BIND_ADDRESS", "").strip() or "127.0.0.1"
        host = "127.0.0.1" if host in ("0.0.0.0", "::") else f"[{host}]" if ":" in host else host
        url = f"http://{host}:{self.env.get('FRONTEND_PORT', '').strip() or '8080'}/api/health/"
        origin = urlsplit(self.env.get("QJUDGE_PUBLIC_ORIGIN", ""))
        return self.http(url, origin.netloc, origin.scheme or "http") == 200

    def wait(self, check: Callable[[], bool], timeout: int) -> bool:
        waited = 0
        while not check():
            if waited >= timeout:
                return False
            self.sleep(POLL_SECONDS)
            waited += POLL_SECONDS
        return True

    def start(self, version: str) -> bool:
        if self.compose(version, "up", "-d", "--remove-orphans").returncode != 0:
            return False
        return self.wait(lambda: self.app_ready(version), APP_TIMEOUT)

    def backup(self, version: str, sha: str) -> bool:
        backups = self.deploy_dir / "backups"
        backups.mkdir(mode=0o700, exist_ok=True)
        target = backups / f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{sha[:12]}"
        target.mkdir(mode=0o700)
        for database in DATABASES:
            descriptor = os.open(target / f"{database}.dump", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                result = self.compose(version, "exec", "-T", "postgres", "pg_dump", "-U", "qjudge_admin",
                                      "-d", database, "-Fc", stdout=output)
            if result.returncode != 0:
                shutil.rmtree(target)
                return False
        for old in _backup_dirs(self.deploy_dir)[:-KEEP_BACKUPS]:
            shutil.rmtree(old)
        return True

    def restore_hint(self) -> None:
        backups = _backup_dirs(self.deploy_dir)
        if not backups:
            return
        restore = shlex.join([*app_compose(self.deploy_dir, self.env_file, self.env), "exec", "-T", "postgres",
                              "pg_restore", "-U", "qjudge_admin", "--clean", "--dbname"])
        print(f"Database not restored. Latest backup: {backups[-1]}")
        print(f"To restore: {restore} <db> < {backups[-1]}/<db>.dump  (db: {', '.join(DATABASES)})")

    def prune_images(self, keep: set[str]) -> None:
        listing = self.run(["docker", "image", "ls", "--format", "{{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}"],
                           capture_output=True, text=True)
        tags: dict[str, list[tuple[str, str]]] = {}
        for line in (listing.stdout or "").splitlines():
            parts = line.split("\t")
            if len(parts) == 3 and parts[0].startswith("qjudge/") and parts[1].startswith("sha-"):
                tags.setdefault(parts[0], []).append((parts[2], parts[1]))
        for repository, items in tags.items():
            for _, tag in sorted(items, reverse=True)[KEEP_IMAGES:]:
                if tag not in keep:
                    self.run(["docker", "image", "rm", f"{repository}:{tag}"], capture_output=True)


def _backup_dirs(deploy_dir: Path) -> list[Path]:
    backups = deploy_dir / "backups"
    return sorted(p for p in backups.iterdir() if p.is_dir()) if backups.is_dir() else []


def upgrade(
    deploy_dir: Path,
    env_file: Path,
    ref: str,
    run: Runner = subprocess.run,
    sleep: Sleep = time.sleep,
    http_status: HttpStatus = http_status,
) -> int:
    stack = _Stack(deploy_dir, env_file, run, sleep, http_status)
    if stack.git("fetch", "--tags", "--prune", "origin").returncode != 0:
        print("warning: git fetch failed; using local refs")
    recorded = read_version(deploy_dir)
    current = recorded.get("current")
    # CD checks out the target first, so HEAD is not always the deployed release.
    restore = current or stack.head()
    if not stack.checkout(ref):
        return 1
    sha = stack.head()
    version = _version(sha)

    def abort(message: str, hint: bool = False) -> int:
        print(message)
        stack.checkout(restore)
        if hint:
            stack.restore_hint()
        return 1

    errors = check_env(stack.env)
    for error in errors:
        print(error)
    if errors:
        return abort(f"{len(errors)} problem(s) in {env_file}")
    ensure_network(run)
    if not stack.judge_image():
        return abort("judge image unavailable")
    if stack.compose(version, "build").returncode != 0:
        return abort("build failed")
    service, command = MODEL_CONFIG_CHECK
    if stack.compose(version, "run", "--rm", "--no-deps", service, *command).returncode != 0:
        return abort("deploy/ai/models.yml is invalid; services still run the previous version")
    if (stack.compose(version, "up", "-d", "postgres", "pgbouncer", "redis").returncode != 0
            or not stack.wait(lambda: stack.healthy(version, ("postgres",)), POSTGRES_TIMEOUT)):
        return abort("postgres is not healthy")
    if not stack.backup(version, sha):
        return abort("database backup failed")
    # `up` creates every container before starting any, and integrity-resident bind-mounts
    # files that only the secrets bootstrap writes, so the secrets must exist beforehand.
    if not bootstrap_secrets(deploy_dir, f"qjudge/backend:{version}", run):
        return abort("secrets bootstrap failed; application services still run the previous version", hint=True)
    # postgres, pgbouncer and redis already run; --no-deps keeps the new app services stopped.
    for service, command in MIGRATIONS:
        if stack.compose(version, "run", "--rm", "--no-deps", service, *command).returncode != 0:
            return abort(f"{service} migrations failed; application services still run the previous version",
                         hint=True)

    if not stack.start(version):
        print(f"{version} is not healthy")
        if current:
            stack.checkout(current)
            stack.judge_image()
            stack.compose(_version(current), "up", "-d", "--remove-orphans")
            print(f"Started {_version(current)} again")
        else:
            stack.checkout(restore)
        stack.restore_hint()
        return 1
    previous = current if current != sha else recorded.get("previous")
    _write_version(deploy_dir, sha, previous)
    stack.prune_images({version} | ({_version(previous)} if previous else set()))
    print(f"Upgraded to {version}")
    return 0


def rollback(
    deploy_dir: Path,
    env_file: Path,
    run: Runner = subprocess.run,
    sleep: Sleep = time.sleep,
    http_status: HttpStatus = http_status,
) -> int:
    recorded = read_version(deploy_dir)
    previous = recorded.get("previous")
    if not previous:
        print(f"{deploy_dir / '.version'}: no previous version to roll back to")
        return 1
    stack = _Stack(deploy_dir, env_file, run, sleep, http_status)
    if not stack.checkout(previous):
        return 1
    version = _version(previous)
    if not stack.judge_image():
        stack.checkout(recorded["current"])
        return 1
    if not stack.start(version):
        current = recorded["current"]
        print(f"{version} is not healthy; starting {_version(current)} again")
        stack.checkout(current)
        stack.compose(_version(current), "up", "-d", "--remove-orphans")
        return 1
    _write_version(deploy_dir, previous, recorded.get("current"))
    print(f"Rolled back to {version}")
    stack.restore_hint()
    return 0
