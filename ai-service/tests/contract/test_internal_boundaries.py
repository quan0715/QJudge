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


def test_legacy_runtime_packages_are_absent() -> None:
    forbidden = [
        *_python_sources(ROOT / "services"),
        ROOT / "routers" / "chat.py",
        ROOT / "models" / "schemas.py",
    ]
    assert [
        str(path.relative_to(ROOT)) for path in forbidden if path.exists()
    ] == []


def test_main_mounts_only_canonical_routers() -> None:
    source = (ROOT / "main.py").read_text()
    assert "routers.chat" not in source
    assert 'prefix="/api/chat"' not in source
    for module in ("sessions", "runs", "artifacts", "system"):
        assert f"api.routers.{module}" in source


def test_domain_and_application_do_not_import_io_frameworks() -> None:
    assert _forbidden_imports(
        roots=[ROOT / "domain", ROOT / "application"],
        forbidden_top_level=("fastapi", "sqlalchemy", "celery", "redis", "boto3", "mcp"),
    ) == []


def test_active_ai_service_has_no_cost_or_credit_model() -> None:
    source = "\n".join(
        path.read_text()
        for path in _python_sources(ROOT)
        if "tests" not in path.relative_to(ROOT).parts
    )
    for forbidden in (
        "cost_cents",
        "cost_usd",
        "credits",
        "usage_accounted",
        "AI_CREDIT_SCALE_PER_CREDIT",
        "usage_to_credits",
        "PRICING",
    ):
        assert forbidden not in source


def test_production_has_no_legacy_runtime_imports_or_routes() -> None:
    sources = _python_sources(
        ROOT / "main.py",
        ROOT / "api",
        ROOT / "application",
        ROOT / "domain",
        ROOT / "infrastructure",
        ROOT / "worker",
    )
    violations: list[str] = []
    for path in sources:
        source = path.read_text()
        for forbidden in (
            "from services",
            "import services",
            "/api/chat/stream",
            "/api/chat/resume",
            "/api/chat/answer",
        ):
            if forbidden in source:
                violations.append(f"{path.relative_to(ROOT)}: {forbidden}")
    assert violations == []
