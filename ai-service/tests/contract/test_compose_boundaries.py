"""Deployment contracts for the autonomous AI Service boundary."""

from __future__ import annotations

import os
import re
import subprocess
import textwrap
from copy import deepcopy
from pathlib import Path
from urllib.parse import unquote, urlsplit

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


def _environment_mapping(service: dict) -> dict[str, str]:
    environment = service.get("environment", {})
    if isinstance(environment, dict):
        return {str(key): str(value) for key, value in environment.items()}
    return {
        str(item).split("=", 1)[0]: str(item).split("=", 1)[1]
        for item in environment
        if "=" in str(item)
    }


def _command(service: dict) -> str:
    command = service.get("command", "")
    return command if isinstance(command, str) else " ".join(command)


def _minimal_production_env() -> str:
    return textwrap.dedent(
        """\
        QJUDGE_PUBLIC_ORIGIN=https://qjudge.invalid
        POSTGRES_ADMIN_PASSWORD=secure-admin-password
        DB_PASSWORD=secure-web-password
        AI_DB_PASSWORD=secure-ai-password
        CREDENTIAL_LEASE_SECRET=secure-credential-lease-secret-long-enough
        SECRET_KEY=secure-production-secret
        OBJECT_STORAGE_ENDPOINT_URL=https://storage.invalid
        OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://storage.invalid
        OBJECT_STORAGE_ACCESS_KEY=secure-storage-key
        OBJECT_STORAGE_SECRET_KEY=secure-storage-secret
        """
    )


def _write_executable(path: Path, source: str) -> None:
    path.write_text(source)
    path.chmod(0o755)


def _rendered_compose(filename: str, extra_environment: dict[str, str] | None = None) -> dict:
    environment = {
        "POSTGRES_ADMIN_USER": "render_admin",
        "POSTGRES_ADMIN_PASSWORD": "render-admin-password",
        "DB_NAME": "render_web_db",
        "DB_USER": "render_web",
        "DB_PASSWORD": "render-web-password",
        "AI_DB_NAME": "render_ai_db",
        "AI_DB_USER": "render_ai",
        "AI_DB_PASSWORD": "render-ai-password",
        "AI_DATABASE_URL": (
            "postgresql+psycopg://render_ai:render-ai-password"
            "@postgres:5432/render_ai_db"
        ),
        "SECRET_KEY": "render-secret",
        "FRONTEND_URL": "https://frontend.example.test",
        "OAUTH_ISSUER_URL": "https://issuer.example.test",
        "ALLOWED_HOSTS": "example.test",
        "CORS_ALLOWED_ORIGINS": "https://frontend.example.test",
        "CSRF_TRUSTED_ORIGINS": "https://frontend.example.test",
        "OBJECT_STORAGE_ENDPOINT_URL": "https://storage.example.test",
        "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://cdn.example.test",
        "OBJECT_STORAGE_ACCESS_KEY": "render-storage-key",
        "OBJECT_STORAGE_SECRET_KEY": "render-storage-secret",
        "CREDENTIAL_LEASE_SECRET": "render-credential-lease-secret-long-enough",
        "DOCKER_GID": "999",
        "DOCKER_SOCKET_UID": "1000",
    }
    environment.update(extra_environment or {})
    compose = deepcopy(_compose(filename))
    expression = re.compile(r"^\$\{([A-Z0-9_]+)(?::[-?](.*))?\}$")
    services = compose["services"]
    for service in services.values():
        parent_name = service.get("extends", {}).get("service")
        if parent_name and "environment" not in service:
            service["environment"] = deepcopy(
                services[parent_name].get("environment", {})
            )
    for service in services.values():
        values = service.get("environment", {})
        if not isinstance(values, dict):
            continue
        for key, value in values.items():
            if not isinstance(value, str):
                continue
            match = expression.fullmatch(value)
            if match:
                variable, default = match.groups()
                values[key] = environment.get(variable, default or "")
    return compose


