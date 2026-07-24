from __future__ import annotations

import gzip
import hashlib
import json
import shutil
from uuid import UUID, uuid4

import pytest

from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.journal.archive import (
    ArchiveManager,
    ArchiveUploadFailed,
    SegmentedJournal,
)
from integrity_service.journal.command_outbox import (
    CommandConflict,
    CommandOutbox,
    DurableJsonLog,
    DurableLogCorruption,
)
from integrity_service.worker.backend_client import BackendUnavailable


RUN_ID = UUID("00000000-0000-0000-0000-000000000902")


class FakeArchiveBackend:
    def __init__(self) -> None:
        self.fail_delivery = False
        self.fail_upload = False
        self.sent: list[tuple[dict[str, object], ...]] = []
        self.objects: dict[str, bytes] = {}
        self.declare_checksum_enforcement = True

    def send_commands(self, commands):
        self.sent.append(commands)
        if self.fail_delivery:
            self.fail_delivery = False
            raise BackendUnavailable("retry")
        uploads = []
        for command in commands:
            if command["kind"] == "create_archive_upload":
                key = command["metadata"]["object_key"]
                uploads.append(
                    {
                        "command_id": command["command_id"],
                        "object_key": key,
                        "upload_url": f"memory://{key}",
                        "checksum_sha256": command["metadata"]["sha256"],
                        "checksum_enforced": self.declare_checksum_enforcement,
                    }
                )
        return {
            "accepted_command_ids": [command["command_id"] for command in commands],
            "archive_uploads": uploads,
        }

    def upload_presigned(
        self,
        url: str,
        content: bytes,
        sha256: str,
        content_type: str,
    ) -> None:
        if self.fail_upload:
            self.fail_upload = False
            raise BackendUnavailable("object storage unavailable")
        assert hashlib.sha256(content).hexdigest() == sha256
        self.objects[url.removeprefix("memory://")] = content


def test_backend_client_uploads_r2_base64_sha256_header():
    import base64

    import httpx

    from integrity_service.worker.backend_client import BackendClient

    requests = []

    def upload_handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200)

    client = BackendClient(
        base_url="https://backend.example",
        run_id=RUN_ID,
        token="run-token",
        upload_transport=httpx.MockTransport(upload_handler),
    )
    digest = "ab" * 32

    client.upload_presigned(
        "https://r2.example/archive",
        b"archive",
        digest,
        "application/gzip",
    )

    assert len(requests) == 1
    assert requests[0].headers["Content-Type"] == "application/gzip"
    assert requests[0].headers["x-amz-checksum-sha256"] == base64.b64encode(
        bytes.fromhex(digest)
    ).decode("ascii")
    assert "Content-SHA256" not in requests[0].headers


def batch(seq: int) -> EventBatch:
    return EventBatch(
        schema_version=1,
        batch_id=uuid4(),
        run_id=RUN_ID,
        participant_id=101,
        device_id="device-a",
        registry_version="registry-v2",
        first_seq=seq,
        last_seq=seq,
        records=[
            EventRecord(
                event_id=uuid4(),
                seq=seq,
                kind="event",
                event_type="exit_fullscreen_triggered",
                event_schema_version=1,
                client_occurred_at_ms=seq,
                client_recorded_at_ms=seq,
                monotonic_ms=float(seq),
                payload={"reason": "archive"},
            )
        ],
        client_build="archive-test",
    )


def test_command_outbox_fsyncs_recovers_retries_and_rejects_identity_conflict(tmp_path):
    backend = FakeArchiveBackend()
    command = {
        "command_id": str(uuid4()),
        "kind": "update_run_checkpoint",
        "metadata": {"value": 1},
    }
    outbox = CommandOutbox(tmp_path / "outbox")
    assert outbox.append((command,)) is True
    backend.fail_delivery = True

    with pytest.raises(BackendUnavailable):
        outbox.deliver_pending(backend)
    assert outbox.pending_commands == (command,)

    recovered = CommandOutbox(tmp_path / "outbox")
    recovered.deliver_pending(backend)
    assert backend.sent[0] == backend.sent[1]
    assert recovered.pending_commands == ()

    conflicting = {**command, "metadata": {"value": 2}}
    with pytest.raises(CommandConflict):
        recovered.append((conflicting,))


