from uuid import UUID

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
    assert subject.tick(61_000)[0].event_type == "heartbeat_timeout"


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
        (101, "heartbeat_timeout"),
        (202, "connectivity_suspect"),
        (202, "heartbeat_timeout"),
    ]


def test_connectivity_commands_never_use_browser_timestamps():
    subject = monitor()
    subject.observe(participant_id=101, device_id="device-1", server_ms=1_000)

    command = subject.tick(16_000)[0]

    assert command.client_occurred_at_ms == 16_000
    assert command.received_at_server_ms == 16_000
    assert command.metadata["timing_basis"] == "server_receipt"
