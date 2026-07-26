from dataclasses import FrozenInstanceError
from uuid import UUID

import pytest

from integrity_service.core.commands import (
    EngineContext,
    ReceivedEvent,
    deterministic_uuid,
)
from integrity_service.core.connectivity import ConnectivityMonitor
from integrity_service.core.incidents import IncidentEngine
from integrity_service.core.records import snapshot_event_record
from integrity_service.core.registry import Registry
from integrity_service.core.schemas import EventRecord

from test_registry import registry_snapshot


RUN_ID = UUID("00000000-0000-0000-0000-000000000111")


def signal(
    event_type: str,
    *,
    server_ms: int,
    event_id: str,
    participant_id: int = 101,
    device_id: str = "device-1",
    client_occurred_at_ms: int | None = None,
    delayed_delivery: bool = False,
) -> ReceivedEvent:
    occurred_ms = server_ms if client_occurred_at_ms is None else client_occurred_at_ms
    return ReceivedEvent(
        participant_id=participant_id,
        device_id=device_id,
        record=snapshot_event_record(
            EventRecord(
                event_id=UUID(event_id),
                seq=1,
                kind="event",
                event_type=event_type,
                event_schema_version=1,
                client_occurred_at_ms=occurred_ms,
                client_recorded_at_ms=occurred_ms,
                monotonic_ms=float(occurred_ms),
                payload={"reason": "test"},
                evidence_descriptors=[],
            )
        ),
        received_at_server_ms=server_ms,
        delayed_delivery=delayed_delivery,
    )


def engine() -> IncidentEngine:
    return IncidentEngine(
        Registry(registry_snapshot()),
        EngineContext(run_id=RUN_ID),
    )


def engine_with_delivery_tolerance(tolerance_ms: int) -> IncidentEngine:
    return IncidentEngine(
        Registry(registry_snapshot()),
        EngineContext(run_id=RUN_ID),
        delivery_tolerance_ms=tolerance_ms,
    )


def test_trigger_restore_inside_grace_closes_without_pause():
    subject = engine()
    opened = subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000001",
        )
    )
    restored = subject.ingest(
        signal(
            "fullscreen_restored",
            server_ms=20_000,
            event_id="00000000-0000-0000-0000-000000000002",
        )
    )

    assert opened.commands[0].kind == "record_event"
    assert opened.commands[0].action == "record"
    assert {command.action for command in restored.commands} == {"audit"}
    assert subject.tick(40_000).commands == ()


def test_cross_checkpoint_restore_uses_client_duration_not_delivery_delay():
    subject = engine()
    subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            client_occurred_at_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000101",
        )
    )

    restored = subject.ingest(
        signal(
            "fullscreen_restored",
            server_ms=40_000,
            client_occurred_at_ms=1_900,
            event_id="00000000-0000-0000-0000-000000000102",
        )
    )

    assert [command.event_type for command in restored.commands] == [
        "fullscreen_restored"
    ]
    assert subject.tick(50_000).commands == ()


def test_invalid_restore_chronology_does_not_infer_grace_from_delivery_delay():
    subject = engine()
    subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            client_occurred_at_ms=2_000,
            event_id="00000000-0000-0000-0000-000000000103",
        )
    )

    restored = subject.ingest(
        signal(
            "fullscreen_restored",
            server_ms=40_000,
            client_occurred_at_ms=1_900,
            event_id="00000000-0000-0000-0000-000000000104",
        )
    )

    assert [command.event_type for command in restored.commands] == [
        "fullscreen_restored"
    ]


def test_delivery_tolerance_delays_timer_without_changing_client_grace():
    subject = engine_with_delivery_tolerance(5_000)
    subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            client_occurred_at_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000105",
        )
    )

    assert subject.tick(31_000).commands == ()
    restored = subject.ingest(
        signal(
            "fullscreen_restored",
            server_ms=32_000,
            client_occurred_at_ms=31_000,
            event_id="00000000-0000-0000-0000-000000000106",
        )
    )

    assert [command.event_type for command in restored.commands] == [
        "exit_fullscreen",
        "fullscreen_restored",
    ]


def test_trigger_escalates_at_exact_registry_grace_boundary_once():
    subject = engine()
    subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000003",
        )
    )

    result = subject.tick(31_000)

    assert len(result.commands) == 1
    assert result.commands[0].event_type == "exit_fullscreen"
    assert result.commands[0].action == "pause"
    assert result.commands[0].received_at_server_ms == 31_000
    assert subject.tick(31_001).commands == ()


def test_duplicate_trigger_does_not_open_or_postpone_incident():
    subject = engine()
    first = subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000004",
        )
    )
    duplicate = subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=20_000,
            event_id="00000000-0000-0000-0000-000000000005",
        )
    )

    assert duplicate.commands[0].action == "audit"
    assert duplicate.commands[0].incident_id == first.commands[0].incident_id
    assert subject.tick(31_000).commands[0].action == "pause"


