import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[3]
ORIGIN = "https://judge.example.edu"
DATABASE_URL = "postgresql://u:p@pgbouncer:5432/online_judge"
CLEARED_KEYS = (
    "OBJECT_STORAGE_BUCKET", "ANTICHEAT_RAW_BUCKET", "INTEGRITY_ARCHIVE_BUCKET",
    "MARKDOWN_IMAGE_S3_BUCKET", "OBJECT_STORAGE_REGION", "OBJECT_STORAGE_ENDPOINT_URL",
    "STORAGE_MODE", "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    "DATABASE_URL", "DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_PORT",
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
    "DEBUG",
    "ALLOWED_HOSTS",
    "DB_CONN_MAX_AGE",
    "MCP_PUBLIC_URL",
)


def run_settings(module: str, extra_env: dict[str, str], names: list[str]):
    environment = os.environ.copy()
    for key in CLEARED_KEYS:
        environment.pop(key, None)
    environment["DATABASE_URL"] = DATABASE_URL
    environment.update(extra_env)
    script = (
        "import json\n"
        f"from config.settings import {module} as s\n"
        f"print(json.dumps({{n: getattr(s, n) for n in {names!r}}}, default=str))\n"
    )
    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def load_settings(module: str, extra_env: dict[str, str], names: list[str]) -> dict:
    result = run_settings(module, extra_env, names)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_urls_derive_from_public_origin():
    values = load_settings(
        "base",
        {
            "QJUDGE_PUBLIC_ORIGIN": ORIGIN + "/",
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


def test_prod_debug_and_hosts_ignore_env():
    values = load_settings(
        "prod",
        {
            "DJANGO_ENV": "production",
            "SECRET_KEY": "deploy-settings-test-secret",
            "QJUDGE_PUBLIC_ORIGIN": ORIGIN,
            "DEBUG": "True",
            "ALLOWED_HOSTS": "evil.example",
        },
        ["DEBUG", "ALLOWED_HOSTS"],
    )

    assert values["DEBUG"] is False
    assert values["ALLOWED_HOSTS"] == ["judge.example.edu", "localhost", "127.0.0.1", "backend"]


def test_prod_requires_public_origin():
    result = run_settings(
        "prod",
        {"DJANGO_ENV": "production", "SECRET_KEY": "deploy-settings-test-secret"},
        ["ALLOWED_HOSTS"],
    )

    assert result.returncode != 0
    assert "QJUDGE_PUBLIC_ORIGIN must be set in production" in result.stderr


def test_dev_debug_and_hosts_ignore_env():
    values = load_settings(
        "dev",
        {"QJUDGE_PUBLIC_ORIGIN": ORIGIN, "DEBUG": "False", "ALLOWED_HOSTS": "tunnel.example"},
        ["DEBUG", "ALLOWED_HOSTS", "CSRF_TRUSTED_ORIGINS"],
    )

    assert values["DEBUG"] is True
    assert values["ALLOWED_HOSTS"] == ["*"]
    assert "https://tunnel.example" not in values["CSRF_TRUSTED_ORIGINS"]


def test_conn_max_age_is_zero_regardless_of_env():
    values = load_settings("base", {"DB_CONN_MAX_AGE": "60"}, ["DATABASES"])

    assert values["DATABASES"]["default"]["CONN_MAX_AGE"] == 0


def test_database_comes_only_from_database_url():
    values = load_settings(
        "base",
        {"DB_HOST": "legacy-host", "DB_NAME": "legacy", "DB_USER": "legacy", "DB_PORT": "6543"},
        ["DATABASES"],
    )

    database = values["DATABASES"]["default"]
    assert (database["HOST"], database["NAME"], database["USER"], database["PORT"]) == (
        "pgbouncer", "online_judge", "u", "5432",
    )


def test_database_url_is_required():
    result = run_settings("base", {"DATABASE_URL": "", "DB_HOST": "legacy-host"}, ["DATABASES"])

    assert result.returncode != 0
    assert "DATABASE_URL must be set" in result.stderr


def test_storage_region_is_constant():
    values = load_settings(
        "base",
        {
            "OBJECT_STORAGE_REGION": "auto",
            "OBJECT_STORAGE_ENDPOINT_URL": "https://account.r2.cloudflarestorage.com",
        },
        ["OBJECT_STORAGE_REGION"],
    )

    assert values == {"OBJECT_STORAGE_REGION": "us-east-1"}


def test_bundled_storage_public_endpoint_defaults_to_main_origin():
    values = load_settings("base", {
        "STORAGE_MODE": "bundled", "QJUDGE_PUBLIC_ORIGIN": ORIGIN + ":8443/",
    }, ["OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"])
    assert values == {"OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": ORIGIN + ":8443"}


def test_external_storage_does_not_default_to_main_origin():
    values = load_settings("base", {
        "STORAGE_MODE": "external", "QJUDGE_PUBLIC_ORIGIN": ORIGIN,
    }, ["OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"])
    assert values == {"OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": ""}


def test_explicit_public_storage_endpoint_is_kept():
    values = load_settings("base", {
        "STORAGE_MODE": "bundled", "QJUDGE_PUBLIC_ORIGIN": ORIGIN,
        "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://files.example.edu",
    }, ["OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"])
    assert values == {"OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://files.example.edu"}
