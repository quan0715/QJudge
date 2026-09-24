"""Parse simple KEY=VALUE .env files."""

from __future__ import annotations

import os
import re
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


def write_values(path: Path, updates: Mapping[str, str]) -> None:
    """Fill selected empty keys while keeping all other .env lines intact."""
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    existing = parse("".join(lines))
    pending = {key: value for key, value in updates.items() if not existing.get(key, "").strip()}
    for index, line in enumerate(lines):
        match = re.match(r"^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=)", line)
        if match and match.group(2) in pending:
            key = match.group(2)
            lines[index] = f"{match.group(1)}{key}{match.group(3)}{pending.pop(key)}\n"
    if pending:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.extend(f"{key}={value}\n" for key, value in pending.items())
    path.chmod(0o600)
    descriptor = os.open(path, os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.writelines(lines)
