"""Config parsing tests for env-driven DeepAgent settings."""

import pytest
from pydantic_settings import SettingsError

from config import Settings


def test_paths_accept_json_array_env(monkeypatch):
    monkeypatch.setenv("DEEPAGENT_SKILLS_PATHS", '["/tmp/skills-a", "/tmp/skills-b"]')
    monkeypatch.setenv("DEEPAGENT_MEMORY_PATHS", '["/tmp/memory.md"]')

    settings = Settings(_env_file=None)

    assert settings.deepagent_skills_paths == ["/tmp/skills-a", "/tmp/skills-b"]
    assert settings.deepagent_memory_paths == ["/tmp/memory.md"]


def test_paths_accept_comma_separated_env(monkeypatch):
    monkeypatch.setenv("DEEPAGENT_SKILLS_PATHS", "/tmp/skills-a, /tmp/skills-b")
    monkeypatch.setenv("DEEPAGENT_MEMORY_PATHS", "/tmp/memory-a.md,/tmp/memory-b.md")

    settings = Settings(_env_file=None)

    assert settings.deepagent_skills_paths == ["/tmp/skills-a", "/tmp/skills-b"]
    assert settings.deepagent_memory_paths == ["/tmp/memory-a.md", "/tmp/memory-b.md"]


def test_invalid_json_array_env_raises_settings_error(monkeypatch):
    monkeypatch.setenv("DEEPAGENT_SKILLS_PATHS", "[not-json")

    with pytest.raises(SettingsError):
        Settings(_env_file=None)
