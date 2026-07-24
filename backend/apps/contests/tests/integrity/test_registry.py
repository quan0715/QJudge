import json

import pytest

from apps.contests.integrity.registry import (
    ACTIVE_SIGNAL_IDS,
    DEFINITIONS,
    REGISTRY_VERSION,
    build_registry_snapshot,
)


def test_registry_has_every_active_signal_once():
    snapshot = build_registry_snapshot()
    signal_ids = [
        signal
        for definition in snapshot["definitions"].values()
        for signal in definition["signals"].values()
        if signal
    ]
    assert set(signal_ids) == ACTIVE_SIGNAL_IDS
    assert len(signal_ids) == len(set(signal_ids))
    assert snapshot["version"] == REGISTRY_VERSION
    assert snapshot["version"] == "2026-07-21.3"


def test_registry_definitions_are_data_not_core_switches():
    snapshot = build_registry_snapshot()
    fullscreen = snapshot["definitions"]["fullscreen_integrity"]
    assert fullscreen["signals"] == {
        "triggered": "exit_fullscreen_triggered",
        "escalated": "exit_fullscreen",
        "restored": "fullscreen_restored",
    }
    assert fullscreen["origin"] == "browser"
    assert snapshot["definitions"]["connectivity"]["origin"] == "server"
    assert {definition["origin"] for definition in snapshot["definitions"].values()} == {
        "browser",
        "server",
    }
    assert fullscreen["emission"] == "edge"
    assert fullscreen["evidence"]["before_ms"] == 10_000
    assert fullscreen["evidence"]["after_ms"] == 10_000
    assert snapshot["definitions"]["forbidden_action"]["signals"] == {
        "triggered": "forbidden_action",
        "escalated": "",
        "restored": "",
    }
    assert snapshot["definitions"]["forbidden_focus"]["signals"] == {
        "triggered": "forbidden_focus_event",
        "escalated": "",
        "restored": "",
    }
    json.dumps(snapshot)


def test_registry_definitions_are_transitively_immutable():
    snapshot_before_mutation = build_registry_snapshot()
    definition = DEFINITIONS["fullscreen_integrity"]

    with pytest.raises(TypeError):
        definition.signals["triggered"] = "other"
    with pytest.raises(TypeError):
        definition.evidence["before_ms"] = 0
    with pytest.raises(AttributeError):
        definition.evidence["sources"].append("webcam")
    with pytest.raises(TypeError):
        definition.metadata_schema["type"] = "array"

    assert build_registry_snapshot() == snapshot_before_mutation
