"""Small POSIX durability primitives shared by Worker-owned append logs."""

from __future__ import annotations

import os
import stat
from pathlib import Path


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        while True:
            try:
                os.fsync(descriptor)
                return
            except InterruptedError:
                continue
    finally:
        os.close(descriptor)


def ensure_durable_directory(path: Path) -> None:
    """Create a directory chain and durably record every parent/name pair."""
    missing: list[Path] = []
    cursor = path
    while not cursor.exists():
        missing.append(cursor)
        if cursor.parent == cursor:
            break
        cursor = cursor.parent
    for directory in reversed(missing):
        os.mkdir(directory, 0o700)
    if not path.is_dir():
        raise NotADirectoryError(str(path))
    for directory in reversed(missing):
        fsync_directory(directory)
        fsync_directory(directory.parent)
    if not missing:
        fsync_directory(path)
        if path.parent != path:
            fsync_directory(path.parent)


def open_durable_file(path: Path, flags: int, mode: int = 0o600) -> int:
    """Open a file and fsync a newly created directory entry before returning."""
    existed = path.exists()
    descriptor = os.open(path, flags, mode)
    if existed:
        return descriptor
    try:
        while True:
            try:
                os.fsync(descriptor)
                break
            except InterruptedError:
                continue
        fsync_directory(path.parent)
    except BaseException:
        os.close(descriptor)
        raise
    return descriptor


def durable_replace(source: Path, target: Path) -> None:
    if source.parent != target.parent:
        raise ValueError("durable replacement must stay within one directory")
    os.replace(source, target)
    fsync_directory(target.parent)


def is_directory_descriptor(descriptor: int) -> bool:
    return stat.S_ISDIR(os.fstat(descriptor).st_mode)
