from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import threading
from uuid import uuid4

import pytest

from integrity_service.core.schemas import EventBatch
from integrity_service.resident.contracts import RunDescriptor
from integrity_service.resident.registry import RunRegistry, DescriptorConflict
from test_runtime_engine import bootstrap, FakeBackend, VALID_PUBLIC_KEY_B64, NOW_MS, batch_payload


def descriptor():
    return RunDescriptor(bootstrap(VALID_PUBLIC_KEY_B64), 1, NOW_MS, NOW_MS + 10000, NOW_MS + 310000, "active")


def test_independent_runs_single_flight_and_shutdown_preserves_receipts(tmp_path):
    first = descriptor()
    second = replace(first, bootstrap=replace(first.bootstrap, run_id=uuid4()))
    registry = RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend())
    with ThreadPoolExecutor(4) as pool:
        runtimes = list(pool.map(registry.ensure, [first] * 4))
    assert all(item is runtimes[0] for item in runtimes)
    a = runtimes[0]
    assert registry.ensure(second) is not a
    a.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
    registry.close()
    with pytest.raises(OSError):
        a.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
    recovered = RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend())
    try:
        a = recovered.ensure(replace(first, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000))
        assert len(a.receipts.pending()) == 1
        assert a.process_pending(1) == 1
    finally:
        recovered.close()


def test_descriptor_replay_and_immutable_snapshots(tmp_path):
    with RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend()) as registry:
        first = descriptor()
        registry.ensure(first)
        refreshed = replace(first, bootstrap=replace(first.bootstrap, server_ms=NOW_MS + 5, active_participant_ids=()))
        assert registry.ensure(refreshed) is registry.get(first.bootstrap.run_id)
        size = (tmp_path / str(first.bootstrap.run_id) / "descriptor.log").stat().st_size
        registry.ensure(replace(refreshed, bootstrap=replace(refreshed.bootstrap, server_ms=NOW_MS + 10)))
        assert (tmp_path / str(first.bootstrap.run_id) / "descriptor.log").stat().st_size == size
        with pytest.raises(DescriptorConflict):
            registry.ensure(replace(first, session_state="prepared"))
        with pytest.raises(DescriptorConflict):
            registry.ensure(replace(first, scheduled_end_ms=NOW_MS + 11000))
        registry.ensure(replace(first, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000))
        with pytest.raises(DescriptorConflict):
            registry.ensure(first)
        with pytest.raises(DescriptorConflict):
            registry.ensure(replace(first, schedule_revision=3, bootstrap=replace(first.bootstrap, policy_snapshot={})))


def test_blocked_callback_does_not_block_processing_or_same_run_intake(tmp_path):
    entered, release = threading.Event(), threading.Event()
    class SlowBackend(FakeBackend):
        def send_commands(self, commands):
            entered.set()
            assert release.wait(10)
            return super().send_commands(commands)

    registry = RunRegistry(root=tmp_path, backend_factory=lambda _: SlowBackend())
    a = registry.ensure(descriptor())
    b = registry.ensure(replace(descriptor(), bootstrap=replace(descriptor().bootstrap, run_id=uuid4())))
    a.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
    a.process_pending(1)
    with ThreadPoolExecutor(3) as pool:
        delivery = pool.submit(a.outbox.deliver_pending, a.backend, max_batches=1)
        try:
            assert entered.wait(5)
            next_batch = batch_payload(participant_id=202)
            a.accept_batch(EventBatch.model_validate(next_batch), NOW_MS + 1)
            processed = pool.submit(a.process_pending, 1)
            assert processed.result(timeout=2) == 1
            next_batch = batch_payload(participant_id=303)
            assert pool.submit(a.accept_batch, EventBatch.model_validate(next_batch), NOW_MS + 2).result(timeout=2).acked_through_seq == 1
            next_batch["run_id"] = str(b.run_id)
            assert pool.submit(b.accept_batch, EventBatch.model_validate(next_batch), NOW_MS + 2).result(timeout=2).acked_through_seq == 1
        finally:
            release.set()
            delivery.result(timeout=5)
            registry.close()


def test_recovery_uses_backend_revision_and_isolates_corrupt_run(tmp_path):
    first = descriptor()
    second = replace(first, bootstrap=replace(first.bootstrap, run_id=uuid4()))
    with RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend()) as registry:
        registry.ensure(first)
        b = registry.ensure(second)
        payload = batch_payload()
        payload["run_id"] = str(b.run_id)
        b.accept_batch(EventBatch.model_validate(payload), NOW_MS)
    corrupt = tmp_path / str(first.bootstrap.run_id) / "outbox" / "commands.log"
    corrupt.write_bytes(b"not-a-durable-log\n")
    with RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend()) as registry:
        latest = replace(second, schedule_revision=2, scheduled_end_ms=NOW_MS + 30000)
        registry.recover([first.to_payload(), latest.to_payload()])
        assert first.bootstrap.run_id in registry.errors
        assert registry.descriptor(second.bootstrap.run_id).schedule_revision == 2
        assert len(registry.get(second.bootstrap.run_id).receipts.pending()) == 1
        assert corrupt.read_bytes() == b"not-a-durable-log\n"


