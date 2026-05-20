from __future__ import annotations

import json
from pathlib import Path
from typing import Any


SECRET_KEY_FRAGMENTS = ("token", "secret", "password")


def _assert_no_secrets(value: Any, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            lower_key = str(key).lower()
            if any(fragment in lower_key for fragment in SECRET_KEY_FRAGMENTS):
                raise ValueError(f"manifest must not contain token or secret field: {path}.{key}")
            _assert_no_secrets(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _assert_no_secrets(child, f"{path}[{index}]")


def write_manifest(path: Path, payload: dict[str, Any]) -> None:
    _assert_no_secrets(payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
