import json
import os
import subprocess
import sys
from pathlib import Path

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


BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _load_seccomp_profile(extra_env: dict[str, str]) -> str | None:
    environment = os.environ.copy()
    environment.pop("DOCKER_SECCOMP_PROFILE", None)
    environment.pop("DOCKER_SECCOMP_DISABLED", None)
    environment.update(extra_env)
    script = (
        "import json\n"
        "from config.settings import base\n"
        "print(json.dumps(base.DOCKER_SECCOMP_PROFILE))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_empty_seccomp_profile_keeps_default_profile():
    profile = _load_seccomp_profile({"DOCKER_SECCOMP_PROFILE": ""})

    assert profile is not None
    assert profile.endswith("seccomp_profiles/cpp.json")


def test_seccomp_can_be_disabled_explicitly():
    assert _load_seccomp_profile({"DOCKER_SECCOMP_DISABLED": "true"}) is None
