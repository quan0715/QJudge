"""Contracts for the user-managed deployment environment surface."""

from __future__ import annotations

import os
import re
import subprocess
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
GENERATED_STORAGE_POLICY_KEYS = {
    "OBJECT_STORAGE_REGION",
    "OBJECT_STORAGE_AUTO_CREATE_BUCKETS",
    "OBJECT_STORAGE_OBJECT_TAGGING_ENABLED",
}
STORAGE_ENVIRONMENT = {
    "OBJECT_STORAGE_ENDPOINT_URL": "https://storage.example.test",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://storage.example.test",
    "OBJECT_STORAGE_ACCESS_KEY": "storage-key",
    "OBJECT_STORAGE_SECRET_KEY": "storage-secret",
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


def test_legacy_root_env_template_is_removed() -> None:
    assert not (REPOSITORY_ROOT / "example.env").exists()


def _run_setup(
    tmp_path: Path,
    *,
    origin: str = "https://judge.example.test",
    storage: str = "r2",
    force: bool = False,
    extra_environment: dict[str, str] | None = None,
) -> tuple[subprocess.CompletedProcess[str], Path]:
    output = tmp_path / ".env"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir(exist_ok=True)
    fake_docker = fake_bin / "docker"
    fake_docker.write_text("#!/bin/sh\nexit 0\n")
    fake_docker.chmod(0o755)
    environment = os.environ.copy()
    environment["PATH"] = f"{fake_bin}:{environment['PATH']}"
    environment.update(STORAGE_ENVIRONMENT)
    environment.update(extra_environment or {})
    command = [
        "bash",
        str(REPOSITORY_ROOT / "scripts/setup-env.sh"),
        "--target",
        "self-hosted",
        "--storage",
        storage,
        "--origin",
        origin,
        "--output",
        str(output),
    ]
    if force:
        command.append("--force")
    result = subprocess.run(
        command,
        cwd=REPOSITORY_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, output


def _env_values(path: Path) -> dict[str, str]:
    return dict(
        line.split("=", 1)
        for line in path.read_text().splitlines()
        if line and not line.startswith("#")
    )


def test_setup_env_generates_complete_secret_safe_file(tmp_path: Path) -> None:
    result, output = _run_setup(tmp_path)

    assert result.returncode == 0, result.stderr
    values = _env_values(output)
    assert set(values) == EXPECTED_ACTIVE_KEYS | GENERATED_STORAGE_POLICY_KEYS | {
        "HOST_PROJECT_ROOT",
        "DOCKER_GID",
        "DOCKER_SOCKET_UID",
    }
    assert values["OBJECT_STORAGE_REGION"] == "auto"
    assert values["OBJECT_STORAGE_AUTO_CREATE_BUCKETS"] == "false"
    assert values["OBJECT_STORAGE_OBJECT_TAGGING_ENABLED"] == "false"
    generated = [values[name] for name in GENERATED_SECRET_KEYS]
    assert all(generated)
    assert len(generated) == len(set(generated))
    assert re.fullmatch(r"[A-Za-z0-9]+", values["POSTGRES_ADMIN_PASSWORD"])
    assert re.fullmatch(r"[A-Za-z0-9]+", values["DB_PASSWORD"])
    assert re.fullmatch(r"[A-Za-z0-9]+", values["AI_DB_PASSWORD"])
    assert values["DOCKER_GID"].isdigit()
    assert values["DOCKER_SOCKET_UID"].isdigit()
    assert output.stat().st_mode & 0o777 == 0o600


def test_setup_env_refuses_to_overwrite_existing_file(tmp_path: Path) -> None:
    output = tmp_path / ".env"
    output.write_text("sentinel=true\n")

    result, _ = _run_setup(tmp_path)

    assert result.returncode != 0
    assert output.read_text() == "sentinel=true\n"


def test_setup_env_force_replaces_existing_file(tmp_path: Path) -> None:
    output = tmp_path / ".env"
    output.write_text("sentinel=true\n")

    result, _ = _run_setup(tmp_path, force=True)

    assert result.returncode == 0, result.stderr
    assert "sentinel" not in output.read_text()


def test_setup_env_rejects_origin_with_path_before_writing(tmp_path: Path) -> None:
    result, output = _run_setup(
        tmp_path, origin="https://judge.example.test/path"
    )

    assert result.returncode != 0
    assert "must not include a path" in result.stderr
    assert not output.exists()


def test_setup_env_never_prints_supplied_or_generated_secrets(tmp_path: Path) -> None:
    result, output = _run_setup(tmp_path)

    assert result.returncode == 0, result.stderr
    values = _env_values(output)
    captured = result.stdout + result.stderr
    for secret in STORAGE_ENVIRONMENT.values():
        assert secret not in captured
    for name in GENERATED_SECRET_KEYS:
        assert values[name] not in captured


def test_setup_env_configures_minio_without_expanding_the_manual_env_surface(
    tmp_path: Path,
) -> None:
    result, output = _run_setup(
        tmp_path,
        storage="minio",
        origin="http://judge.example.test",
        extra_environment={
            "OBJECT_STORAGE_ENDPOINT_URL": "http://minio.internal:9000",
            "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "http://storage.example.test:9000",
        },
    )

    assert result.returncode == 0, result.stderr
    values = _env_values(output)
    assert values["OBJECT_STORAGE_ENDPOINT_URL"] == "http://minio.internal:9000"
    assert values["OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"] == (
        "http://storage.example.test:9000"
    )
    assert values["OBJECT_STORAGE_REGION"] == "us-east-1"
    assert values["OBJECT_STORAGE_AUTO_CREATE_BUCKETS"] == "true"
    assert values["OBJECT_STORAGE_OBJECT_TAGGING_ENABLED"] == "true"
    assert _active_env_keys() == EXPECTED_ACTIVE_KEYS


def test_setup_env_rejects_http_minio_public_endpoint_for_https_site(
    tmp_path: Path,
) -> None:
    result, output = _run_setup(
        tmp_path,
        storage="minio",
        origin="https://judge.example.test",
        extra_environment={
            "OBJECT_STORAGE_ENDPOINT_URL": "http://minio.internal:9000",
            "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "http://storage.example.test:9000",
        },
    )

    assert result.returncode != 0
    assert "public endpoint must use HTTPS" in result.stderr
    assert not output.exists()


def test_setup_env_preserves_only_configured_optional_external_inputs(
    tmp_path: Path,
) -> None:
    optional = {
        "OPENAI_API_KEY": "optional-openai-key",
        "OPENAI_BASE_URL": "http://model-gateway:11434/v1",
        "TUNNEL_TOKEN": "optional-tunnel-token",
        "EMAIL_HOST_USER": "mailer@example.test",
        "EMAIL_HOST_PASSWORD": "optional-mail-password",
    }

    result, output = _run_setup(tmp_path, extra_environment=optional)

    assert result.returncode == 0, result.stderr
    values = _env_values(output)
    assert optional.items() <= values.items()
    assert "GOOGLE_OAUTH_CLIENT_ID" not in values
    captured = result.stdout + result.stderr
    for value in optional.values():
        assert value not in captured


def test_setup_env_rejects_half_configured_optional_credential_pair(
    tmp_path: Path,
) -> None:
    result, output = _run_setup(
        tmp_path,
        extra_environment={"GITHUB_OAUTH_CLIENT_ID": "github-client"},
    )

    assert result.returncode != 0
    assert "GitHub OAuth credentials must be configured together" in result.stderr
    assert not output.exists()
