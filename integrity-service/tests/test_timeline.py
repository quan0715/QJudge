from uuid import UUID

import pytest

from integrity_service.core.commands import EngineContext
from integrity_service.core.connectivity import ConnectivityMonitor
from integrity_service.core.incidents import IncidentEngine
from integrity_service.core.records import snapshot_event_record
from integrity_service.core.registry import Registry
from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.core.sequencer import SessionSequencer
from integrity_service.core.timeline import (
    BatchReceiptEntry,
    DecisionTimeline,
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
    payload: dict[str, object] | None = None,
    kind: str = "event",
):
    return snapshot_event_record(
        EventRecord(
            event_id=UUID(event_id),
            seq=seq,
            kind=kind,
            event_type=event_type,
            event_schema_version=1,
            client_occurred_at_ms=client_ms,
            client_recorded_at_ms=client_ms,
            monotonic_ms=float(client_ms),
            payload={"reason": "timeline"} if payload is None else payload,
        )
    )


def test_health_snapshot_stays_in_raw_journal_without_becoming_a_semantic_event():
    registry = registry_snapshot()
    registry["definitions"]["health_snapshot"] = {
        "id": "health_snapshot",
        "schema_version": 1,
        "origin": "browser",
        "signals": {
            "triggered": "health_snapshot",
            "escalated": "",
            "restored": "",
        },
        "emission": "health_snapshot",
        "incident_family": "connectivity",
        "priority": 3,
        "grace_ms": 0,
        "evidence": {
            "mode": "none",
            "sources": [],
            "before_ms": 0,
            "after_ms": 0,
            "max_segment_ms": 60_000,
        },
        "action": "record_event",
        "metadata_schema": {"type": "object", "additionalProperties": True},
    }
    subject = timeline(TimelineBaseline(0, 0, (101,)), snapshot=registry)
    snapshot = admitted_record(
        seq=1,
        event_type="health_snapshot",
        event_id="00000000-0000-0000-0000-000000000706",
        client_ms=1_000,
        payload={"online": True},
        kind="health_snapshot",
    )

    commands = subject.apply(
        BatchReceiptEntry(
            1,
            1_000,
            UUID("00000000-0000-0000-0000-000000000707"),
            101,
            "device-1",
        ),
        records=(snapshot,),
    )

    assert commands == ()
    assert subject._connectivity.next_transition_server_ms() == 16_000


def test_exam_submission_closes_connectivity_tracking():
    registry = registry_snapshot()
    registry["definitions"]["exam_submit_initiated"] = {
        "id": "exam_submit_initiated",
        "schema_version": 1,
        "origin": "browser",
        "signals": {
            "triggered": "exam_submit_initiated",
            "escalated": "",
            "restored": "",
        },
        "emission": "every",
        "incident_family": "exam_lifecycle",
        "priority": 3,
        "grace_ms": 0,
        "evidence": {
            "mode": "none",
            "sources": [],
            "before_ms": 0,
            "after_ms": 0,
            "max_segment_ms": 60_000,
        },
        "action": "record_event",
        "metadata_schema": {"type": "object", "additionalProperties": True},
    }
    subject = timeline(
        TimelineBaseline(0, 0, (101,)),
        snapshot=registry,
    )
    submitted = admitted_record(
        seq=1,
        event_type="exam_submit_initiated",
        event_id="00000000-0000-0000-0000-000000000708",
        client_ms=1_000,
    )

    received = subject.apply(
        BatchReceiptEntry(
            1,
            1_000,
            UUID("00000000-0000-0000-0000-000000000709"),
            101,
            "device-1",
        ),
        records=(submitted,),
    )
    # Evidence-drain receipts after submit do not restart an exam's timer.
    drained = subject.apply(BatchReceiptEntry(
        2, 2_000, UUID("00000000-0000-0000-0000-000000000710"), 101, "device-1",
    ))
    later = subject.advance_to(100_000)

    assert [command.event_type for command in received] == ["exam_submit_initiated"]
    assert drained == ()
    assert later == ()


