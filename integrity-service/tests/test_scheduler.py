from uuid import UUID

from integrity_service.core.commands import EngineContext, SubmissionState
from integrity_service.core.scheduler import DeadlineScheduler

from test_registry import registry_snapshot


RUN_ID = UUID("00000000-0000-0000-0000-000000000333")


def scheduler(submissions: SubmissionState | None = None) -> DeadlineScheduler:
    return DeadlineScheduler(
        scheduled_end_ms=50_000,
        context=EngineContext(run_id=RUN_ID),
        submissions=submissions or SubmissionState(),
    )


def test_scheduler_emits_one_sorted_auto_submit_per_active_participant():
    subject = scheduler()

    assert subject.tick(49_999, {303, 101, 202}) == ()
    commands = subject.tick(50_000, {303, 101, 202})

    assert [command.participant_id for command in commands] == [101, 202, 303]
    assert {command.kind for command in commands} == {"auto_submit"}
    assert {command.action for command in commands} == {"submit"}
    assert all("stop" not in command.kind for command in commands)


def test_scheduler_is_idempotent_and_skips_marked_submissions():
    subject = scheduler()
    subject.mark_submitted(202)

    first = subject.tick(50_001, {101, 202})

    assert [command.participant_id for command in first] == [101]
    assert subject.tick(60_000, {101, 202}) == ()


def test_scheduler_replay_is_deterministic():
    first = scheduler().tick(50_000, {202, 101})
    second = scheduler().tick(99_999, {101, 202})

    assert first == second
    assert [command.received_at_server_ms for command in first] == [50_000, 50_000]


def test_scheduler_dynamic_membership_after_deadline_never_repeats_submission():
    subject = scheduler()

    assert [c.participant_id for c in subject.tick(50_000, {101})] == [101]
    assert subject.tick(51_000, set()) == ()
    assert subject.tick(52_000, {101}) == ()
    later = subject.tick(53_000, {101, 202})
    assert [c.participant_id for c in later] == [202]
    assert later[0].received_at_server_ms == 50_000


def test_any_engine_mark_submitted_updates_one_shared_owner():
    from integrity_service.core.connectivity import ConnectivityMonitor
    from integrity_service.core.incidents import IncidentEngine
    from integrity_service.core.registry import Registry

    for marker_name in ("incident", "connectivity", "scheduler"):
        submissions = SubmissionState()
        registry = Registry(registry_snapshot())
        context = EngineContext(run_id=RUN_ID)
        incident = IncidentEngine(registry, context, submissions)
        connectivity = ConnectivityMonitor(
            {"suspect_after_ms": 15_000, "disconnected_after_ms": 60_000},
            registry,
            context,
            submissions,
        )
        deadline = DeadlineScheduler(50_000, context, submissions)
        marker = {
            "incident": incident,
            "connectivity": connectivity,
            "scheduler": deadline,
        }[marker_name]

        marker.mark_submitted(101)
        connectivity.observe(participant_id=101, device_id="device-1", server_ms=1_000)
        assert connectivity.tick(16_000)[0].action == "audit"
        assert deadline.tick(50_000, {101}) == ()


def test_auto_submit_complete_value_and_uuidv5_formula_are_pinned():
    import json
    from uuid import uuid5

    command = scheduler().tick(50_000, {101})[0]
    event_name = json.dumps(
        ("scheduled-end", 101, 50_000),
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    event_id = uuid5(RUN_ID, event_name)
    command_name = json.dumps(
        (101, "scheduler", event_id, "auto_submit"),
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )

    assert command.command_id == uuid5(RUN_ID, command_name)
    assert command.to_json() == {
        "command_id": str(uuid5(RUN_ID, command_name)),
        "run_id": str(RUN_ID),
        "kind": "auto_submit",
        "participant_id": 101,
        "device_id": "scheduler",
        "incident_id": None,
        "event_type": "scheduled_end",
        "action": "submit",
        "client_occurred_at_ms": 50_000,
        "received_at_server_ms": 50_000,
        "delayed_delivery": False,
        "evidence": {},
        "metadata": {"scheduled_end_ms": 50_000},
    }
