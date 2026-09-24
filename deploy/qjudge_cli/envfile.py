"""Parse simple KEY=VALUE .env files."""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Mapping


def parse(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        values[key] = _parse_value(value.strip())
    return values


def _parse_value(value: str) -> str:
    """Mirror Compose: quoted values end at the closing quote; otherwise
    " #" starts a comment."""
    if value[:1] in ("\"", "'"):
        end = value.find(value[0], 1)
        if end != -1:
            return value[1:end]
    return re.split(r"\s+#", value, maxsplit=1)[0]


def load(path: Path) -> dict[str, str]:
    return parse(path.read_text(encoding="utf-8"))


def write_private(path: Path, text: str) -> None:
    """Replace path through an owner-only temp file in the same directory."""
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(text)
    os.replace(temporary, path)


def write_values(path: Path, updates: Mapping[str, str]) -> None:
    """Set keys by replacing their KEY= lines or appending them."""
    pending = dict(updates)
    lines = path.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if "=" in line and key in pending:
            lines[index] = f"{key}={pending.pop(key)}"
    lines += [f"{key}={value}" for key, value in pending.items()]
    write_private(path, "\n".join(lines) + "\n")
