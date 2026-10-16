"""Host-wide lock that serializes upgrades and rollbacks."""

from __future__ import annotations

import fcntl
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

# Set to "1" by a caller that already holds the lock (CD runs the CLI inside `flock`).
RELEASE_LOCK_HELD_ENV = "QJUDGE_RELEASE_LOCK_HELD"
# Marks a CLI run started by a host agent job rather than by a person or CD.
AGENT_JOB_ENV = "QJUDGE_AGENT_JOB"

# Retrying rides out the instant release_locked() holds the lock to probe it.
WAIT_SECONDS = 1.0
POLL_SECONDS = 0.1


class ReleaseBusy(Exception):
    """Another upgrade or rollback holds the release lock."""


def release_lock_path(deploy_dir: Path) -> Path:
    return deploy_dir / ".release.lock"


def _open(deploy_dir: Path) -> int:
    return os.open(release_lock_path(deploy_dir), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)


@contextmanager
def release_lock(deploy_dir: Path) -> Iterator[None]:
    if os.environ.get(RELEASE_LOCK_HELD_ENV) == "1":
        yield
        return
    deadline = time.monotonic() + WAIT_SECONDS
    with os.fdopen(_open(deploy_dir), "w") as lock:
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise ReleaseBusy from None
                time.sleep(POLL_SECONDS)
        yield


def release_locked(deploy_dir: Path) -> bool:
    """Whether a release currently holds the lock; takes it only for the duration of the probe."""
    with os.fdopen(_open(deploy_dir), "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        return False
