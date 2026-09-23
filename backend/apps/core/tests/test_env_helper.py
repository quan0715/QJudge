from config.env import env

KEY = "QJUDGE_TEST_ENV_HELPER"


def test_env_returns_default_when_unset(monkeypatch):
    monkeypatch.delenv(KEY, raising=False)

    assert env(KEY, "fallback") == "fallback"


def test_env_returns_none_without_default(monkeypatch):
    monkeypatch.delenv(KEY, raising=False)

    assert env(KEY) is None


def test_env_treats_empty_string_as_unset(monkeypatch):
    monkeypatch.setenv(KEY, "")

    assert env(KEY, "fallback") == "fallback"


def test_env_treats_whitespace_as_unset(monkeypatch):
    monkeypatch.setenv(KEY, "   ")

    assert env(KEY, "fallback") == "fallback"


def test_env_returns_stripped_value(monkeypatch):
    monkeypatch.setenv(KEY, "  value  ")

    assert env(KEY, "fallback") == "value"