def test_command_outbox_preflights_entire_append_before_mutating_memory(tmp_path):
    outbox = CommandOutbox(tmp_path / "outbox")
    existing = {
        "command_id": str(uuid4()),
        "kind": "update_run_checkpoint",
        "metadata": {"value": 1},
    }
    outbox.append((existing,))
    new_command = {
        "command_id": str(uuid4()),
        "kind": "update_run_checkpoint",
        "metadata": {"value": 2},
    }
    conflict = {**existing, "metadata": {"value": 3}}

    with pytest.raises(CommandConflict):
        outbox.append((new_command, conflict))

    assert new_command not in outbox.pending_commands


@pytest.mark.parametrize(
    "response_factory",
    [
        lambda ids: {},
        lambda ids: {"accepted_command_ids": [], "archive_uploads": []},
        lambda ids: {"accepted_command_ids": ids[:1], "archive_uploads": []},
        lambda ids: {"accepted_command_ids": [ids[0], ids[0]], "archive_uploads": []},
        lambda ids: {"accepted_command_ids": [*ids, str(uuid4())], "archive_uploads": []},
        lambda ids: {
            "accepted_command_ids": ids,
            "archive_uploads": [],
            "rejected_command_ids": [ids[-1]],
        },
    ],
)
def test_command_outbox_rejects_unproven_partial_duplicate_unknown_or_mixed_2xx(
    tmp_path, response_factory
):
    commands = (
        {
            "command_id": str(uuid4()),
            "kind": "update_run_checkpoint",
            "metadata": {"position": 1},
        },
        {
            "command_id": str(uuid4()),
            "kind": "update_run_checkpoint",
            "metadata": {"position": 2},
        },
    )
    ids = [command["command_id"] for command in commands]

    class Backend:
        def __init__(self):
            self.calls = []

        def send_commands(self, pending):
            self.calls.append(pending)
            return response_factory(ids)

    backend = Backend()
    outbox = CommandOutbox(tmp_path / "outbox")
    outbox.append(commands)

    with pytest.raises((TypeError, ValueError), match="command response"):
        outbox.deliver_pending(backend)

    assert outbox.pending_commands == commands
    with pytest.raises((TypeError, ValueError), match="command response"):
        outbox.deliver_pending(backend)
    assert backend.calls == [commands, commands]
    assert [record["kind"] for record in outbox._log.records] == ["commands"]


def test_command_outbox_checkpoints_only_an_exact_all_command_receipt(tmp_path):
    commands = (
        {
            "command_id": str(uuid4()),
            "kind": "update_run_checkpoint",
            "metadata": {},
        },
        {
            "command_id": str(uuid4()),
            "kind": "update_run_checkpoint",
            "metadata": {},
        },
    )

    class Backend:
        def send_commands(self, pending):
            return {
                "accepted_command_ids": [item["command_id"] for item in pending],
                "archive_uploads": [],
            }

    outbox = CommandOutbox(tmp_path / "outbox")
    outbox.append(commands)
    outbox.deliver_pending(Backend())

    assert outbox.pending_commands == ()
    checkpoint = outbox._log.records[-1]
    assert checkpoint["command_ids"] == [item["command_id"] for item in commands]


