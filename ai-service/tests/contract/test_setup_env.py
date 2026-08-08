"""Contracts for the user-managed deployment environment surface."""

from __future__ import annotations

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
EXPECTED_ACTIVE_KEYS = {
    "QJUDGE_PUBLIC_ORIGIN",
    "SECRET_KEY",
    "POSTGRES_ADMIN_PASSWORD",
    "DB_PASSWORD",
    "AI_DB_PASSWORD",
    "CREDENTIAL_LEASE_SECRET",
    "OBJECT_STORAGE_ENDPOINT_URL",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    "OBJECT_STORAGE_ACCESS_KEY",
    "OBJECT_STORAGE_SECRET_KEY",
}
GENERATED_SECRET_KEYS = {
    "SECRET_KEY",
    "POSTGRES_ADMIN_PASSWORD",
    "DB_PASSWORD",
    "AI_DB_PASSWORD",
    "CREDENTIAL_LEASE_SECRET",
}


def _active_env_keys() -> set[str]:
    keys = set()
    for line in (REPOSITORY_ROOT / ".env.example").read_text().splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            keys.add(stripped.split("=", 1)[0])
    return keys


def test_root_env_example_exposes_only_minimum_deployment_inputs() -> None:
    assert _active_env_keys() == EXPECTED_ACTIVE_KEYS


def test_root_env_example_excludes_internal_and_special_purpose_settings() -> None:
    forbidden = {
        "DJANGO_ENV",
        "DB_HOST",
        "REDIS_URL",
        "AI_DATABASE_URL",
        "AI_QUEUE_NAME",
        "DOCKER_GID",
        "TUNNEL_TOKEN",
        "LOADTEST_OBJECT_STORAGE_ENDPOINT_URL",
        "MCP_WIDGET_CLASSROOM_LIST_JS",
    }
    assert not forbidden & _active_env_keys()
