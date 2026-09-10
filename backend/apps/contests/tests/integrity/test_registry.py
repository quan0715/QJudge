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
    assert snapshot["version"] == "2026-09-10.1"


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
    assert {
        definition["origin"] for definition in snapshot["definitions"].values()
    } == {
        "browser",
        "server",
    }
    assert fullscreen["emission"] == "edge"
    assert fullscreen["evidence"]["before_ms"] == 5_000
    assert fullscreen["evidence"]["after_ms"] == 5_000
    assert snapshot["definitions"]["forbidden_action"]["signals"] == {
        "triggered": "forbidden_action",
        "escalated": "",
        "restored": "",
    }
    json.dumps(snapshot)


def test_registry_grace_periods_match_recovery_costs():
    snapshot = build_registry_snapshot()

    assert {
        key: definition["grace_ms"]
        for key, definition in snapshot["definitions"].items()
    } == {
        "health_snapshot": 0,
        "connectivity": 30_000,
        "fullscreen_integrity": 10_000,
        "mouse_leave": 5_000,
        "multi_display": 20_000,
        "screen_share": 20_000,
        "webcam": 20_000,
        "viewport": 5_000,
        "clipboard": 0,
        "forbidden_action": 0,
        "listener_integrity": 0,
        "precheck_passed": 0,
        "exam_entered": 0,
        "exam_submit_initiated": 0,
    }


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


def test_only_evidence_loss_events_send_the_student_back_to_precheck():
    """Pre-check runs outside the monitored runtime, so returning to it is a
    blackout. Reserve it for events that already cost us evidence capture."""
    snapshot = build_registry_snapshot()

    pausing = {
        key
        for key, definition in snapshot["definitions"].items()
        if definition["action"] == "pause"
    }

    assert pausing == {
        "screen_share",
        "webcam",
        "connectivity",
        "multi_display",
        "listener_integrity",
    }
    for recorded in ("fullscreen_integrity", "viewport", "mouse_leave"):
        assert snapshot["definitions"][recorded]["action"] == "record_event"


def test_incident_evidence_asks_the_source_its_device_actually_captures():
    """viewport only runs on tablets, whose evidence source is the webcam.
    Asking for screen share there would request a source the policy disables."""
    definitions = build_registry_snapshot()["definitions"]

    assert definitions["viewport"]["evidence"]["sources"] == ["webcam"]
    assert definitions["webcam"]["evidence"]["sources"] == ["webcam"]
    assert definitions["screen_share"]["evidence"]["sources"] == ["screen_share"]
    assert definitions["multi_display"]["evidence"]["sources"] == ["screen_share"]


def test_precheck_passed_is_a_server_written_lifecycle_record():
    definition = build_registry_snapshot()["definitions"]["precheck_passed"]

    assert definition["origin"] == "server"
    assert definition["action"] == "record_event"
    assert definition["incident_family"] == "exam_lifecycle"
    # priority 3 keeps it out of violation_count, like exam_entered.
    assert definition["priority"] == 3
    assert definition["signals"] == {
        "triggered": "precheck_passed",
        "escalated": "",
        "restored": "",
    }
