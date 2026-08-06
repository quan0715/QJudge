"""Ownership boundary for Django's AI compatibility BFF."""

from pathlib import Path


def _scan_text_files(
    root: Path,
    forbidden_symbols: tuple[str, ...],
    *,
    excluded_directories: frozenset[Path] = frozenset(),
    excluded_files: frozenset[Path] = frozenset(),
) -> list[str]:
    violations: list[str] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path in excluded_files or any(
            excluded == path or excluded in path.parents
            for excluded in excluded_directories
        ):
            continue
        if {"__pycache__", ".pytest_cache"}.intersection(path.parts):
            continue
        try:
            source = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for symbol in forbidden_symbols:
            if symbol in source:
                violations.append(f"{path.relative_to(root)}: {symbol}")
    return violations


def test_django_ai_app_is_only_a_bff() -> None:
    root = Path(__file__).resolve().parents[1]
    forbidden_paths = {
        "tasks.py",
        "admin.py",
        "signals.py",
        "credits.py",
        "middleware.py",
        "services/run_runtime.py",
        "services/stream_proxy.py",
        "services/stream_response.py",
        "services/artifact_storage.py",
    }
    assert all(not (root / path).exists() for path in forbidden_paths)

    source = "\n".join(
        path.read_text()
        for path in (
            root / "views.py",
            root / "artifact_views.py",
            root / "serializers.py",
        )
    )
    for symbol in (
        "AISession",
        "AIMessage",
        "AIChatRun",
        "AIStreamEvent",
        "AIExecutionLog",
        "UserAICredit",
        "AIArtifact",
        "shared_task",
        "AsyncResult",
        "AI_SERVICE_INTERNAL_TOKEN",
    ):
        assert symbol not in source


def test_backend_has_no_retired_ai_runtime_ownership() -> None:
    backend_root = Path(__file__).resolve().parents[3]
    assert (backend_root / "manage.py").is_file()
    django_violations = _scan_text_files(
        backend_root,
        (
            "AIChatRun",
            "AIArtifact",
            "AIStreamEvent",
            "AIExecutionLog",
            "AIMessage",
            "UserAICredit",
            "AISession",
            "run_ai_chat",
            "recover_stale_ai",
            "AI_SERVICE_INTERNAL_TOKEN",
        ),
        excluded_directories=frozenset({backend_root / "apps" / "ai" / "migrations"}),
        excluded_files=frozenset({Path(__file__).resolve()}),
    )
    assert django_violations == []
