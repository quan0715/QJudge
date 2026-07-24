"""Static deployment contracts for the Integrity Controller boundary.

These tests render Compose only.  They never build images or start services.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def repo_root() -> Path:
    return REPO_ROOT


def compose_config(repo_root: Path, compose_file: str) -> dict[str, Any]:
    """Render one Compose file without reading a local secret-bearing .env."""
    if shutil.which("docker") is None:
        pytest.skip("Docker Compose is required to render the Compose contract")

    environment = {
        **os.environ,
        "AI_SERVICE_INTERNAL_TOKEN": "compose-contract-token",
        "OBJECT_STORAGE_ENDPOINT_URL": "https://example.invalid",
        "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://example.invalid",
        "OBJECT_STORAGE_ACCESS_KEY": "compose-contract-access-key",
        "OBJECT_STORAGE_SECRET_KEY": "compose-contract-secret-key",
        "TUNNEL_TOKEN": "compose-contract-tunnel-token",
        "DOCKER_GID": "999",
        "INTEGRITY_TEST_SECRETS_DIR": "/tmp/qjudge-integrity-compose-contract",
        "INTEGRITY_WORKER_NETWORK": "qjudge-contract-main-network",
        "INTEGRITY_WORKER_NETWORK_DEV": "qjudge-contract-dev-network",
        "INTEGRITY_WORKER_NETWORK_TEST": "qjudge-contract-test-network",
    }
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--profile",
            "build",
            "--env-file",
            str(repo_root / ".env.example"),
            "-f",
            str(repo_root / compose_file),
            "config",
            "--no-env-resolution",
            "--format",
            "json",
        ],
        cwd=repo_root,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def compose_profiles(repo_root: Path, compose_file: str) -> set[str]:
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(repo_root / ".env.example"),
            "-f",
            str(repo_root / compose_file),
            "config",
            "--no-env-resolution",
            "--profiles",
        ],
        cwd=repo_root,
        env={**os.environ, "DOCKER_GID": "999"},
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return set(result.stdout.splitlines())


def _environment(service: dict[str, Any]) -> dict[str, str]:
    environment = service.get("environment", {})
    if isinstance(environment, dict):
        return {str(key): str(value) for key, value in environment.items()}
    return {
        key: value
        for item in environment
        for key, _, value in [item.partition("=")]
    }


def _volume_target(volume: Any) -> str:
    if isinstance(volume, dict):
        return str(volume["target"])
    return str(volume).split(":", 2)[1]


def _volume_is_read_only(volume: Any) -> bool:
    if isinstance(volume, dict):
        return bool(volume.get("read_only"))
    return str(volume).endswith(":ro")


def _socket_mount_services(services: dict[str, dict[str, Any]]) -> set[str]:
    return {
        service_name
        for service_name, service in services.items()
        if any(
            _volume_target(volume) == "/var/run/docker.sock"
            for volume in service.get("volumes", [])
        )
    }


@pytest.mark.parametrize(
    ("compose_file", "backend_service", "network", "socket_services"),
    (
        (
            "docker-compose.yml",
            "backend",
            "oj_network",
            {"integrity-controller", "celery-high", "celery"},
        ),
        (
            "docker-compose.dev.yml",
            "backend",
            "oj_network_dev",
            {"integrity-controller", "celery"},
        ),
        (
            "docker-compose.test.yml",
            "backend-test",
            "test-network",
            {"integrity-controller", "celery-test"},
        ),
    ),
)
def test_integrity_compose_contract(
    repo_root: Path,
    compose_file: str,
    backend_service: str,
    network: str,
    socket_services: set[str],
) -> None:
    config = compose_config(repo_root, compose_file)
    services = config["services"]
    controller = services["integrity-controller"]
    backend = services[backend_service]
    controller_environment = _environment(controller)
    backend_environment = _environment(backend)
    controller_volumes = controller["volumes"]
    backend_volumes = backend["volumes"]

    assert "integrity-worker-image" in services
    assert controller.get("privileged", False) is False
    assert "ALL" in controller["cap_drop"]
    assert controller["read_only"] is True
    assert "no-new-privileges:true" in controller["security_opt"]
    assert controller["group_add"] == ["999"]
    assert controller.get("profiles", []) == []
    assert "build" in compose_profiles(repo_root, compose_file)
    assert _socket_mount_services(services) == socket_services

    assert any(
        _volume_target(volume) == "/var/run/docker.sock"
        for volume in controller_volumes
    )
    assert all(
        _volume_target(volume) != "/var/run/docker.sock"
        for volume in backend_volumes
    )
    assert backend.get("group_add") in (None, [])

    for target in (
        "/run-secrets/controller-token",
        "/run-secrets/integrity-worker-signing-key",
    ):
        matching_volumes = [
            volume for volume in backend_volumes if _volume_target(volume) == target
        ]
        assert matching_volumes
        assert all(_volume_is_read_only(volume) for volume in matching_volumes)

    assert controller_environment["INTEGRITY_CONTROLLER_INTERNAL_TOKEN_FILE"] == (
        "/run-secrets/controller-token"
    )
    controller_token_volumes = [
        volume
        for volume in controller_volumes
        if _volume_target(volume) == "/run-secrets/controller-token"
    ]
    assert controller_token_volumes
    assert all(_volume_is_read_only(volume) for volume in controller_token_volumes)
    assert "http://localhost:8010/health" in json.dumps(
        controller["healthcheck"]["test"]
    )
    assert controller_environment["INTEGRITY_WORKER_NETWORK"] == config["networks"][network]["name"]
    assert backend_environment["INTEGRITY_CONTROLLER_URL"] == "http://integrity-controller:8010"
    assert backend_environment["INTEGRITY_CONTROLLER_TOKEN_FILE"] == "/run-secrets/controller-token"
    assert backend_environment["INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE"] == (
        "/run-secrets/integrity-worker-signing-key"
    )
    assert "INTEGRITY_CONTROLLER_TOKEN" not in backend_environment
    assert "INTEGRITY_WORKER_SIGNING_PRIVATE_KEY" not in backend_environment


def test_primary_network_default_matches_backend_setting(repo_root: Path) -> None:
    settings = (repo_root / "backend/config/settings/base.py").read_text()
    environment_template = (repo_root / ".env.example").read_text()

    assert '"INTEGRITY_WORKER_NETWORK", "online_judge_oj_network"' in settings
    assert "INTEGRITY_WORKER_NETWORK=online_judge_oj_network" in environment_template
