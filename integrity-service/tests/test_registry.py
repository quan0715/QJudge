from __future__ import annotations

import pytest
from jsonschema import SchemaError, ValidationError

from integrity_service.core.registry import Registry, UnknownSignal


def registry_snapshot() -> dict:
    return {
        "version": "registry-v1",
        "definitions": {
            "fullscreen": {
                "id": "fullscreen",
                "schema_version": 1,
                "signals": {
                    "triggered": "exit_fullscreen_triggered",
                    "escalated": "exit_fullscreen",
                    "restored": "fullscreen_restored",
                },
                "emission": "edge",
                "incident_family": "fullscreen",
                "priority": 1,
                "grace_ms": 30_000,
                "evidence": {
                    "mode": "incident_window",
                    "sources": ["screen_share"],
                    "before_ms": 10_000,
                    "after_ms": 10_000,
                    "max_segment_ms": 60_000,
                },
                "action": "pause",
                "metadata_schema": {
                    "type": "object",
                    "properties": {"reason": {"type": "string"}},
                    "required": ["reason"],
                    "additionalProperties": False,
                },
            },
            "connectivity": {
                "id": "connectivity",
                "schema_version": 1,
                "signals": {
                    "triggered": "connectivity_suspect",
                    "escalated": "heartbeat_timeout",
                    "restored": "connectivity_restored",
                },
                "emission": "state_snapshot",
                "incident_family": "connectivity",
                "priority": 1,
                "grace_ms": 45_000,
                "evidence": {
                    "mode": "none",
                    "sources": [],
                    "before_ms": 0,
                    "after_ms": 0,
                    "max_segment_ms": 60_000,
                },
                "action": "pause",
                "metadata_schema": {
                    "type": "object",
                    "additionalProperties": True,
                },
            },
        },
    }


def test_registry_resolves_frozen_definition_fields():
    registry = Registry(registry_snapshot())

    definition, phase = registry.resolve("exit_fullscreen")

    assert registry.version == "registry-v1"
    assert phase == "escalated"
    assert definition.id == "fullscreen"
    assert definition.evidence_sources == ("screen_share",)
    assert definition.evidence_before_ms == 10_000
    assert definition.evidence_after_ms == 10_000


def test_registry_rejects_duplicate_signal_ids_deterministically():
    snapshot = registry_snapshot()
    snapshot["definitions"]["connectivity"]["signals"]["triggered"] = (
        "exit_fullscreen_triggered"
    )

    with pytest.raises(ValueError, match="duplicate registry signal exit_fullscreen_triggered"):
        Registry(snapshot)


def test_registry_rejects_invalid_snapshot_shape():
    snapshot = registry_snapshot()
    del snapshot["definitions"]["fullscreen"]["grace_ms"]

    with pytest.raises(ValidationError):
        Registry(snapshot)


def test_registry_rejects_invalid_metadata_schema():
    snapshot = registry_snapshot()
    snapshot["definitions"]["fullscreen"]["metadata_schema"] = {"type": "wat"}

    with pytest.raises(SchemaError):
        Registry(snapshot)


def test_registry_validates_event_payload_against_metadata_schema():
    registry = Registry(registry_snapshot())

    registry.validate_payload("exit_fullscreen_triggered", {"reason": "user-exit"})
    with pytest.raises(ValidationError):
        registry.validate_payload("exit_fullscreen_triggered", {})


def test_registry_rejects_unknown_signal():
    with pytest.raises(UnknownSignal, match="unknown"):
        Registry(registry_snapshot()).resolve("unknown")


@pytest.mark.parametrize(
    ("keyword", "reference"),
    [
        ("$ref", "https://example.invalid/schema.json"),
        ("$ref", "file:///tmp/schema.json"),
        ("$dynamicRef", "https://example.invalid/schema.json#node"),
    ],
)
def test_registry_rejects_nonlocal_references_before_any_retrieval(
    monkeypatch, keyword, reference
):
    snapshot = registry_snapshot()
    snapshot["definitions"]["fullscreen"]["metadata_schema"] = {
        keyword: reference
    }
    retrievals = []

    def forbidden_urlopen(*args, **kwargs):
        retrievals.append((args, kwargs))
        raise AssertionError("registry construction attempted I/O")

    monkeypatch.setattr("urllib.request.urlopen", forbidden_urlopen)

    with pytest.raises(ValueError, match="local fragment"):
        Registry(snapshot)
    assert retrievals == []


def test_registry_compiles_local_defs_reference_once_and_validates_without_io(monkeypatch):
    snapshot = registry_snapshot()
    snapshot["definitions"]["fullscreen"]["metadata_schema"] = {
        "$defs": {"reason": {"type": "string", "minLength": 1}},
        "type": "object",
        "properties": {"reason": {"$ref": "#/$defs/reason"}},
        "required": ["reason"],
        "additionalProperties": False,
    }

    def forbidden_urlopen(*args, **kwargs):
        raise AssertionError("payload validation attempted I/O")

    monkeypatch.setattr("urllib.request.urlopen", forbidden_urlopen)
    registry = Registry(snapshot)
    registry.validate_payload("exit_fullscreen_triggered", {"reason": "local"})
    with pytest.raises(ValidationError):
        registry.validate_payload("exit_fullscreen_triggered", {"reason": ""})


def test_registry_definition_and_indexes_are_deeply_immutable_and_replay_stable():
    snapshot = registry_snapshot()
    registry = Registry(snapshot)
    definition, phase = registry.resolve("exit_fullscreen_triggered")

    with pytest.raises(TypeError):
        definition.metadata_schema["required"] = []  # type: ignore[index]
    with pytest.raises((AttributeError, TypeError)):
        registry._by_signal["exit_fullscreen_triggered"] = (definition, "restored")
    assert not hasattr(registry, "by_signal")

    snapshot["definitions"]["fullscreen"]["signals"]["triggered"] = "mutated"
    snapshot["definitions"]["fullscreen"]["metadata_schema"]["required"] = []
    replayed, replayed_phase = registry.resolve("exit_fullscreen_triggered")
    assert (replayed, replayed_phase) == (definition, phase)
    with pytest.raises(ValidationError):
        registry.validate_payload("exit_fullscreen_triggered", {})
