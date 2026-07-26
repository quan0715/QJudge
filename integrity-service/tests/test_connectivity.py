from uuid import UUID

import pytest

from integrity_service.core.commands import EngineContext
from integrity_service.core.connectivity import ConnectivityMonitor
from integrity_service.core.registry import Registry

from test_registry import registry_snapshot


RUN_ID = UUID("00000000-0000-0000-0000-000000000222")
POLICY = {"suspect_after_ms": 15_000, "disconnected_after_ms": 60_000}


def monitor() -> ConnectivityMonitor:
    return ConnectivityMonitor(
        POLICY,
        Registry(registry_snapshot()),
        EngineContext(run_id=RUN_ID),
    )


def test_connectivity_uses_server_receipt_time_and_exact_boundaries():
    subject = monitor()
    subject.observe(participant_id=101, device_id="device-1", server_ms=1_000)

    assert subject.tick(15_999) == ()
    assert subject.tick(16_000)[0].event_type == "connectivity_suspect"
    assert subject.tick(60_999) == ()
    assert subject.tick(61_000)[0].event_type == "connectivity_timeout"


def test_connectivity_transitions_are_one_shot_until_observation_restores():
    subject = monitor()
    subject.observe(participant_id=101, device_id="device-1", server_ms=1_000)

    suspect = subject.tick(16_000)
    assert subject.tick(30_000) == ()
    timeout = subject.tick(61_000)
    assert subject.tick(80_000) == ()

    restored = subject.observe(participant_id=101, device_id="device-1", server_ms=90_000)
    assert tuple(command.event_type for command in restored) == ("connectivity_restored",)
    assert restored[0].action == "audit"
    assert suspect[0].incident_id == timeout[0].incident_id == restored[0].incident_id
    assert suspect[0].command_id != timeout[0].command_id
    assert subject.tick(104_999) == ()
    assert subject.tick(105_000)[0].event_type == "connectivity_suspect"


def test_connectivity_replay_and_sort_order_are_deterministic():
    first = monitor()
    second = monitor()
    for subject in (first, second):
        subject.observe(participant_id=202, device_id="z-device", server_ms=1_000)
        subject.observe(participant_id=101, device_id="a-device", server_ms=1_000)

    first_commands = first.tick(61_000)
    second_commands = second.tick(61_000)

    assert first_commands == second_commands
    assert [(command.participant_id, command.event_type) for command in first_commands] == [
        (101, "connectivity_suspect"),
        (202, "connectivity_suspect"),
        (101, "connectivity_timeout"),
        (202, "connectivity_timeout"),
    ]


def test_connectivity_commands_never_use_browser_timestamps():
    subject = monitor()
    subject.observe(participant_id=101, device_id="device-1", server_ms=1_000)

    command = subject.tick(16_000)[0]

    assert command.client_occurred_at_ms == 16_000
    assert command.received_at_server_ms == 16_000
    assert command.metadata["timing_basis"] == "server_receipt"


def test_observe_advances_every_due_transition_before_restore_without_tick_dependency():
    without_ticks = monitor()
    with_ticks = monitor()
    without = []
    with_intermediary = []

    without.extend(
        without_ticks.observe(participant_id=101, device_id="device-1", server_ms=1_000)
    )
    without.extend(
        without_ticks.observe(participant_id=101, device_id="device-1", server_ms=90_000)
    )

    with_intermediary.extend(
        with_ticks.observe(participant_id=101, device_id="device-1", server_ms=1_000)
    )
    with_intermediary.extend(with_ticks.tick(16_000))
    with_intermediary.extend(with_ticks.tick(61_000))
    with_intermediary.extend(
        with_ticks.observe(participant_id=101, device_id="device-1", server_ms=90_000)
    )

    assert tuple(without) == tuple(with_intermediary)
    assert [command.event_type for command in without] == [
        "connectivity_suspect",
        "connectivity_timeout",
        "connectivity_restored",
    ]


def test_observe_at_suspect_boundary_emits_suspect_then_restore():
    subject = monitor()
    subject.observe(participant_id=101, device_id="device-1", server_ms=1_000)

    commands = subject.observe(
        participant_id=101, device_id="device-1", server_ms=16_000
    )

    assert [command.event_type for command in commands] == [
        "connectivity_suspect",
        "connectivity_restored",
    ]


def test_observe_at_timeout_boundary_emits_every_due_transition_then_restore():
    subject = monitor()
    subject.observe(participant_id=101, device_id="device-1", server_ms=1_000)

    commands = subject.observe(
        participant_id=101, device_id="device-1", server_ms=61_000
    )

    assert [command.event_type for command in commands] == [
        "connectivity_suspect",
        "connectivity_timeout",
        "connectivity_restored",
    ]


def test_multiple_devices_share_incident_and_only_one_applies_participant_action():
    subject = monitor()
    subject.observe(participant_id=101, device_id="device-a", server_ms=1_000)
    subject.observe(participant_id=101, device_id="device-b", server_ms=1_000)

    suspects = subject.tick(16_000)
    timeouts = subject.tick(61_000)

    assert len({command.incident_id for command in suspects + timeouts}) == 1
    assert [command.action for command in suspects] == ["record", "audit"]
    assert [command.action for command in timeouts] == ["pause", "audit"]

    partial = subject.observe(
        participant_id=101, device_id="device-a", server_ms=70_000
    )
    assert [command.event_type for command in partial] == ["connectivity_restored"]
    assert partial[0].incident_id == suspects[0].incident_id
    assert subject.tick(70_000) == ()

    final = subject.observe(
        participant_id=101, device_id="device-b", server_ms=71_000
    )
    assert [command.event_type for command in final] == ["connectivity_restored"]
    assert final[0].incident_id == suspects[0].incident_id
    assert subject.tick(71_000) == ()


def test_connectivity_complete_phase_values_and_uuidv5_formula_are_pinned():
    import json
    from uuid import uuid5

    subject = monitor()
    subject.observe(participant_id=101, device_id="device-1", server_ms=1_000)
    suspect, timeout = subject.tick(61_000)
    restored = subject.observe(
        participant_id=101, device_id="device-1", server_ms=70_000
    )[0]
    incident_id = uuid5(
        RUN_ID,
        json.dumps(
            ("connectivity-incident", 101, "connectivity", 16_000),
            ensure_ascii=False,
            separators=(",", ":"),
            default=str,
        ),
    )

    rows = [
        (suspect, "connectivity_suspect", "triggered", "record", 16_000),
        (timeout, "connectivity_timeout", "escalated", "pause", 61_000),
        (restored, "connectivity_restored", "restored", "audit", 70_000),
    ]
    for command, event_type, phase, action, transition_ms in rows:
        event_id = uuid5(
            RUN_ID,
            json.dumps(
                ("connectivity-event", 101, "device-1", event_type, transition_ms),
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            ),
        )
        command_id = uuid5(
            RUN_ID,
            json.dumps(
                (101, "device-1", event_id, phase),
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            ),
        )
        assert command.to_json() == {
            "command_id": str(command_id),
            "run_id": str(RUN_ID),
            "kind": "record_event",
            "participant_id": 101,
            "device_id": "device-1",
            "incident_id": str(incident_id),
            "event_type": event_type,
            "action": action,
            "client_occurred_at_ms": transition_ms,
            "received_at_server_ms": transition_ms,
            "delayed_delivery": False,
            "evidence": {},
            "metadata": {
                "timing_basis": "server_receipt",
                "last_received_at_server_ms": 1_000,
                "transition_at_server_ms": transition_ms,
            },
        }
