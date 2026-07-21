from uuid import UUID

import pytest

from integrity_service.core.commands import EngineContext, SubmissionState
from integrity_service.core.connectivity import ConnectivityMonitor
from integrity_service.core.incidents import IncidentEngine
from integrity_service.core.records import snapshot_event_record
from integrity_service.core.registry import Registry
from integrity_service.core.scheduler import DeadlineScheduler
from integrity_service.core.schemas import EventRecord
from integrity_service.core.timeline import (
    BatchReceiptEntry,
    DecisionTimeline,
    SubmissionEntry,
    TimelineBaseline,
    TimelineOrderError,
)

from test_registry import registry_snapshot


RUN_ID = UUID("00000000-0000-0000-0000-000000000777")
POLICY = {"suspect_after_ms": 15_000, "disconnected_after_ms": 60_000}


def admitted_record(
    *,
    seq: int,
    event_type: str,
    event_id: str,
    client_ms: int,
):
    return snapshot_event_record(
        EventRecord(
            event_id=UUID(event_id),
            seq=seq,
            kind="event",
            event_type=event_type,
            event_schema_version=1,
            client_occurred_at_ms=client_ms,
            client_recorded_at_ms=client_ms,
            monotonic_ms=float(client_ms),
            payload={"reason": "timeline"},
        )
    )


def timeline(
    baseline: TimelineBaseline,
    *,
    scheduled_end_ms: int = 100_000,
    snapshot: dict | None = None,
) -> DecisionTimeline:
    registry = Registry(snapshot or registry_snapshot())
    context = EngineContext(RUN_ID)
    submissions = SubmissionState()
    return DecisionTimeline(
        baseline=baseline,
        incidents=IncidentEngine(registry, context, submissions),
        connectivity=ConnectivityMonitor(POLICY, registry, context, submissions),
        scheduler=DeadlineScheduler(scheduled_end_ms, context, submissions),
        submissions=submissions,
    )


def test_timeline_contract_projects_durable_baseline_receipt_and_submission_entries():
    baseline = TimelineBaseline(
        timeline_seq=0,
        server_ms=0,
        active_participant_ids=(101, 202),
        submitted_participant_ids=(202,),
    )
    received = BatchReceiptEntry(
        timeline_seq=1,
        server_ms=1_000,
        batch_id=UUID("00000000-0000-0000-0000-000000000701"),
        participant_id=101,
        device_id="device-1",
    )
    submitted = SubmissionEntry(
        timeline_seq=2,
        server_ms=2_000,
        participant_id=101,
        source="manual",
    )

    assert baseline.to_json() == {
        "kind": "baseline",
        "timeline_seq": 0,
        "server_ms": 0,
        "active_participant_ids": [101, 202],
        "submitted_participant_ids": [202],
    }
    assert received.to_json()["kind"] == "batch_receipt"
    assert submitted.to_json() == {
        "kind": "submission",
        "timeline_seq": 2,
        "server_ms": 2_000,
        "participant_id": 101,
        "source": "manual",
    }


def test_persisted_baseline_submission_state_is_applied_before_first_advance():
    subject = timeline(
        TimelineBaseline(0, 0, (101, 202), (202,)),
        scheduled_end_ms=50_000,
    )

    commands = subject.advance_to(50_000)

    assert [(command.participant_id, command.action) for command in commands] == [
        (101, "submit")
    ]


def test_equal_time_manual_submission_is_ordered_after_already_due_escalation():
    subject = timeline(
        TimelineBaseline(0, 0, (101,), ()),
        scheduled_end_ms=100_000,
    )
    trigger = admitted_record(
        seq=1,
        event_type="exit_fullscreen_triggered",
        event_id="00000000-0000-0000-0000-000000000711",
        client_ms=1_000,
    )
    subject.apply(
        BatchReceiptEntry(
            1,
            1_000,
            UUID("00000000-0000-0000-0000-000000000712"),
            101,
            "device-1",
        ),
        records=(trigger,),
    )

    commands = subject.apply(SubmissionEntry(2, 31_000, 101, "manual"))

    assert [(command.event_type, command.action) for command in commands] == [
        ("connectivity_suspect", "record"),
        ("exit_fullscreen", "pause"),
    ]
    assert [
        (command.event_type, command.action)
        for command in subject.advance_to(100_000)
    ] == [("heartbeat_timeout", "audit")]


