"""Check that compose files only pass schema keys and hold no app defaults."""

from __future__ import annotations

import re

from .schema import KEYS_BY_NAME

INTERNAL_VARIABLES = {"QJUDGE_VERSION"}
TOPOLOGY_DEFAULTS = {"FRONTEND_BIND_ADDRESS", "FRONTEND_PORT", "COMPOSE_PROJECT_NAME"}
REFERENCE = re.compile(r"(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?([-?])([^}]*))?\}")


def lint_compose_text(text: str) -> list[str]:
    problems: list[str] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if line.lstrip().startswith("#"):
            continue
        for match in REFERENCE.finditer(line):
            name, operator, default = match.group(1), match.group(2), match.group(3)
            if name not in KEYS_BY_NAME and name not in INTERNAL_VARIABLES:
                problems.append(f"line {number}: {name} is not in the schema")
            elif operator == "-" and default and name not in TOPOLOGY_DEFAULTS:
                problems.append(
                    f"line {number}: {name} must not have a default in compose; "
                    "defaults belong to the app"
                )
    return problems
