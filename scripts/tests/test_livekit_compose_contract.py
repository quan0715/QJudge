from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]


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
