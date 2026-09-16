import os
from pathlib import Path
import subprocess

import yaml


ROOT = Path(__file__).resolve().parents[2]
DEPLOY_SCRIPT = ROOT / "scripts" / "deploy-prod.sh"


def _compose(name: str) -> dict:
    return yaml.safe_load((ROOT / name).read_text())


def _environment_values(service: dict) -> dict[str, str]:
    environment = service.get("environment", {})
    if isinstance(environment, dict):
        return environment
    return dict(item.split("=", 1) for item in environment if "=" in item)


def test_each_compose_environment_has_profiled_pinned_livekit_service() -> None:
    expected = {
        "docker-compose.yml": ("livekit", "7880"),
        "docker-compose.dev.yml": ("livekit", "7883"),
        "docker-compose.test.yml": ("livekit-test", "7890"),
    }

    for filename, (service_name, port) in expected.items():
        service = _compose(filename)["services"][service_name]
        assert "live-monitoring" in service["profiles"]
        assert "@sha256:" in service["image"]
        assert service["command"] == ["--config", "/run/livekit/livekit.json"]
        assert any(mapping.split("/", 1)[0] == f"{port}:{port}" for mapping in service["ports"])


def test_livekit_is_not_a_backend_startup_dependency_when_disabled() -> None:
    for filename, backend_name in (
        ("docker-compose.yml", "backend"),
        ("docker-compose.dev.yml", "backend"),
        ("docker-compose.test.yml", "backend-test"),
    ):
        compose = _compose(filename)
        backend = compose["services"][backend_name]
        assert "livekit" not in backend.get("depends_on", {})
        assert "livekit-test" not in backend.get("depends_on", {})
        assert "LIVE_MONITORING_ENABLED" in _environment_values(backend)


def test_dev_livekit_exposes_its_local_turn_ports() -> None:
    service = _compose("docker-compose.dev.yml")["services"]["livekit"]

    assert "3478:3478/udp" in service["ports"]
    assert "50300-50309:50300-50309/udp" in service["ports"]


def test_production_uses_profiled_host_network_coturn_for_turn_ports() -> None:
    compose = _compose("docker-compose.yml")
    livekit = compose["services"]["livekit"]
    coturn = compose["services"]["coturn"]

    assert "3478:3478/udp" not in livekit["ports"]
    assert "50300-50309:50300-50309/udp" not in livekit["ports"]
    assert coturn["profiles"] == ["live-turn"]
    assert coturn["network_mode"] == "host"
    assert "@sha256:" in coturn["image"]
    assert coturn["command"] == ["-c", "/etc/coturn/turnserver.conf"]
    assert any(
        mount["target"] == "/etc/coturn/turnserver.conf"
        for mount in coturn["volumes"]
    )


def test_production_coturn_can_read_the_private_rendered_config() -> None:
    coturn = _compose("docker-compose.yml")["services"]["coturn"]

    assert coturn["user"] == "${COTURN_UID:-1000}:${COTURN_GID:-1000}"
    assert coturn["cap_drop"] == ["ALL"]
    assert coturn["cap_add"] == ["NET_BIND_SERVICE"]


def test_production_deploy_activates_and_renders_livekit_when_enabled() -> None:
    deploy_script = DEPLOY_SCRIPT.read_text()

    assert 'live_monitoring_enabled="$(get_env_value LIVE_MONITORING_ENABLED)"' in deploy_script
    assert 'COMPOSE_FILES+=(--profile live-monitoring)' in deploy_script
    assert 'COMPOSE_FILES+=(--profile live-turn)' in deploy_script
    assert 'python3 scripts/livekit/render-config.py' in deploy_script
    assert '--coturn-output' in deploy_script
    assert 'LIVEKIT_CONFIG_FILE' in deploy_script
    assert 'export COTURN_UID="$(id -u)"' in deploy_script
    assert 'export COTURN_GID="$(id -g)"' in deploy_script

    profile_index = deploy_script.index('COMPOSE_FILES+=(--profile live-monitoring)')
    start_index = deploy_script.index('docker compose "${COMPOSE_FILES[@]}" up -d')
    render_index = deploy_script.index('python3 scripts/livekit/render-config.py')
    assert profile_index < start_index
    assert render_index < start_index


def test_production_deploy_fails_before_checkout_when_livekit_config_is_missing(
    tmp_path: Path,
) -> None:
    deploy_path = tmp_path / "deploy"
    deploy_path.mkdir()
    (deploy_path / ".git").mkdir()
    (deploy_path / ".env").write_text(
        "\n".join(
            (
                "POSTGRES_ADMIN_PASSWORD=prod-admin-secret",
                "DB_PASSWORD=prod-db-secret",
                "AI_DB_PASSWORD=prod-ai-secret",
                "CREDENTIAL_LEASE_SECRET=prod-lease-secret",
                "SECRET_KEY=prod-secret-key",
                "QJUDGE_PUBLIC_ORIGIN=https://q-judge.com",
                "OBJECT_STORAGE_ENDPOINT_URL=https://storage.invalid",
                "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://storage.invalid",
                "OBJECT_STORAGE_ACCESS_KEY=prod-storage-access",
                "OBJECT_STORAGE_SECRET_KEY=prod-storage-secret",
                "LIVE_MONITORING_ENABLED=true",
            )
        )
        + "\n"
    )

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    (fake_bin / "docker").write_text(
        "#!/bin/sh\n"
        "if [ \"$1\" = compose ] && [ \"$2\" = version ]; then exit 0; fi\n"
        "exit 64\n"
    )
    (fake_bin / "stat").write_text(
        "#!/bin/sh\n"
        "if [ \"$1\" = -c ]; then printf '0\\n'; exit 0; fi\n"
        "exit 64\n"
    )
    for command in (fake_bin / "docker", fake_bin / "stat"):
        command.chmod(0o755)

    environment = os.environ.copy()
    environment["PATH"] = f"{fake_bin}:{environment['PATH']}"
    result = subprocess.run(
        ["bash", str(DEPLOY_SCRIPT), str(deploy_path), "main"],
        capture_output=True,
        text=True,
        env=environment,
        check=False,
    )

    assert result.returncode != 0
    assert "LIVEKIT_PUBLIC_URL" in result.stderr