def timeline(
    baseline: TimelineBaseline,
    *,
    snapshot: dict | None = None,
) -> DecisionTimeline:
    registry = Registry(snapshot or registry_snapshot())
    context = EngineContext(RUN_ID)
    return DecisionTimeline(
        baseline=baseline,
        incidents=IncidentEngine(registry, context),
        connectivity=ConnectivityMonitor(POLICY, registry, context),
    )


def test_timeline_contract_projects_durable_baseline_and_receipt_entries():
    baseline = TimelineBaseline(
        timeline_seq=0,
        server_ms=0,
        active_participant_ids=(101, 202),
    )
    received = BatchReceiptEntry(
        timeline_seq=1,
        server_ms=1_000,
        batch_id=UUID("00000000-0000-0000-0000-000000000701"),
        participant_id=101,
        device_id="device-1",
    )
    assert baseline.to_json() == {
        "kind": "baseline",
        "timeline_seq": 0,
        "server_ms": 0,
        "active_participant_ids": [101, 202],
    }
    assert received.to_json()["kind"] == "batch_receipt"


def test_receipt_clock_advances_connectivity_without_submission_authority():
    subject = timeline(
        TimelineBaseline(0, 0, (101,)),
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
        ("connectivity_timeout", "pause"),
    ]


def test_same_time_batch_receipts_follow_timeline_seq_and_tick_zero_grace_after_each():
    snapshot = registry_snapshot()
    snapshot["definitions"]["fullscreen"]["grace_ms"] = 0
    subject = timeline(TimelineBaseline(0, 0, (101,)), snapshot=snapshot)
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
    subject = timeline(TimelineBaseline(0, 0, (101,)))
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
    baseline = TimelineBaseline(0, 0, (101,))
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


def test_exact_retry_empty_receipt_restores_connectivity_and_replays_stably():
    baseline = TimelineBaseline(0, 0, (101,))
    original = EventRecord(
        event_id=UUID("00000000-0000-0000-0000-000000000751"),
        seq=1,
        kind="event",
        event_type="exit_fullscreen_triggered",
        event_schema_version=1,
        client_occurred_at_ms=0,
        client_recorded_at_ms=0,
        monotonic_ms=0.0,
        payload={"reason": "timeline"},
    )
    batch = EventBatch(
        schema_version=1,
        batch_id=UUID("00000000-0000-0000-0000-000000000752"),
        run_id=RUN_ID,
        participant_id=101,
        device_id="device-1",
        registry_version="registry-v2",
        first_seq=1,
        last_seq=1,
        records=[original],
        client_build="timeline-test",
    )
    sequencer = SessionSequencer()
    first = sequencer.accept(batch)
    retry = sequencer.accept(batch)
    assert retry.new_records == ()

    def run_once():
        subject = timeline(baseline)
        commands = list(
            subject.apply(
                BatchReceiptEntry(1, 0, batch.batch_id, 101, "device-1"),
                records=first.new_records,
            )
        )
        commands.extend(subject.advance_to(15_000))
        commands.extend(
            subject.apply(
                BatchReceiptEntry(
                    2,
                    15_001,
                    UUID("00000000-0000-0000-0000-000000000753"),
                    101,
                    "device-1",
                ),
                records=retry.new_records,
            )
        )
        assert subject._last_timeline_seq == 2
        return tuple(commands)

    first_run = run_once()
    second_run = run_once()

    assert [command.event_type for command in first_run] == [
        "exit_fullscreen_triggered",
        "connectivity_suspect",
        "connectivity_restored",
    ]
    assert [command.to_json() for command in first_run] == [
        command.to_json() for command in second_run
    ]


