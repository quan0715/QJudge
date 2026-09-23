import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[3]
ORIGIN = "https://judge.example.edu"
CLEARED_KEYS = (
    "QJUDGE_PUBLIC_ORIGIN",
    "FRONTEND_URL",
    "OAUTH_ISSUER_URL",
    "CORS_ALLOWED_ORIGINS",
    "CSRF_TRUSTED_ORIGINS",
    "MARKDOWN_IMAGE_PUBLIC_BASE_URL",
    "MEDIA_MODE",
    "LIVE_MONITORING_ENABLED",
    "LIVE_MONITORING_PROVIDER",
    "LIVEKIT_PUBLIC_URL",
    "LIVEKIT_INTERNAL_URL",
    "DB_SSLMODE",
)


def load_settings(module: str, extra_env: dict[str, str], names: list[str]) -> dict:
    environment = os.environ.copy()
    for key in CLEARED_KEYS:
        environment.pop(key, None)
    environment.update(extra_env)
    script = (
        "import json\n"
        f"from config.settings import {module} as s\n"
        f"print(json.dumps({{n: getattr(s, n) for n in {names!r}}}, default=str))\n"
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


def test_urls_derive_from_public_origin_and_ignore_legacy_keys():
    values = load_settings(
        "base",
        {
            "QJUDGE_PUBLIC_ORIGIN": ORIGIN + "/",
            "FRONTEND_URL": "https://ignored.example",
            "OAUTH_ISSUER_URL": "https://ignored.example",
            "MARKDOWN_IMAGE_PUBLIC_BASE_URL": "https://ignored.example",
        },
        ["FRONTEND_URL", "OAUTH_ISSUER_URL", "MARKDOWN_IMAGE_PUBLIC_BASE_URL"],
    )

    assert values == {
        "FRONTEND_URL": ORIGIN,
        "OAUTH_ISSUER_URL": ORIGIN,
        "MARKDOWN_IMAGE_PUBLIC_BASE_URL": ORIGIN,
    }


def test_frontend_url_defaults_to_local_vite_without_origin():
    values = load_settings("base", {}, ["FRONTEND_URL", "OAUTH_ISSUER_URL"])

    assert values == {
        "FRONTEND_URL": "http://localhost:5173",
        "OAUTH_ISSUER_URL": "http://localhost:5173",
    }


def test_prod_trusts_only_the_public_origin():
    values = load_settings(
        "prod",
        {
            "DJANGO_ENV": "production",
            "SECRET_KEY": "deploy-settings-test-secret",
            "QJUDGE_PUBLIC_ORIGIN": ORIGIN,
            "CORS_ALLOWED_ORIGINS": "https://other.example",
            "CSRF_TRUSTED_ORIGINS": "https://other.example",
        },
        ["CORS_ALLOWED_ORIGINS", "CSRF_TRUSTED_ORIGINS"],
    )

    assert values == {
        "CORS_ALLOWED_ORIGINS": [ORIGIN],
        "CSRF_TRUSTED_ORIGINS": [ORIGIN],
    }


def test_prod_db_sslmode_is_disabled_regardless_of_env():
    values = load_settings(
        "prod",
        {
            "DJANGO_ENV": "production",
            "SECRET_KEY": "deploy-settings-test-secret",
            "QJUDGE_PUBLIC_ORIGIN": ORIGIN,
            "DATABASE_URL": "postgresql://u:p@pgbouncer:5432/online_judge",
        },
        ["DATABASES"],
    )

    assert values["DATABASES"]["default"]["OPTIONS"]["sslmode"] == "disable"


def test_dev_trusts_origin_and_local_vite():
    values = load_settings(
        "dev",
        {"QJUDGE_PUBLIC_ORIGIN": ORIGIN},
        ["CSRF_TRUSTED_ORIGINS"],
    )

    assert ORIGIN in values["CSRF_TRUSTED_ORIGINS"]
    assert "http://localhost:5173" in values["CSRF_TRUSTED_ORIGINS"]


MEDIA_NAMES = ["LIVE_MONITORING_ENABLED", "LIVE_MONITORING_PROVIDER", "LIVEKIT_INTERNAL_URL"]


def test_media_mode_external_enables_livekit_and_derives_server_url():
    values = load_settings(
        "base",
        {"MEDIA_MODE": "external", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu/"},
        MEDIA_NAMES,
    )

    assert values == {
        "LIVE_MONITORING_ENABLED": True,
        "LIVE_MONITORING_PROVIDER": "livekit",
        "LIVEKIT_INTERNAL_URL": "https://live.example.edu",
    }


def test_media_disabled_by_default():
    values = load_settings("base", {}, MEDIA_NAMES)

    assert values["LIVE_MONITORING_ENABLED"] is False
    assert values["LIVE_MONITORING_PROVIDER"] == "disabled"


def test_media_mode_wins_over_legacy_flag():
    values = load_settings(
        "base",
        {"MEDIA_MODE": "disabled", "LIVE_MONITORING_ENABLED": "true"},
        MEDIA_NAMES,
    )

    assert values["LIVE_MONITORING_ENABLED"] is False


def test_legacy_flag_still_enables_media_without_media_mode():
    values = load_settings("base", {"LIVE_MONITORING_ENABLED": "true"}, MEDIA_NAMES)

    assert values["LIVE_MONITORING_ENABLED"] is True


def test_explicit_internal_url_overrides_derived_url():
    values = load_settings(
        "base",
        {
            "MEDIA_MODE": "bundled",
            "LIVEKIT_PUBLIC_URL": "ws://localhost:7883",
            "LIVEKIT_INTERNAL_URL": "http://livekit:7883",
        },
        MEDIA_NAMES,
    )

    assert values["LIVEKIT_INTERNAL_URL"] == "http://livekit:7883"
