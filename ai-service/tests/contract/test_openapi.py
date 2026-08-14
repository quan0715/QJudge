"""The committed OpenAPI document is the byte-stable public contract."""

from __future__ import annotations

import json
from pathlib import Path

from main import create_app


def canonical_schema_bytes() -> bytes:
    return (
        json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"
    ).encode()


def test_openapi_matches_committed_snapshot_byte_for_byte() -> None:
    snapshot = Path(__file__).parent / "snapshots" / "openapi.json"
    assert snapshot.read_bytes() == canonical_schema_bytes()


def test_openapi_contains_only_canonical_public_surfaces() -> None:
    paths = create_app().openapi()["paths"]
    required = {
        "/v1/sessions",
        "/v1/sessions/{session_id}",
        "/v1/sessions/{session_id}/clear",
        "/v1/sessions/{session_id}/runs",
        "/v1/runs",
        "/v1/runs/{run_id}",
        "/v1/runs/{run_id}/events",
        "/v1/runs/{run_id}/cancel",
        "/v1/runs/{run_id}/approve",
        "/v1/runs/{run_id}/answer",
        "/v1/artifacts",
        "/v1/artifacts/{artifact_id}",
        "/v1/artifacts/{artifact_id}/content",
        "/v1/artifacts/{artifact_id}/download",
        "/v1/models",
        "/v1/usage",
        "/health/live",
        "/health/ready",
    }
    assert set(paths) == required


def test_openapi_describes_stream_binary_and_redirect_wire_contracts() -> None:
    paths = create_app().openapi()["paths"]

    events = paths["/v1/runs/{run_id}/events"]["get"]["responses"]
    assert set(events["200"]["content"]) == {"text/event-stream"}

    content = paths["/v1/artifacts/{artifact_id}/content"]["get"]["responses"]
    assert content["200"]["content"] == {
        "application/octet-stream": {
            "schema": {"type": "string", "format": "binary"}
        }
    }

    download = paths["/v1/artifacts/{artifact_id}/download"]["get"]["responses"]
    assert "200" not in download
    assert download["307"]["headers"]["Location"]["schema"] == {
        "type": "string",
        "format": "uri",
    }