@pytest.mark.parametrize("filename", COMPOSE_FILES)
def test_ai_processes_share_only_ai_credentials(filename: str) -> None:
    services = _compose(filename)["services"]
    for name in ("ai-migrate", "ai-service", "ai-worker"):
        service = services[name]
        assert "env_file" not in service
        keys = _environment_keys(service)
        assert "AI_DATABASE_URL" in keys
        assert "DATABASE_URL" not in keys
        assert "DB_PASSWORD" not in keys
        assert "POSTGRES_PASSWORD" not in keys

    scheduler_keys = _environment_keys(services["ai-scheduler"])
    assert {"AI_REDIS_URL", "AI_QUEUE_NAME", "AI_QUEUE_KEY_PREFIX"} <= scheduler_keys
    assert "AI_DATABASE_URL" not in scheduler_keys

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
    for name in ("ai-service", "ai-worker"):
        assert (
            services[name]["depends_on"]["ai-migrate"]["condition"]
            == "service_completed_successfully"
        )
    for name in ("ai-worker", "ai-scheduler"):
        assert services[name]["healthcheck"]["disable"] is True


@pytest.mark.parametrize("filename", COMPOSE_FILES)
def test_ai_processes_receive_only_the_secrets_they_use(filename: str) -> None:
    services = _compose(filename)["services"]
    migrate = _environment_keys(services["ai-migrate"])
    api = _environment_keys(services["ai-service"])
    worker = _environment_keys(services["ai-worker"])
    scheduler = _environment_keys(services["ai-scheduler"])

    assert migrate == {"AI_DATABASE_URL", "AI_DB_NAME", "AI_DB_USER"}
    assert not {"OPENAI_API_KEY", "DEEPSEEK_API_KEY"} & api
    assert {"OPENAI_API_KEY", "DEEPSEEK_API_KEY"} <= worker
    assert scheduler == {"AI_REDIS_URL", "AI_QUEUE_KEY_PREFIX", "AI_QUEUE_NAME"}
    for keys in (migrate, scheduler):
        assert "AI_ARTIFACT_STORAGE_SECRET_KEY" not in keys
    assert "AI_ARTIFACT_STORAGE_SECRET_KEY" in api
    assert "AI_ARTIFACT_STORAGE_SECRET_KEY" in worker