def test_archive_retry_preserves_segment_and_hash_chain_manifest(tmp_path):
    backend = FakeArchiveBackend()
    outbox = CommandOutbox(tmp_path / "outbox")
    journal = SegmentedJournal(
        tmp_path / "journal",
        started_at_ms=0,
        rotate_after_ms=60_000,
        max_segment_bytes=1,
    )
    manager = ArchiveManager(
        root=tmp_path / "archive",
        run_id=RUN_ID,
        generation=1,
        journal=journal,
        outbox=outbox,
        backend=backend,
        snapshot_digests={"policy": "p" * 64, "registry": "r" * 64},
        frozen_snapshots={
            "policy": {"suspect_after_ms": 15_000},
            "registry": {"version": "registry-v2"},
        },
    )
    journal.append_batch_once(batch(1))
    assert journal.rotate_if_due(1) is True
    journal.append_batch_once(batch(2))
    assert journal.rotate_if_due(2) is True
    sealed = journal.sealed_segments
    backend.fail_upload = True

    with pytest.raises(ArchiveUploadFailed):
        manager.upload_all_sealed()
    assert sealed[0].path.exists()
    assert manager.healthy is True

    manager.upload_all_sealed()
    manifest = manager.build_manifest(final_cursors={"101/device-a": 2})
    result = manager.upload_and_publish_manifest(manifest)

    assert result.archived is True
    assert len(result.manifest_sha256) == 64
    assert manifest.payload["generation"] == 1
    assert manifest.payload["frozen_snapshots"] == {
        "policy": {"suspect_after_ms": 15_000},
        "registry": {"version": "registry-v2"},
    }
    assert manifest.payload["final_device_cursors"] == {"101/device-a": 2}
    entries = manifest.payload["segments"]
    assert entries[0]["previous_sha256"] is None
    assert entries[1]["previous_sha256"] == entries[0]["sha256"]
    for entry in entries:
        content = backend.objects[entry["object_key"]]
        assert hashlib.sha256(content).hexdigest() == entry["sha256"]
        assert gzip.decompress(content).endswith(b"\n")
    manifest_bytes = backend.objects[result.manifest_key]
    assert json.loads(manifest_bytes) == manifest.payload


@pytest.mark.parametrize("defect", ["partial", "digest", "schema", "framing"])
def test_sealed_segment_validation_is_strict_read_only_and_preserves_every_defect(
    tmp_path, defect
):
    journal = SegmentedJournal(
        tmp_path / "journal",
        started_at_ms=0,
        max_segment_bytes=1,
    )
    journal.append_batch_once(batch(1))
    assert journal.rotate_if_due(1) is True
    sealed_path = tmp_path / "journal" / "segment-00000001.journal"
    original = sealed_path.read_bytes()
    corrupted = bytearray(original)
    if defect == "partial":
        corrupted.extend(b"00000100 deadbeef")
    elif defect == "digest":
        corrupted[9] = ord("0") if corrupted[9] != ord("0") else ord("1")
    elif defect == "schema":
        payload = b'{"schema_version":1}'
        digest = hashlib.sha256(payload).hexdigest().encode("ascii")
        corrupted = bytearray(
            f"{len(payload):08x} ".encode("ascii") + digest + b" " + payload + b"\n"
        )
    else:
        corrupted[8] = ord(":")
    sealed_path.write_bytes(corrupted)
    preserved = bytes(corrupted)

    with pytest.raises((ValueError, ArchiveUploadFailed)):
        _ = journal.sealed_segments

    assert sealed_path.read_bytes() == preserved


def _manager_with_one_uploaded_segment(tmp_path):
    backend = FakeArchiveBackend()
    outbox = CommandOutbox(tmp_path / "outbox")
    journal = SegmentedJournal(
        tmp_path / "journal",
        started_at_ms=0,
        max_segment_bytes=1,
    )
    manager = ArchiveManager(
        root=tmp_path / "archive",
        run_id=RUN_ID,
        generation=1,
        journal=journal,
        outbox=outbox,
        backend=backend,
        snapshot_digests={"policy": "p" * 64, "registry": "r" * 64},
        frozen_snapshots={"policy": {}, "registry": {}},
    )
    journal.append_batch_once(batch(1))
    assert journal.rotate_if_due(1) is True
    manager.upload_all_sealed()
    return manager, journal, backend


def test_uploaded_missing_segment_cannot_publish_a_shortened_manifest(tmp_path):
    manager, journal, _ = _manager_with_one_uploaded_segment(tmp_path)
    journal.sealed_segments[0].path.unlink()

    with pytest.raises(ArchiveUploadFailed):
        manager.build_manifest(final_cursors={})


def test_sealed_segment_index_gap_conflicts_with_immutable_catalog(tmp_path):
    manager, journal, _ = _manager_with_one_uploaded_segment(tmp_path)
    journal.append_batch_once(batch(2))
    assert journal.rotate_if_due(2) is True
    second = tmp_path / "journal" / "segment-00000002.journal"
    second.replace(tmp_path / "journal" / "segment-00000003.journal")

    with pytest.raises(ArchiveUploadFailed):
        manager.upload_all_sealed()


