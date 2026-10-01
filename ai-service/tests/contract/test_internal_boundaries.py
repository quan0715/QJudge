"""Source-level ownership gates for the autonomous AI Service runtime."""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _python_sources(*roots: Path) -> list[Path]:
    ignored = {".deepagents", ".venv", ".mypy_cache", ".pytest_cache", ".ruff_cache", "__pycache__"}
    sources: list[Path] = []
    for root in roots:
        candidates = [root] if root.is_file() else root.rglob("*.py")
        sources.extend(
            source
            for source in candidates
            if source.suffix == ".py" and ignored.isdisjoint(source.parts)
        )
    return sources


def _forbidden_imports(
    *, roots: list[Path], forbidden_top_level: tuple[str, ...]
) -> list[str]:
    violations: list[str] = []
    for source in _python_sources(*roots):
        tree = ast.parse(source.read_text(), filename=str(source))
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for name in names:
                if name.split(".", 1)[0] in forbidden_top_level:
                    violations.append(
                        f"{source.relative_to(ROOT)}:{node.lineno}: {name}"
                    )
    return violations


def test_domain_and_application_do_not_import_io_frameworks() -> None:
    assert _forbidden_imports(
        roots=[ROOT / "domain", ROOT / "application"],
        forbidden_top_level=("fastapi", "sqlalchemy", "celery", "redis", "boto3", "mcp"),
    ) == []