def test_late_signal_is_audit_only_and_creates_no_deadline():
    subject = engine()
    result = subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=100_000,
            client_occurred_at_ms=1_000,
            delayed_delivery=True,
            event_id="00000000-0000-0000-0000-000000000006",
        )
    )

    assert tuple(command.action for command in result.commands) == ("audit",)
    assert subject.tick(200_000).commands == ()


def test_replay_produces_equal_immutable_commands_and_ids():
    received = signal(
        "exit_fullscreen_triggered",
        server_ms=1_000,
        event_id="00000000-0000-0000-0000-000000000009",
    )

    first_engine = engine()
    second_engine = engine()
    first = first_engine.ingest(received).commands[0]
    second = second_engine.ingest(received).commands[0]

    assert first == second
    assert first.command_id == second.command_id
    assert first_engine.tick(31_000).commands == second_engine.tick(31_000).commands
    with pytest.raises(FrozenInstanceError):
        first.action = "pause"  # type: ignore[misc]
    with pytest.raises(TypeError):
        first.metadata["reason"] = "mutated"


def test_external_escalated_without_trigger_is_unique_audit_only():
    result = engine().ingest(
        signal(
            "exit_fullscreen",
            server_ms=100_000,
            event_id="00000000-0000-0000-0000-000000000010",
        )
    )

    assert len(result.commands) == 1
    assert result.commands[0].action == "audit"
    assert result.commands[0].incident_id is None


def test_external_escalated_before_deadline_never_authorizes_or_consumes_timer():
    subject = engine()
    opened = subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000011",
        )
    ).commands[0]
    external = subject.ingest(
        signal(
            "exit_fullscreen",
            server_ms=20_000,
            event_id="00000000-0000-0000-0000-000000000012",
        )
    ).commands[0]

    assert external.action == "audit"
    assert external.incident_id == opened.incident_id
    timer = subject.tick(31_000).commands[0]
    assert timer.action == "pause"
    assert timer.incident_id == opened.incident_id
    assert timer.command_id != external.command_id


def test_external_escalated_reusing_trigger_uuid_cannot_collide_with_timer_command():
    subject = engine()
    trigger_id = "00000000-0000-0000-0000-000000000013"
    subject.ingest(
        signal("exit_fullscreen_triggered", server_ms=1_000, event_id=trigger_id)
    )
    external = subject.ingest(
        signal("exit_fullscreen", server_ms=20_000, event_id=trigger_id)
    ).commands[0]
    timer = subject.tick(31_000).commands[0]

    assert external.action == "audit"
    assert timer.action == "pause"
    assert external.command_id != timer.command_id


def test_external_escalated_is_audit_only_when_delayed():
    subject = engine()

    command = subject.ingest(
        signal(
            "exit_fullscreen",
            server_ms=100_000,
            event_id="00000000-0000-0000-0000-000000000014",
            delayed_delivery=True,
        )
    ).commands[0]

    assert command.action == "audit"
    assert subject.tick(200_000).commands == ()


def test_external_escalated_after_deadline_does_not_replace_canonical_timer_snapshot():
    subject = engine()
    subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000015",
        )
    )
    external = subject.ingest(
        signal(
            "exit_fullscreen",
            server_ms=90_000,
            event_id="00000000-0000-0000-0000-000000000016",
        )
    ).commands[0]
    timer = subject.tick(90_000).commands[0]

    assert external.action == "audit"
    assert timer.action == "pause"
    assert timer.received_at_server_ms == 31_000
    assert timer.metadata == {"reason": "test"}


def test_open_incident_snapshots_mutable_trigger_before_later_escalation():
    mutable_wire = EventRecord(
        event_id=UUID("00000000-0000-0000-0000-000000000017"),
        seq=1,
        kind="event",
        event_type="exit_fullscreen_triggered",
        event_schema_version=1,
        client_occurred_at_ms=1_000,
        client_recorded_at_ms=1_000,
        monotonic_ms=1_000.0,
        payload={"reason": "test"},
    )
    mutable = ReceivedEvent(
        participant_id=101,
        device_id="device-1",
        record=snapshot_event_record(mutable_wire),
        received_at_server_ms=1_000,
    )
    baseline = engine()
    subject = engine()
    baseline.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000017",
        )
    )
    subject.ingest(mutable)

    mutable_wire.event_id = UUID("00000000-0000-0000-0000-000000000099")
    mutable_wire.client_occurred_at_ms = 999
    mutable_wire.payload["reason"] = "mutated"

    assert subject.tick(31_000).commands == baseline.tick(31_000).commands


