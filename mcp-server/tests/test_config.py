import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_issuer(extra_env: dict[str, str]) -> str:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in ("QJUDGE_PUBLIC_ORIGIN", "OAUTH_ISSUER_URL", "MCP_PUBLIC_URL")
    }
    environment.update(extra_env)
    result = subprocess.run(
        [sys.executable, "-c", "import json, config; print(json.dumps(config.OAUTH_ISSUER_URL))"],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip())


def test_issuer_comes_from_public_origin():
    issuer = load_issuer(
        {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu/", "OAUTH_ISSUER_URL": "https://ignored.example"}
    )

    assert issuer == "https://judge.example.edu"


def test_issuer_falls_back_to_legacy_key():
    assert load_issuer({"OAUTH_ISSUER_URL": "https://legacy.example/"}) == "https://legacy.example"


def load_public_url(extra_env: dict[str, str]) -> str:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in ("QJUDGE_PUBLIC_ORIGIN", "OAUTH_ISSUER_URL", "MCP_PUBLIC_URL")
    }
    environment.update(extra_env)
    result = subprocess.run(
        [sys.executable, "-c", "import json, config; print(json.dumps(config.MCP_PUBLIC_URL))"],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip())


def test_public_url_defaults_to_public_origin():
    assert load_public_url({"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu/"}) == "https://judge.example.edu"


def test_legacy_public_url_still_wins():
    url = load_public_url(
        {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu", "MCP_PUBLIC_URL": "https://mcp.example.edu/"}
    )

    assert url == "https://mcp.example.edu"
