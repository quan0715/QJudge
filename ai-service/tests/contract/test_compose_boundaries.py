"""Deployment contracts for the autonomous AI Service boundary."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
COMPOSE_FILES = (
    "docker-compose.yml",
    "docker-compose.dev.yml",
    "docker-compose.test.yml",
)


def _compose(filename: str) -> dict:
    return yaml.safe_load((REPOSITORY_ROOT / filename).read_text())


def _environment_keys(service: dict) -> set[str]:
    environment = service.get("environment", {})
    if isinstance(environment, dict):
        return set(environment)
    return {str(item).split("=", 1)[0] for item in environment}


def _command(service: dict) -> str:
    command = service.get("command", "")
    return command if isinstance(command, str) else " ".join(command)


@pytest.mark.parametrize("filename", COMPOSE_FILES)
def test_ai_processes_share_only_ai_credentials(filename: str) -> None:
    services = _compose(filename)["services"]
    for name in ("ai-migrate", "ai-service", "ai-worker", "ai-scheduler"):
        service = services[name]
        assert "env_file" not in service
        keys = _environment_keys(service)
        assert "AI_DATABASE_URL" in keys
        assert "DATABASE_URL" not in keys
        assert "DB_PASSWORD" not in keys
        assert "POSTGRES_PASSWORD" not in keys

    django_names = (
        ("backend-test", "celery-test")
        if filename == "docker-compose.test.yml"
        else ("backend", "celery", "celery-high", "celery-beat")
    )
    for name in django_names:
        assert "AI_DATABASE_URL" not in _environment_keys(services[name])


@pytest.mark.parametrize("filename", COMPOSE_FILES)
def test_ai_worker_uses_dedicated_queue_and_namespace(filename: str) -> None:
    services = _compose(filename)["services"]
    command = _command(services["ai-worker"])
    assert "--queues=qjudge-ai" in command
    assert "backend.apps.ai.tasks" not in command
    keys = _environment_keys(services["ai-worker"])
    assert {"AI_REDIS_URL", "AI_QUEUE_NAME", "AI_QUEUE_KEY_PREFIX"} <= keys


@pytest.mark.parametrize("filename", COMPOSE_FILES)
def test_runtime_waits_for_one_shot_ai_migration(filename: str) -> None:
    services = _compose(filename)["services"]
    migration = services["ai-migrate"]
    assert migration.get("restart") == "no"
    assert "alembic upgrade head" in _command(migration)
    assert "infrastructure.checkpoints.langgraph_store setup" in _command(migration)
    for name in ("ai-service", "ai-worker", "ai-scheduler"):
        assert (
            services[name]["depends_on"]["ai-migrate"]["condition"]
            == "service_completed_successfully"
        )
    for name in ("ai-worker", "ai-scheduler"):
        assert services[name]["healthcheck"]["disable"] is True


@pytest.mark.parametrize("filename", COMPOSE_FILES)
def test_database_bootstrap_owns_database_credential_creation(filename: str) -> None:
    services = _compose(filename)["services"]
    postgres_name = (
        "postgres-test" if filename == "docker-compose.test.yml" else "postgres"
    )
    bootstrap = services["ai-db-bootstrap"]
    assert bootstrap["depends_on"][postgres_name]["condition"] == "service_healthy"
    assert "bootstrap-ai-database.sh" in _command(bootstrap)
    postgres_volumes = services[postgres_name].get("volumes", [])
    assert all("init_db.sql" not in str(volume) for volume in postgres_volumes)


@pytest.mark.parametrize("filename", COMPOSE_FILES)
def test_backend_has_only_the_ai_http_boundary_and_private_signing_key(
    filename: str,
) -> None:
    services = _compose(filename)["services"]
    backend_name = "backend-test" if filename == "docker-compose.test.yml" else "backend"
    backend = services[backend_name]
    assert "env_file" not in backend
    keys = _environment_keys(backend)
    assert "AI_SERVICE_URL" in keys
    assert "AI_DATABASE_URL" not in keys
    assert "AI_OAUTH_SIGNING_PRIVATE_KEY_FILE" in keys
    assert any(
        "ai-oauth-ed25519-private.pem" in str(volume)
        and str(volume).endswith(":ro")
        for volume in backend.get("volumes", [])
    )

    for name in ("ai-migrate", "ai-service", "ai-worker", "ai-scheduler"):
        assert all(
            "ai-oauth-ed25519-private.pem" not in str(volume)
            for volume in services[name].get("volumes", [])
        )


def test_test_compose_routes_external_dependencies_to_fake_adapters() -> None:
    services = _compose("docker-compose.test.yml")["services"]
    assert "fake-ai-adapters" in services
    for name in ("ai-service", "ai-worker"):
        environment = services[name]["environment"]
        values = environment.values() if isinstance(environment, dict) else environment
        rendered = "\n".join(map(str, values))
        assert "fake-ai-adapters" in rendered


def test_test_backend_waits_for_idempotent_oauth_key_bootstrap() -> None:
    services = _compose("docker-compose.test.yml")["services"]
    bootstrap = services["ai-oauth-bootstrap"]
    assert "bootstrap_ai_oauth_keys.py" in _command(bootstrap)
    assert (
        services["backend-test"]["depends_on"]["ai-oauth-bootstrap"]["condition"]
        == "service_completed_successfully"
    )


def test_database_bootstrap_is_fail_closed_and_never_echoes_secrets() -> None:
    source = (REPOSITORY_ROOT / "scripts/db/bootstrap-ai-database.sh").read_text()
    assert "set -eu" in source
    assert "set -x" not in source
    assert "NOSUPERUSER" in source
    assert "NOCREATEDB" in source
    assert "NOCREATEROLE" in source
    assert "REVOKE ALL ON DATABASE" in source
    assert "POSTGRES_ADMIN_USER, Django, and AI role names must be distinct" in source
    for secret in ("$POSTGRES_ADMIN_PASSWORD", "$DB_PASSWORD", "$AI_DB_PASSWORD"):
        assert f'echo "{secret}"' not in source


def test_production_deploy_validates_roles_and_bootstraps_oauth_before_render() -> None:
    source = (REPOSITORY_ROOT / "scripts/deploy-prod.sh").read_text()
    oauth = source.index("python3 scripts/bootstrap_ai_oauth_keys.py")
    render = source.index('docker compose "${COMPOSE_FILES[@]}" config --quiet')
    assert oauth < render
    assert "POSTGRES_ADMIN_USER, DB_USER, and AI_DB_USER must be distinct" in source
    assert "rolsuper OR rolcreatedb OR rolcreaterole" in source
