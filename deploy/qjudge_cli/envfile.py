"""Parse simple KEY=VALUE .env files."""

from __future__ import annotations

import re
from pathlib import Path


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
