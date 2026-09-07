"""Deployment contracts against real `docker compose config --format json`.

Render on the host with dummy credentials; the owning test image deliberately
has neither Docker nor its socket. See docs/deployment/integrity-resident-dev.md.
"""
import json
import os

import pytest


@pytest.fixture(scope="module")
def services():
    path = os.environ.get("INTEGRITY_DEV_COMPOSE_JSON")
    if not path:
        pytest.skip("requires host-rendered dummy dev Compose JSON")
    with open(path) as stream:
        return json.load(stream)["services"]


def test_resident_runtime_has_only_its_own_credentials_and_durable_storage(services):
    resident = services["integrity-resident"]
    assert resident["user"] == "10001:10001"
    assert resident["read_only"] is True
    assert not resident.get("ports")
    assert not resident.get("privileged", False)
    assert resident["cap_drop"] == ["ALL"]
    volumes = {v["target"]: v for v in resident["volumes"]}
    assert set(volumes) == {"/run-data", "/run-secrets/backend-public-key", "/run-secrets/resident-service-token"}
    assert volumes["/run-data"]["type"] == "volume"
    assert volumes["/run-data"]["source"] == "integrity_resident_data"
    assert not volumes["/run-data"].get("read_only", False)
    for name in ("backend-public-key", "resident-service-token"):
        mount = volumes[f"/run-secrets/{name}"]
        assert mount["read_only"] is True
        assert mount["source"].endswith(f"/secrets/integrity/{name}")
        assert not mount.get("bind", {}).get("create_host_path", False)
    assert resident["command"] == ["uvicorn", "integrity_service.resident.app:app", "--host", "0.0.0.0", "--port", "8011", "--workers", "1"]
    assert resident["environment"] == {
        "BACKEND_INTERNAL_URL": "http://backend:8000",
        "INTEGRITY_RESIDENT_DATA_ROOT": "/run-data",
        "INTEGRITY_RESIDENT_PUBLIC_KEY_FILE": "/run-secrets/backend-public-key",
        "INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE": "/run-secrets/resident-service-token",
    }
    assert "/ready" in resident["healthcheck"]["test"][-1]


def test_backend_and_reconciler_share_canonical_credentials_and_resident_routing(services):
    for name in ("backend", "integrity-reconciler"):
        service = services[name]
        env = service["environment"]
        assert env["INTEGRITY_EXECUTION_BACKEND"] == "resident"
        assert env["INTEGRITY_RESIDENT_URL"] == "http://integrity-resident:8011"
        assert env["INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE"] == "/run-secrets/integrity/resident-service-token"
        assert env["INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE"] == "/run-secrets/integrity/integrity-worker-signing-key"
        assert env["INTEGRITY_CONTROLLER_TOKEN_FILE"] == "/run-secrets/integrity/controller-token"
        assert any(v["target"] == "/run-secrets" and v["read_only"] for v in service["volumes"])
        assert service["depends_on"]["integrity-bootstrap"]["condition"] == "service_completed_successfully"
    reconciler = services["integrity-reconciler"]
    assert reconciler["environment"]["DB_HOST"] == "postgres"
    assert reconciler["command"] == ["python", "manage.py", "reconcile_integrity"]
    assert not reconciler.get("ports")
    assert all("docker.sock" not in v["source"] for v in reconciler["volumes"])


def test_runtime_waits_for_narrow_bootstrap_and_data_ownership(services):
    resident = services["integrity-resident"]
    for name in ("integrity-bootstrap", "integrity-resident-data-init"):
        assert resident["depends_on"][name]["condition"] == "service_completed_successfully"
    bootstrap = services["integrity-bootstrap"]
    assert bootstrap["command"][-4:] == ["--secrets-dir", "/bootstrap-secrets", "--resident-gid", "10001"]
    assert bootstrap.get("restart") == "no"
    initializer = services["integrity-resident-data-init"]
    assert initializer["user"] == "0:0"
    assert initializer["command"] == ["sh", "-c", "chown 10001:10001 /run-data && chmod 0700 /run-data"]
    assert len(initializer["volumes"]) == 1
    assert initializer["volumes"][0]["source"] == "integrity_resident_data"
    assert initializer["volumes"][0]["type"] == "volume"


@pytest.mark.parametrize("render_key,bucket,ttl", [
    ("INTEGRITY_DEV_COMPOSE_JSON", "anticheat-raw", "300"),
    ("INTEGRITY_DEV_COMPOSE_OVERRIDE_JSON", "qjudge-dev-anticheat-raw", "777"),
])
def test_descriptor_archive_settings_match_between_backend_and_reconciler(render_key, bucket, ttl):
    path = os.environ.get(render_key)
    if not path:
        pytest.skip("requires host-rendered dummy default and override Compose JSON")
    with open(path) as stream:
        rendered = json.load(stream)["services"]
    for name in ("backend", "integrity-reconciler"):
        env = rendered[name]["environment"]
        assert env["ANTICHEAT_RAW_BUCKET"] == bucket, name
        assert env["OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS"] == ttl, name