def test_volume_rejects_second_writer_and_registry_capacity_is_bounded(tmp_path):
    from integrity_service.resident.registry import RegistryFull
    with RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend(), max_runs=1) as registry:
        with pytest.raises(RuntimeError, match="writer"):
            RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend())
        registry.ensure(descriptor())
        with pytest.raises(RegistryFull):
            registry.ensure(replace(descriptor(), bootstrap=replace(descriptor().bootstrap, run_id=uuid4())))


@pytest.mark.parametrize("stored", [False, True])
def test_purge_reclaims_capacity_for_the_next_exam(tmp_path, stored):
    with RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend(), max_runs=1) as registry:
        retired_id = uuid4()
        if stored:
            (tmp_path / str(retired_id)).mkdir()
        assert registry.purge(retired_id) is stored
        assert registry.purge(retired_id) is False
        assert registry.purge(uuid4()) is False
        fresh = registry.ensure(descriptor())
        assert fresh.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS).acked_through_seq == 1


def test_maintenance_has_bounded_separate_lanes_and_retries_pending_delivery(tmp_path):
    from integrity_service.resident.maintenance import Maintenance, BoundedPool, Busy
    from integrity_service.resident.settings import ResidentSettings
    entered, release = threading.Event(), threading.Event()
    pool = BoundedPool(2, "test")
    def block():
        entered.set()
        assert release.wait(5)
    first = pool.submit("a", block)
    assert entered.wait(2)
    try:
        with pytest.raises(Busy):
            pool.submit("a", block)
        second = pool.submit("b", block)
        with pytest.raises(Busy):
            pool.submit("c", block)
    finally:
        release.set()
        first.result(timeout=2)
        second.result(timeout=2)
        pool.close()
    with RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(descriptor())
        runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
        settings = ResidentSettings(tmp_path, "", tmp_path / "unused", tmp_path / "unused")
        maintenance = Maintenance(registry, settings)
        try:
            maintenance.decisions.submit(runtime.run_id, maintenance._job, runtime.run_id, "decision").result(timeout=2)
            assert runtime.receipts.processed_cursor == 1
            runtime.backend.failures_remaining = 1
            maintenance.deliveries.submit(runtime.run_id, maintenance._job, runtime.run_id, "delivery").result(timeout=2)
            assert runtime.outbox.pending_commands
            maintenance.deliveries.submit(runtime.run_id, maintenance._job, runtime.run_id, "delivery").result(timeout=2)
            assert not runtime.outbox.pending_commands
        finally:
            maintenance.close()


def test_resident_receipt_processing_never_generates_authoritative_deadline_commands(tmp_path):
    with RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(descriptor())
        runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS + 20000)
        runtime.process_pending(1)
        runtime.outbox.deliver_pending(runtime.backend, max_batches=1)
        assert not any(command["event_type"] == "scheduled_end" for batch in runtime.backend.command_batches for command in batch)
    with RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(descriptor())
        runtime.outbox.deliver_pending(runtime.backend, max_batches=1)
        assert not any(command["event_type"] == "scheduled_end" for batch in runtime.backend.command_batches for command in batch)


@pytest.mark.parametrize("max_batches,expected_count", [(0, 0), (1, 100)])
def test_delivery_materializes_only_admitted_batch_from_large_backlog(tmp_path, monkeypatch, max_batches, expected_count):
    from integrity_service.journal import command_outbox
    outbox = command_outbox.CommandOutbox(tmp_path)
    commands = tuple({"command_id": str(uuid4()), "kind": "record_event", "metadata": {"evidence": "x" * 1000}} for _ in range(1000))
    outbox.append(commands)
    original = command_outbox._canonical_json
    materialized = []
    def canonical(value):
        if isinstance(value, dict) and "command_id" in value:
            materialized.append(value["command_id"])
        return original(value)
    monkeypatch.setattr(command_outbox, "_canonical_json", canonical)
    try:
        response = outbox.deliver_pending(FakeBackend(), max_batches=max_batches)
        assert materialized == [command["command_id"] for command in commands[:expected_count]]
        assert response.get("accepted_command_ids", []) == materialized
    finally:
        outbox.close()


def test_pending_delivery_index_rebuilds_without_resending_delivered_history(tmp_path):
    from integrity_service.journal.command_outbox import CommandOutbox
    commands = tuple({"command_id": str(uuid4()), "kind": "record_event"} for _ in range(250))
    outbox = CommandOutbox(tmp_path)
    try:
        outbox.append(commands)
        assert len(outbox.deliver_pending(FakeBackend(), max_batches=1)["accepted_command_ids"]) == 100
    finally:
        outbox.close()
    outbox = CommandOutbox(tmp_path)
    try:
        assert outbox.append(commands) is False
        assert outbox.pending_commands == commands[100:]
        response = outbox.deliver_pending(FakeBackend())
        assert response["accepted_command_ids"] == [command["command_id"] for command in commands[100:]]
        assert outbox.pending_commands == ()
    finally:
        outbox.close()
