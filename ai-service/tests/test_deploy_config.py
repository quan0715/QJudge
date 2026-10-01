import asyncio

import pytest

from config import Settings, get_settings
from infrastructure.checkpoints import langgraph_store
from infrastructure.database.base import create_async_engine_from_settings
from main import _oauth_locations


def test_oauth_issuer_comes_from_public_origin(monkeypatch):
    monkeypatch.setenv("QJUDGE_PUBLIC_ORIGIN", "https://judge.example.edu/")

    issuer, _ = _oauth_locations(Settings(_env_file=None))

    assert issuer == "https://judge.example.edu"


def test_engine_pool_is_bounded(monkeypatch):
    monkeypatch.setenv("AI_DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
    get_settings.cache_clear()
    try:
        engine = create_async_engine_from_settings()
        assert engine.pool.size() == 5
        assert engine.pool._max_overflow == 5
    finally:
        get_settings.cache_clear()


class _StopSetup(Exception):
    pass


def test_checkpoint_pool_sets_schema_without_startup_options(monkeypatch):
    captured = {}

    def fake_pool(**kwargs):
        captured.update(kwargs)
        raise _StopSetup

    monkeypatch.setattr(langgraph_store, "AsyncConnectionPool", fake_pool)
    store = langgraph_store.LangGraphCheckpointStore(
        database_url="postgresql://user:pass@localhost:5432/db",
        schema="ai_checkpoint",
    )

    with pytest.raises(_StopSetup):
        asyncio.run(store.setup())

    assert captured["max_size"] == 5
    assert "options" not in captured["kwargs"]

    executed = []

    class FakeConnection:
        async def execute(self, statement):
            executed.append(repr(statement))

    asyncio.run(captured["configure"](FakeConnection()))
    assert "search_path" in executed[0]
    assert "ai_checkpoint" in executed[0]


def test_artifact_bucket_comes_from_single_bucket(monkeypatch):
    monkeypatch.setenv("OBJECT_STORAGE_BUCKET", "qjudge")

    assert Settings(_env_file=None).artifact_s3_bucket == "qjudge"


@pytest.mark.parametrize("mode, expected", [
    ("bundled", "https://judge.example.edu:8443"), ("external", ""),
])
def test_public_storage_defaults_to_origin_only_in_bundled_mode(monkeypatch, mode, expected):
    monkeypatch.setenv("STORAGE_MODE", mode)
    monkeypatch.setenv("QJUDGE_PUBLIC_ORIGIN", "https://judge.example.edu:8443/")
    monkeypatch.delenv("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", raising=False)
    assert Settings(_env_file=None).artifact_storage_public_endpoint_url == expected


def test_explicit_public_storage_endpoint_is_kept(monkeypatch):
    monkeypatch.setenv("STORAGE_MODE", "bundled")
    monkeypatch.setenv("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", "https://files.example.edu")
    assert Settings(_env_file=None).artifact_storage_public_endpoint_url == "https://files.example.edu"
