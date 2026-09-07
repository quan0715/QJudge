from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import threading
from uuid import uuid4

import pytest

from integrity_service.resident.registry import RunRegistry
from integrity_service.core.schemas import EventBatch
from test_resident_registry import descriptor
from test_worker_api import FakeBackend, NOW_MS, batch_payload


class FinalizeBackend(FakeBackend):
    def __init__(self):
        super().__init__()
        self.revision = 1
        self.candidate = str(uuid4())
        self.published = None
        self.on_upload = None

    def finalize_control(self, body):
        from integrity_service.resident.lifecycle import StaleSchedule
        if body["revision"] != self.revision:
            raise StaleSchedule("stale revision")
        if self.published:
            return self.published
        if body["phase"] == "authorize":
            return {"archived": False, "run_id": str(descriptor().bootstrap.run_id),
                    "revision": self.revision, "candidate_id": self.candidate, "deadline_expired": True}
        key = f"runs/{descriptor().bootstrap.run_id}/resident-revision-{self.revision}/{self.candidate}/{body['sha256']}.json"
        if body["phase"] == "segment_upload":
            key = f"runs/{descriptor().bootstrap.run_id}/resident-segments/{body['sha256']}.journal.gz"
        if body["phase"] in {"upload", "segment_upload"}:
            return {"object_key": key, "upload_url": "memory://" + key, "sha256": body["sha256"]}
        self.published = {"archived": True, "run_id": str(descriptor().bootstrap.run_id),
                          "revision": self.revision, "manifest_key": key, "manifest_sha256": body["sha256"]}
        return self.published

    def upload_presigned(self, url, content, sha256, content_type):
        if self.on_upload:
            self.on_upload()
        return super().upload_presigned(url, content, sha256, content_type)


def test_old_finalize_cannot_close_extended_run(tmp_path):
    from integrity_service.resident.lifecycle import StaleSchedule
    first = descriptor()
    with RunRegistry(tmp_path, lambda _: FinalizeBackend()) as registry:
        registry.ensure(first)
        registry.ensure(replace(first, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000))
        with pytest.raises(StaleSchedule):
            registry.finalize(first.bootstrap.run_id, 1)
        assert registry.get(first.bootstrap.run_id).accepting


def test_extension_during_archive_resumes_and_cannot_publish_stale_candidate(tmp_path):
    from integrity_service.resident.lifecycle import StaleSchedule
    first, backend = descriptor(), FinalizeBackend()
    entered, release = threading.Event(), threading.Event()
    def block():
        entered.set()
        assert release.wait(5)
    backend.on_upload = block
    with RunRegistry(tmp_path, lambda _: backend) as registry:
        runtime = registry.ensure(first)
        with ThreadPoolExecutor(2) as pool:
            job = pool.submit(registry.finalize, runtime.run_id, 1)
            try:
                assert entered.wait(3)
                backend.revision = 2
                registry.ensure(replace(first, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000))
                assert runtime.accepting
                assert runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS).acked_through_seq == 1
            finally:
                release.set()
            with pytest.raises(StaleSchedule):
                job.result(timeout=3)
        assert backend.published is None


def test_failed_archive_retries_and_reclaims_slot_without_deleting_recovery(tmp_path):
    first, backend = descriptor(), FinalizeBackend()
    with RunRegistry(tmp_path, lambda _: backend, max_runs=1) as registry:
        runtime = registry.ensure(first)
        runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
        # First pass yields to the bounded decision lane before archive.
        assert registry.finalize(runtime.run_id, 1).archived is False
        runtime.process_pending(1)
        backend.fail_upload = True
        with pytest.raises(Exception):
            registry.finalize(runtime.run_id, 1)
        assert backend.published is None
        assert (tmp_path / str(runtime.run_id) / "receipts").exists()
        backend.fail_upload = False
        assert registry.finalize(runtime.run_id, 1).archived is True
        assert not any(c["kind"] in {"create_archive_upload", "publish_archive_manifest"}
                       for commands in backend.command_batches for c in commands)
        assert any("/resident-segments/" in key for key in backend.objects)
        assert runtime.run_id not in registry.run_ids()
        assert len(registry._locks) == 0
        assert (tmp_path / str(runtime.run_id) / "outbox" / "commands.log").exists()
        registry.ensure(replace(first, bootstrap=replace(first.bootstrap, run_id=uuid4())))
    with RunRegistry(tmp_path, lambda _: backend) as registry:
        with pytest.raises(ValueError):
            registry.ensure(first)


