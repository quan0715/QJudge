from __future__ import annotations

import gzip
import hashlib
import json
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
                    }
                )
        return {
            "accepted_command_ids": [command["command_id"] for command in commands],
            "archive_uploads": uploads,
        }

    def upload_presigned(self, url: str, content: bytes, sha256: str) -> None:
        if self.fail_upload:
            self.fail_upload = False
            raise BackendUnavailable("object storage unavailable")
        assert hashlib.sha256(content).hexdigest() == sha256
        self.objects[url.removeprefix("memory://")] = content


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
        generation=4,
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
    assert manifest.payload["generation"] == 4
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