def test_incident_complete_phase_values_and_uuidv5_formula_are_pinned():
    subject = engine()
    trigger = subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000018",
        )
    ).commands[0]
    duplicate = subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=2_000,
            event_id="00000000-0000-0000-0000-000000000019",
        )
    ).commands[0]
    escalation = subject.tick(31_000).commands[0]
    restore = subject.ingest(
        signal(
            "fullscreen_restored",
            server_ms=32_000,
            event_id="00000000-0000-0000-0000-000000000020",
        )
    ).commands[0]

    import json
    from uuid import uuid5

    trigger_event_id = UUID("00000000-0000-0000-0000-000000000018")
    duplicate_event_id = UUID("00000000-0000-0000-0000-000000000019")
    restore_event_id = UUID("00000000-0000-0000-0000-000000000020")
    incident_id = uuid5(
        RUN_ID,
        json.dumps(
            ("incident", 101, "fullscreen", trigger_event_id),
            ensure_ascii=False,
            separators=(",", ":"),
            default=str,
        ),
    )
    evidence = {"sources": ["screen_share"], "before_ms": 10_000, "after_ms": 10_000}
    rows = [
        (
            trigger,
            trigger_event_id,
            "triggered",
            "exit_fullscreen_triggered",
            "record",
            1_000,
            1_000,
        ),
        (
            duplicate,
            duplicate_event_id,
            "triggered",
            "exit_fullscreen_triggered",
            "audit",
            2_000,
            2_000,
        ),
        (
            escalation,
            trigger_event_id,
            "escalated",
            "exit_fullscreen",
            "pause",
            1_000,
            31_000,
        ),
        (
            restore,
            restore_event_id,
            "restored",
            "fullscreen_restored",
            "audit",
            32_000,
            32_000,
        ),
    ]
    for command, event_id, phase, event_type, action, client_ms, server_ms in rows:
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
            "client_occurred_at_ms": client_ms,
            "received_at_server_ms": server_ms,
            "delayed_delivery": False,
            "evidence": evidence,
            "metadata": {"reason": "test"},
        }


@pytest.mark.parametrize(
    ("restore_ms", "event_types", "actions"),
    [
        (30_999, ("fullscreen_restored",), ("audit",)),
        (31_000, ("exit_fullscreen", "fullscreen_restored"), ("pause", "audit")),
        (31_001, ("exit_fullscreen", "fullscreen_restored"), ("pause", "audit")),
    ],
)
def test_restore_before_exact_and_after_deadline_has_complete_order(
    restore_ms, event_types, actions
):
    subject = engine()
    subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000021",
        )
    )

    result = subject.ingest(
        signal(
            "fullscreen_restored",
            server_ms=restore_ms,
            event_id="00000000-0000-0000-0000-000000000022",
        )
    )

    assert tuple(command.event_type for command in result.commands) == event_types
    assert tuple(command.action for command in result.commands) == actions
    assert subject.tick(100_000).commands == ()


def test_server_owned_browser_claims_cannot_change_connectivity_or_alias_monitor_ids():
    registry = Registry(registry_snapshot())
    context = EngineContext(run_id=RUN_ID)
    incidents = IncidentEngine(registry, context)
    monitor = ConnectivityMonitor(
        {"suspect_after_ms": 15_000, "disconnected_after_ms": 60_000},
        registry,
        context,
    )
    monitor.observe(participant_id=101, device_id="device-1", server_ms=1_000)
    predictable_monitor_event_id = deterministic_uuid(
        RUN_ID,
        "connectivity-event",
        101,
        "device-1",
        "connectivity_suspect",
        16_000,
    )

    forged = [
        incidents.ingest(
            signal(
                "connectivity_suspect",
                server_ms=2_000,
                event_id=str(predictable_monitor_event_id),
            )
        ).commands[0],
        incidents.ingest(
            signal(
                "connectivity_timeout",
                server_ms=3_000,
                event_id="00000000-0000-0000-0000-000000000090",
            )
        ).commands[0],
        incidents.ingest(
            signal(
                "connectivity_restored",
                server_ms=4_000,
                event_id="00000000-0000-0000-0000-000000000091",
            )
        ).commands[0],
    ]

    assert [command.action for command in forged] == ["audit", "audit", "audit"]
    assert [command.incident_id for command in forged] == [None, None, None]
    assert incidents.tick(100_000).commands == ()
    authoritative = monitor.tick(61_000)
    assert [command.event_type for command in authoritative] == [
        "connectivity_suspect",
        "connectivity_timeout",
    ]
    assert [command.action for command in authoritative] == ["record", "pause"]

    command_by_id = {}
    for command in (*forged, *authoritative):
        previous = command_by_id.setdefault(command.command_id, command)
        assert previous == command
    assert len(command_by_id) == len(forged) + len(authoritative)