def test_extra_sealed_file_conflicts_with_immutable_catalog(tmp_path):
    manager, journal, _ = _manager_with_one_uploaded_segment(tmp_path)
    first = journal.sealed_segments[0].path
    shutil.copyfile(first, tmp_path / "journal" / "segment-00000002.journal")

    with pytest.raises(ArchiveUploadFailed):
        manager.build_manifest(final_cursors={})


def test_duplicate_conflicting_upload_checkpoint_fails_manifest_closed(tmp_path):
    manager, _, _ = _manager_with_one_uploaded_segment(tmp_path)
    checkpoint = dict(manager._state.records[-1])
    checkpoint["sha256"] = "f" * 64
    manager._state.append(checkpoint)

    with pytest.raises(ArchiveUploadFailed):
        manager.build_manifest(final_cursors={})


def test_reordered_upload_checkpoints_fail_manifest_closed(tmp_path):
    backend = FakeArchiveBackend()
    outbox = CommandOutbox(tmp_path / "outbox")
    journal = SegmentedJournal(
        tmp_path / "journal",
        started_at_ms=0,
        max_segment_bytes=1,
    )
    manager = ArchiveManager(
        root=tmp_path / "archive",
        run_id=RUN_ID,
        generation=1,
        journal=journal,
        outbox=outbox,
        backend=backend,
        snapshot_digests={"policy": "p" * 64, "registry": "r" * 64},
    )
    journal.append_batch_once(batch(1))
    assert journal.rotate_if_due(1) is True
    journal.append_batch_once(batch(2))
    assert journal.rotate_if_due(2) is True
    first, second = journal.sealed_segments
    first_content = manager._gzip_segment(first)
    second_content = manager._gzip_segment(second)
    first_digest = hashlib.sha256(first_content).hexdigest()
    second_digest = hashlib.sha256(second_content).hexdigest()
    first_checkpoint = manager._segment_checkpoint(
        segment=first,
        digest=first_digest,
        compressed_bytes=len(first_content),
        previous_sha256=None,
    )
    second_checkpoint = manager._segment_checkpoint(
        segment=second,
        digest=second_digest,
        compressed_bytes=len(second_content),
        previous_sha256=first_digest,
    )
    manager._state.append(second_checkpoint)
    manager._state.append(first_checkpoint)

    with pytest.raises(ArchiveUploadFailed, match="checkpoint"):
        manager.build_manifest(final_cursors={})


def test_new_generation_uses_isolated_checkpoints_and_chains_prior_manifest(tmp_path):
    backend = FakeArchiveBackend()
    outbox = CommandOutbox(tmp_path / "outbox")
    journal = SegmentedJournal(
        tmp_path / "journal",
        started_at_ms=0,
        max_segment_bytes=1,
    )
    journal.append_batch_once(batch(1))
    assert journal.rotate_if_due(1) is True
    first_manager = ArchiveManager(
        root=tmp_path / "archive",
        run_id=RUN_ID,
        generation=1,
        journal=journal,
        outbox=outbox,
        backend=backend,
        snapshot_digests={"policy": "p" * 64, "registry": "r" * 64},
    )
    first_manager.upload_all_sealed()
    first_manifest = first_manager.build_manifest(final_cursors={})
    first_manager.upload_and_publish_manifest(first_manifest)
    first_manager.close()

    previous_manifest = {
        "generation": 1,
        "object_key": first_manifest.object_key,
        "sha256": first_manifest.sha256,
    }
    second_manager = ArchiveManager(
        root=tmp_path / "archive",
        run_id=RUN_ID,
        generation=2,
        journal=journal,
        outbox=outbox,
        backend=backend,
        snapshot_digests={"policy": "p" * 64, "registry": "r" * 64},
        previous_manifest=previous_manifest,
    )

    second_manager.upload_all_sealed()
    second_manifest = second_manager.build_manifest(final_cursors={})

    assert second_manifest.payload["previous_manifest"] == previous_manifest
    assert second_manifest.payload["previous_manifest_sha256"] == first_manifest.sha256
    assert second_manifest.payload["segments"][0]["object_key"].startswith(
        f"runs/{RUN_ID}/generation-2/"
    )