def test_blocked_archive_does_not_block_other_run_receipt_or_shutdown_archive(tmp_path):
    first, backend = descriptor(), FinalizeBackend()
    entered, release = threading.Event(), threading.Event()
    backend.on_upload = lambda: (entered.set(), release.wait(5))
    with RunRegistry(tmp_path, lambda _: backend) as registry:
        a = registry.ensure(first)
        b = registry.ensure(replace(first, bootstrap=replace(first.bootstrap, run_id=uuid4())))
        with ThreadPoolExecutor(2) as pool:
            job = pool.submit(registry.finalize, a.run_id, 1)
            try:
                assert entered.wait(3)
                batch = batch_payload()
                batch["run_id"] = str(b.run_id)
                assert pool.submit(b.accept_batch, EventBatch.model_validate(batch), NOW_MS).result(timeout=1).acked_through_seq == 1
            finally:
                release.set()
            assert job.result(timeout=3).archived
    assert b.receipts.processed_cursor == 0


def test_resident_receipt_rotation_bounds_archive_segment_memory(tmp_path):
    first = descriptor()
    bootstrap = replace(first.bootstrap, archive_policy={**dict(first.bootstrap.archive_policy), "max_segment_bytes": 1})
    with RunRegistry(tmp_path, lambda _: FinalizeBackend()) as registry:
        runtime = registry.ensure(replace(first, bootstrap=bootstrap))
        runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
        assert len(runtime.journal.sealed_segments) == 1


def test_archive_commit_response_loss_is_retried_without_backend_reconciler(tmp_path):
    from integrity_service.resident.maintenance import Maintenance
    from integrity_service.resident.settings import ResidentSettings
    from integrity_service.worker.backend_client import BackendDeliveryUncertain
    first, backend = descriptor(), FinalizeBackend()
    control = backend.finalize_control
    def lose_response(body):
        result = control(body)
        if body["phase"] == "commit":
            raise BackendDeliveryUncertain("response lost after commit")
        return result
    backend.finalize_control = lose_response
    with RunRegistry(tmp_path, lambda _: backend, max_runs=1) as registry:
        runtime = registry.ensure(first)
        with pytest.raises(BackendDeliveryUncertain):
            registry.finalize(runtime.run_id, 1)
        assert backend.published
        settings = ResidentSettings(tmp_path, "", tmp_path / "unused", tmp_path / "unused")
        maintenance = Maintenance(registry, settings)
        try:
            maintenance.tick()
        finally:
            maintenance.close()
        assert runtime.run_id not in registry.run_ids()


def test_trusted_gap_generation_survives_recovery_without_duplicate_append(tmp_path):
    first = descriptor()
    with RunRegistry(tmp_path, lambda _: FinalizeBackend()) as registry:
        runtime = registry.ensure(first)
        registry.apply_trusted_gap(runtime, {"generation": 2, "started_ms": NOW_MS - 10,
            "ended_ms": NOW_MS, "reason": "platform_unavailable"})
    with RunRegistry(tmp_path, lambda _: FinalizeBackend()) as registry:
        runtime = registry.ensure(first)
        registry.apply_trusted_gap(runtime, {"generation": 2, "started_ms": NOW_MS - 10,
            "ended_ms": NOW_MS, "reason": "platform_unavailable"})
        assert runtime.health_snapshot().service_gap_count == 1


def test_terminal_descriptor_rejection_cannot_reexhaust_reclaimed_slots(tmp_path):
    first, backend = descriptor(), FinalizeBackend()
    with RunRegistry(tmp_path, lambda _: backend, max_runs=1) as registry:
        registry.ensure(first)
        assert registry.finalize(first.bootstrap.run_id, 1).archived
        with pytest.raises(ValueError):
            registry.ensure(first)
        registry.ensure(replace(first, bootstrap=replace(first.bootstrap, run_id=uuid4())))


def test_new_schedule_clears_obsolete_archive_error_from_health(tmp_path):
    from integrity_service.resident.maintenance import Maintenance
    from integrity_service.resident.settings import ResidentSettings
    first, backend = descriptor(), FinalizeBackend()
    with RunRegistry(tmp_path, lambda _: backend) as registry:
        registry.ensure(first)
        maintenance = Maintenance(registry, ResidentSettings(tmp_path, "", tmp_path / "x", tmp_path / "y"))
        try:
            registry.finalize_requests[first.bootstrap.run_id] = 1
            backend.revision = 2
            maintenance._job(first.bootstrap.run_id, "archive")
            assert (first.bootstrap.run_id, "archive") in maintenance.errors
            registry.ensure(replace(first, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000))
            maintenance.tick()
            assert (first.bootstrap.run_id, "archive") not in maintenance.errors
        finally:
            maintenance.close()
