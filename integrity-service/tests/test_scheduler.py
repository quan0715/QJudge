from uuid import UUID

from integrity_service.core.commands import EngineContext
from integrity_service.core.scheduler import DeadlineScheduler


RUN_ID = UUID("00000000-0000-0000-0000-000000000333")


def scheduler() -> DeadlineScheduler:
    return DeadlineScheduler(
        scheduled_end_ms=50_000,
        context=EngineContext(run_id=RUN_ID),
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