def test_segment_catalog_is_persisted_at_seal_time_and_contiguous(tmp_path):
    _, journal, _ = _manager_with_one_uploaded_segment(tmp_path)
    catalog = journal.root / "segments.catalog"

    assert catalog.exists()
    assert journal.segment_catalog == (
        {
            **journal.segment_catalog[0],
            "index": 1,
            "previous_raw_sha256": None,
        },
    )


def test_archive_upload_requires_declared_checksum_enforcement(tmp_path):
    backend = FakeArchiveBackend()
    backend.declare_checksum_enforcement = False
    outbox = CommandOutbox(tmp_path / "outbox")
    journal = SegmentedJournal(
        tmp_path / "journal",
        started_at_ms=0,
        max_segment_bytes=1,
    )
    manager = ArchiveManager(
        root=tmp_path / "archive",
        run_id=RUN_ID,
        generation=1,
        journal=journal,
        outbox=outbox,
        backend=backend,
        snapshot_digests={"policy": "p" * 64, "registry": "r" * 64},
    )
    journal.append_batch_once(batch(1))
    journal.rotate_if_due(1)

    with pytest.raises(ArchiveUploadFailed, match="checksum"):
        manager.upload_all_sealed()

    assert backend.objects == {}
    assert journal.sealed_segments[0].path.exists()


def test_archive_manifest_payload_is_a_fresh_projection_of_canonical_content(tmp_path):
    manager, _, _ = _manager_with_one_uploaded_segment(tmp_path)
    manifest = manager.build_manifest(final_cursors={})
    first = manifest.payload
    first["generation"] = 999
    first["segments"].clear()

    assert manifest.payload["generation"] == 1
    assert len(manifest.payload["segments"]) == 1
    assert hashlib.sha256(manifest.content).hexdigest() == manifest.sha256
    assert json.loads(manifest.content) == manifest.payload


def test_archive_manager_snapshot_accessors_cannot_mutate_evidence(tmp_path):
    manager, _, _ = _manager_with_one_uploaded_segment(tmp_path)
    snapshots = manager.frozen_snapshots
    digests = manager.snapshot_digests
    snapshots["policy"]["changed"] = True
    digests["policy"] = "x" * 64

    manifest = manager.build_manifest(final_cursors={})

    assert manifest.payload["frozen_snapshots"] == {"policy": {}, "registry": {}}
    assert manifest.payload["snapshot_digests"] == {
        "policy": "p" * 64,
        "registry": "r" * 64,
    }


def test_time_rotation_and_capacity_warning_do_not_mark_unhealthy(tmp_path):
    journal = SegmentedJournal(
        tmp_path / "journal",
        started_at_ms=0,
        rotate_after_ms=60_000,
        max_segment_bytes=8 * 1024 * 1024,
        capacity_warning_bytes=1,
    )
    journal.append_batch_once(batch(1))

    assert journal.rotate_if_due(59_999) is False
    assert journal.rotate_if_due(60_000) is True
    assert "journal_capacity_low" in journal.warning_codes
    assert journal.healthy is True


def test_durable_json_log_truncates_only_canonical_partial_tail(tmp_path):
    path = tmp_path / "durable.log"
    log = DurableJsonLog(path)
    log.append({"kind": "valid"})
    log.close()
    valid = path.read_bytes()
    with path.open("ab") as stream:
        stream.write(b"00000020 0123")

    recovered = DurableJsonLog(path)

    assert recovered.records == ({"kind": "valid"},)
    assert path.read_bytes() == valid


@pytest.mark.parametrize("tail", [b"G", b"00000000 G"])
def test_durable_json_log_preserves_invalid_short_tail(tmp_path, tail):
    path = tmp_path / "durable.log"
    path.write_bytes(tail)

    with pytest.raises(DurableLogCorruption):
        DurableJsonLog(path)

    assert path.read_bytes() == tail


def test_durable_json_log_preserves_complete_checksum_corruption(tmp_path):
    path = tmp_path / "durable.log"
    log = DurableJsonLog(path)
    log.append({"kind": "valid"})
    log.close()
    corrupted = bytearray(path.read_bytes())
    corrupted[9] = ord("0") if corrupted[9] != ord("0") else ord("1")
    path.write_bytes(corrupted)

    with pytest.raises(DurableLogCorruption, match="digest mismatch"):
        DurableJsonLog(path)

    assert path.read_bytes() == corrupted