def test_scheduled_end_wins_equal_time_tie_with_connectivity_timeout():
    subject = timeline(
        TimelineBaseline(0, 0, (101,), ()),
        scheduled_end_ms=61_000,
    )
    forged_server_signal = admitted_record(
        seq=1,
        event_type="connectivity_suspect",
        event_id="00000000-0000-0000-0000-000000000721",
        client_ms=1_000,
    )
    subject.apply(
        BatchReceiptEntry(
            1,
            1_000,
            UUID("00000000-0000-0000-0000-000000000722"),
            101,
            "device-1",
        ),
        records=(forged_server_signal,),
    )

    commands = subject.advance_to(61_000)

    assert [(command.event_type, command.action) for command in commands] == [
        ("connectivity_suspect", "record"),
        ("scheduled_end", "submit"),
        ("heartbeat_timeout", "audit"),
    ]


def test_same_time_batch_receipts_follow_timeline_seq_and_tick_zero_grace_after_each():
    snapshot = registry_snapshot()
    snapshot["definitions"]["fullscreen"]["grace_ms"] = 0
    subject = timeline(TimelineBaseline(0, 0, (101,), ()), snapshot=snapshot)
    trigger = admitted_record(
        seq=1,
        event_type="exit_fullscreen_triggered",
        event_id="00000000-0000-0000-0000-000000000731",
        client_ms=10_000,
    )
    restore = admitted_record(
        seq=2,
        event_type="fullscreen_restored",
        event_id="00000000-0000-0000-0000-000000000732",
        client_ms=10_000,
    )

    first = subject.apply(
        BatchReceiptEntry(
            1,
            10_000,
            UUID("00000000-0000-0000-0000-000000000733"),
            101,
            "device-1",
        ),
        records=(trigger,),
    )
    second = subject.apply(
        BatchReceiptEntry(
            2,
            10_000,
            UUID("00000000-0000-0000-0000-000000000734"),
            101,
            "device-1",
        ),
        records=(restore,),
    )

    assert [command.event_type for command in first + second] == [
        "exit_fullscreen_triggered",
        "exit_fullscreen",
        "fullscreen_restored",
    ]
    with pytest.raises(TimelineOrderError, match="timeline_seq"):
        subject.apply(
            BatchReceiptEntry(
                2,
                10_000,
                UUID("00000000-0000-0000-0000-000000000735"),
                101,
                "device-1",
            ),
            records=(restore,),
        )


def test_receipt_preserves_per_record_delayed_delivery_decision_input():
    subject = timeline(TimelineBaseline(0, 0, (101,), ()))
    delayed = admitted_record(
        seq=1,
        event_type="exit_fullscreen_triggered",
        event_id="00000000-0000-0000-0000-000000000736",
        client_ms=1_000,
    )
    current = admitted_record(
        seq=2,
        event_type="exit_fullscreen_triggered",
        event_id="00000000-0000-0000-0000-000000000737",
        client_ms=10_000,
    )

    commands = subject.apply(
        BatchReceiptEntry(
            1,
            10_000,
            UUID("00000000-0000-0000-0000-000000000738"),
            101,
            "device-1",
        ),
        records=(delayed, current),
        delayed_event_ids=frozenset((delayed.event_id,)),
    )

    assert [command.delayed_delivery for command in commands] == [True, False]
    assert [command.action for command in commands] == ["audit", "record"]


def test_replaying_identical_baseline_and_entries_returns_identical_command_values():
    baseline = TimelineBaseline(0, 0, (101,), ())
    trigger = admitted_record(
        seq=1,
        event_type="exit_fullscreen_triggered",
        event_id="00000000-0000-0000-0000-000000000741",
        client_ms=1_000,
    )
    entries = (
        (
            BatchReceiptEntry(
                1,
                1_000,
                UUID("00000000-0000-0000-0000-000000000742"),
                101,
                "device-1",
            ),
            (trigger,),
        ),
        (SubmissionEntry(2, 31_000, 101, "manual"), ()),
    )

    def run_once():
        subject = timeline(baseline)
        commands = []
        for entry, records in entries:
            commands.extend(subject.apply(entry, records=records))
        return tuple(commands)

    first = run_once()
    second = run_once()

    assert first == second
    assert [command.to_json() for command in first] == [
        command.to_json() for command in second
    ]