@pytest.mark.parametrize("filename", COMPOSE_FILES)
def test_rendered_ai_database_identity_matches_bootstrap(filename: str) -> None:
    services = _rendered_compose(filename)["services"]
    bootstrap = services["ai-db-bootstrap"]["environment"]
    for name in ("ai-migrate", "ai-service", "ai-worker"):
        environment = services[name]["environment"]
        parsed = urlsplit(environment["AI_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1))
        assert unquote(parsed.username or "") == bootstrap["AI_DB_USER"]
        assert unquote(parsed.path.lstrip("/")) == bootstrap["AI_DB_NAME"]
        assert environment["AI_DB_USER"] == bootstrap["AI_DB_USER"]
        assert environment["AI_DB_NAME"] == bootstrap["AI_DB_NAME"]


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
    assert any(str(volume).endswith(":ro") for volume in backend.get("volumes", []))
    assert "ai-oauth-ed25519-private.pem" in str(
        _environment_mapping(backend)["AI_OAUTH_SIGNING_PRIVATE_KEY_FILE"]
    )

    for name in ("ai-migrate", "ai-service", "ai-worker", "ai-scheduler"):
        assert all(
            "ai-oauth-ed25519-private.pem" not in str(volume)
            for volume in services[name].get("volumes", [])
        )


def test_test_compose_routes_external_dependencies_to_fake_adapters() -> None:
    services = _compose("docker-compose.test.yml")["services"]
    assert "fake-ai-adapters" in services
    assert "tests.fakes.fake_ai_adapters:app" in _command(services["fake-ai-adapters"])
    api = services["ai-service"]["environment"]
    worker = services["ai-worker"]["environment"]
    assert api["MCP_TOKEN_EXCHANGE_URL"].startswith("http://fake-ai-adapters:")
    assert api["QJUDGE_MCP_URL"].startswith("http://fake-ai-adapters:")
    assert api["AI_OAUTH_JWKS_URL"].startswith("http://fake-ai-adapters:")
    assert worker["OPENAI_BASE_URL"] == "http://fake-ai-adapters:8080/v1"
    assert worker["DEEPSEEK_BASE_URL"] == "http://fake-ai-adapters:8080/v1"
    assert services["fake-ai-adapters"].get("healthcheck")


def test_test_backend_waits_for_idempotent_oauth_key_bootstrap() -> None:
    services = _compose("docker-compose.test.yml")["services"]
    bootstrap = services["ai-oauth-bootstrap"]
    assert "bootstrap_ai_oauth_keys.py" in _command(bootstrap)
    assert (
        services["backend-test"]["depends_on"]["ai-oauth-bootstrap"]["condition"]
        == "service_completed_successfully"
    )
    bootstrap_volumes = bootstrap["volumes"]
    backend_volumes = services["backend-test"]["volumes"]
    assert any(str(volume).startswith("ai-oauth-test-secrets:") for volume in bootstrap_volumes)
    assert any(str(volume).startswith("ai-oauth-test-secrets:") for volume in backend_volumes)
    assert "ai-oauth-test-secrets" in _compose("docker-compose.test.yml")["volumes"]
    assert all(".tmp/ai-oauth" not in str(volume) for volume in bootstrap_volumes + backend_volumes)


@pytest.mark.parametrize("filename", ("docker-compose.yml", "docker-compose.dev.yml"))
def test_django_allowlist_preserves_supported_runtime_settings(filename: str) -> None:
    services = _rendered_compose(
        filename,
        {
            "DB_CONN_MAX_AGE": "37",
            "JUDGE_ENGINE_ENABLED": "False",
            "JUDGE_MAX_CPU_TIME": "23",
            "HOST_PROJECT_ROOT": "/srv/qjudge",
            "OBJECT_STORAGE_OBJECT_TAGGING_ENABLED": "true",
            "OBJECT_STORAGE_AUTO_CREATE_BUCKETS": "true",
            "INTEGRITY_ARCHIVE_MAX_BYTES": "7654321",
            "ANTICHEAT_CAPTURE_INTERVAL_SECONDS": "11",
            "CLOUDFLARE_REALTIME_APP_ID": "render-cf-app",
            "CLOUDFLARE_REALTIME_APP_SECRET": "render-cf-secret",
        },
    )["services"]
    django_names = ("backend", "celery", "celery-high", "celery-beat")
    expected = {
        "DB_CONN_MAX_AGE": "37",
        "JUDGE_ENGINE_ENABLED": "False",
        "JUDGE_MAX_CPU_TIME": "23",
        "HOST_PROJECT_ROOT": "/srv/qjudge",
        "OBJECT_STORAGE_OBJECT_TAGGING_ENABLED": "true",
        "OBJECT_STORAGE_AUTO_CREATE_BUCKETS": "true",
        "INTEGRITY_ARCHIVE_MAX_BYTES": "7654321",
        "ANTICHEAT_CAPTURE_INTERVAL_SECONDS": "11",
        "CLOUDFLARE_REALTIME_APP_ID": "render-cf-app",
        "CLOUDFLARE_REALTIME_APP_SECRET": "render-cf-secret",
    }
    ai_secrets = {
        "AI_DATABASE_URL",
        "AI_DB_PASSWORD",
        "CREDENTIAL_LEASE_SECRET",
        "DEEPSEEK_API_KEY",
        "OPENAI_API_KEY",
    }
    for name in django_names:
        environment = services[name]["environment"]
        assert expected.items() <= environment.items()
        assert not ai_secrets & set(environment)


def test_default_production_compose_excludes_removed_integrations(tmp_path: Path) -> None:
    env_file = tmp_path / "production.env"
    env_file.write_text(_minimal_production_env())
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(env_file),
            "-f",
            str(REPOSITORY_ROOT / "docker-compose.yml"),
            "config",
            "--services",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    services = set(result.stdout.splitlines())
    assert "glitchtip" not in services
    assert "glitchtip-worker" not in services
    assert "cloudflared" not in services


def test_tunnel_profile_adds_cloudflared(tmp_path: Path) -> None:
    env_file = tmp_path / "production.env"
    env_file.write_text(_minimal_production_env() + "TUNNEL_TOKEN=secure-tunnel-token\n")
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(env_file),
            "-f",
            str(REPOSITORY_ROOT / "docker-compose.yml"),
            "--profile",
            "tunnel",
            "config",
            "--services",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "cloudflared" in set(result.stdout.splitlines())


def test_production_deploy_does_not_require_removed_integrations(
    tmp_path: Path,
) -> None:
    deploy_path = tmp_path / "deploy"
    deploy_path.mkdir()
    (deploy_path / ".git").mkdir()
    (deploy_path / ".env").write_text(_minimal_production_env())

    command_log = tmp_path / "commands.log"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_executable(
        fake_bin / "git",
        '#!/bin/sh\nprintf "git %s\\n" "$*" >> "$QJUDGE_TEST_COMMAND_LOG"\n',
    )
    _write_executable(
        fake_bin / "docker",
        """#!/bin/sh
printf 'docker %s\n' "$*" >> "$QJUDGE_TEST_COMMAND_LOG"
case "$*" in
  "compose version") exit 0 ;;
  *"exec -T"*) printf '0\n' ;;
esac
exit 0
""",
    )
    _write_executable(fake_bin / "python3", "#!/bin/sh\nexit 0\n")
    _write_executable(fake_bin / "curl", "#!/bin/sh\nexit 0\n")

    environment = os.environ.copy()
    environment["PATH"] = f"{fake_bin}:{environment['PATH']}"
    environment["QJUDGE_TEST_COMMAND_LOG"] = str(command_log)
    result = subprocess.run(
        [
            "bash",
            str(REPOSITORY_ROOT / "scripts/deploy-prod.sh"),
            str(deploy_path),
            "deadbeef",
        ],
        cwd=REPOSITORY_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    commands = command_log.read_text()
    assert "docker-compose.monitoring.yml" not in commands
    assert "oj_grafana" not in commands


def test_database_bootstrap_is_fail_closed_and_never_echoes_secrets() -> None:
    source = (REPOSITORY_ROOT / "scripts/db/bootstrap-ai-database.sh").read_text()
    assert "set -eu" in source
    assert "set -x" not in source
    assert "NOSUPERUSER" in source
    assert "NOCREATEDB" in source
    assert "NOCREATEROLE" in source
    assert "REVOKE ALL ON DATABASE" in source
    assert "POSTGRES_ADMIN_USER, DB_USER, and AI_DB_USER must be distinct" in source
    for secret in (
        "$POSTGRES_ADMIN_PASSWORD",
        "$DB_PASSWORD",
        "$AI_DB_PASSWORD",
    ):
        assert f'echo "{secret}"' not in source


def test_production_deploy_validates_roles_and_bootstraps_oauth_before_render() -> None:
    source = (REPOSITORY_ROOT / "scripts/deploy-prod.sh").read_text()
    oauth = source.index("python3 scripts/bootstrap_ai_oauth_keys.py")
    render = source.index('docker compose "${COMPOSE_FILES[@]}" config --quiet')
    assert oauth < render
    assert "POSTGRES_ADMIN_USER, DB_USER, and AI_DB_USER must be distinct" in source
    assert 'f"AI_DATABASE_URL {label} does not match AI database configuration"' in source
    assert "rolsuper OR rolcreatedb OR rolcreaterole" in source