@pytest.mark.parametrize(
    ("event_type", "payload", "skip_code"),
    [
        ("unknown_browser_signal", {"reason": "timeline"}, "unknown_signal"),
        ("exit_fullscreen_triggered", {}, "invalid_payload"),
    ],
)
def test_receipt_preflight_skips_bad_browser_records_before_any_engine_mutation(
    event_type, payload, skip_code
):
    baseline = TimelineBaseline(0, 0, (101,))
    trigger = admitted_record(
        seq=1,
        event_type="exit_fullscreen_triggered",
        event_id="00000000-0000-0000-0000-000000000761",
        client_ms=0,
    )
    valid = admitted_record(
        seq=2,
        event_type="fullscreen_restored",
        event_id="00000000-0000-0000-0000-000000000764",
        client_ms=30_000,
    )
    bad = admitted_record(
        seq=3,
        event_type=event_type,
        event_id="00000000-0000-0000-0000-000000000762",
        client_ms=0,
        payload=payload,
    )
    entry = BatchReceiptEntry(
        2,
        30_000,
        UUID("00000000-0000-0000-0000-000000000763"),
        101,
        "device-1",
    )
    subject = timeline(baseline)
    subject.apply(
        BatchReceiptEntry(
            1,
            0,
            UUID("00000000-0000-0000-0000-000000000765"),
            101,
            "device-1",
        ),
        records=(trigger,),
    )

    plan = subject.plan_receipt(records=(valid, bad))
    commands = subject.apply(entry, records=(valid, bad))

    assert plan.accepted_records == (valid,)
    assert [(item.record, item.code) for item in plan.skipped_records] == [
        (bad, skip_code)
    ]
    assert [command.event_type for command in commands] == [
        "connectivity_suspect",
        "exit_fullscreen",
        "connectivity_restored",
        "fullscreen_restored",
    ]
    assert subject._last_timeline_seq == 2

    fresh = timeline(baseline)
    fresh.apply(
        BatchReceiptEntry(
            1,
            0,
            UUID("00000000-0000-0000-0000-000000000765"),
            101,
            "device-1",
        ),
        records=(trigger,),
    )
    fresh_commands = fresh.apply(entry, records=(valid,))
    assert [command.to_json() for command in commands] == [
        command.to_json() for command in fresh_commands
    ]


def test_structurally_rejected_receipt_leaves_timeline_and_engines_unchanged():
    baseline = TimelineBaseline(0, 0, (101,))
    trigger = admitted_record(
        seq=1,
        event_type="exit_fullscreen_triggered",
        event_id="00000000-0000-0000-0000-000000000771",
        client_ms=0,
    )
    restored = admitted_record(
        seq=2,
        event_type="fullscreen_restored",
        event_id="00000000-0000-0000-0000-000000000772",
        client_ms=30_000,
    )
    first_entry = BatchReceiptEntry(
        1,
        0,
        UUID("00000000-0000-0000-0000-000000000773"),
        101,
        "device-1",
    )
    subject = timeline(baseline)
    subject.apply(first_entry, records=(trigger,))

    with pytest.raises(TimelineOrderError, match="timeline_seq"):
        subject.apply(
            BatchReceiptEntry(
                3,
                30_000,
                UUID("00000000-0000-0000-0000-000000000774"),
                101,
                "device-1",
            ),
            records=(restored,),
        )

    assert subject._last_timeline_seq == 1
    assert subject._clock_server_ms == 0
    assert subject._incidents.next_deadline_server_ms() == 30_000
    assert subject._connectivity.next_transition_server_ms() == 15_000

    retry_entry = BatchReceiptEntry(
        2,
        30_000,
        UUID("00000000-0000-0000-0000-000000000775"),
        101,
        "device-1",
    )
    retry_commands = subject.apply(retry_entry, records=(restored,))

    fresh = timeline(baseline)
    fresh.apply(first_entry, records=(trigger,))
    fresh_commands = fresh.apply(retry_entry, records=(restored,))
    assert [command.to_json() for command in retry_commands] == [
        command.to_json() for command in fresh_commands
    ]
