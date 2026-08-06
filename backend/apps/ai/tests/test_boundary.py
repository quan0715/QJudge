"""Ownership boundary for Django's AI compatibility BFF."""

from pathlib import Path


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
