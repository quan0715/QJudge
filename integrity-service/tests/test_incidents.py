from dataclasses import FrozenInstanceError
from uuid import UUID

import pytest

from integrity_service.core.commands import EngineContext, ReceivedEvent
from integrity_service.core.incidents import IncidentEngine
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
        record=EventRecord(
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
        ),
        received_at_server_ms=server_ms,
        delayed_delivery=delayed_delivery,
    )


def engine() -> IncidentEngine:
    return IncidentEngine(Registry(registry_snapshot()), EngineContext(run_id=RUN_ID))


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


def test_submitted_participant_commands_remain_audit_only():
    subject = engine()
    subject.mark_submitted(101)

    result = subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000007",
        )
    )

    assert tuple(command.action for command in result.commands) == ("audit",)
    assert subject.tick(100_000).commands == ()


def test_submission_changes_existing_deadline_to_audit_only():
    subject = engine()
    subject.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=1_000,
            event_id="00000000-0000-0000-0000-000000000008",
        )
    )
    subject.mark_submitted(101)

    assert subject.tick(31_000).commands[0].action == "audit"


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
