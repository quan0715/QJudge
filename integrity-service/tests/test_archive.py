from __future__ import annotations

import hashlib
import json
import shutil
from uuid import UUID, uuid4

import pytest

from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.journal.archive import (
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


class FakeCommandBackend:
    def __init__(self) -> None:
        self.fail_delivery = False
        self.sent: list[tuple[dict[str, object], ...]] = []

    def send_commands(self, commands):
        self.sent.append(commands)
        if self.fail_delivery:
            self.fail_delivery = False
            raise BackendUnavailable("retry")
        return {
            "accepted_command_ids": [command["command_id"] for command in commands],
        }

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
    backend = FakeCommandBackend()
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
        lambda ids: {"accepted_command_ids": ids, "archive_uploads": []},
        lambda ids: {"accepted_command_ids": ids, "archive_uploads": [{"upload_url": "https://old.invalid"}]},
        lambda ids: {"accepted_command_ids": None},
        lambda ids: {"accepted_command_ids": [1, *ids[1:]]},
        lambda ids: {"accepted_command_ids": []},
        lambda ids: {"accepted_command_ids": ids[:1]},
        lambda ids: {"accepted_command_ids": [ids[0], ids[0]]},
        lambda ids: {"accepted_command_ids": [*ids, str(uuid4())]},
        lambda ids: {
            "accepted_command_ids": ids,
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
            }

    outbox = CommandOutbox(tmp_path / "outbox")
    outbox.append(commands)
    result = outbox.deliver_pending(Backend())

    assert outbox.pending_commands == ()
    checkpoint = outbox._log.records[-1]
    assert checkpoint["command_ids"] == [item["command_id"] for item in commands]
    assert result == {"accepted_command_ids": checkpoint["command_ids"]}
    assert checkpoint["response"] == result
    outbox.close()
    recovered = CommandOutbox(tmp_path / "outbox")
    try:
        assert recovered.pending_commands == ()
        assert recovered.deliver_pending(Backend()) == {}
    finally:
        recovered.close()


@pytest.mark.parametrize("response_factory", [
    lambda ids: {"accepted_command_ids": ids, "archive_uploads": []},
    lambda ids: {"accepted_command_ids": []},
    lambda ids: {"accepted_command_ids": [ids[0], ids[0]]},
    lambda ids: {"accepted_command_ids": [str(uuid4())]},
])
def test_command_outbox_rejects_invalid_durable_ack_without_rewriting_history(tmp_path, response_factory):
    command = {"command_id": str(uuid4()), "kind": "update_run_checkpoint", "metadata": {}}
    outbox = CommandOutbox(tmp_path / "outbox")
    outbox.append((command,))
    outbox._log.append({"kind": "delivered", "command_ids": [command["command_id"]],
        "response": response_factory([command["command_id"]])})
    path = outbox._log.path
    outbox.close()
    original = path.read_bytes()
    with pytest.raises(DurableLogCorruption, match="response"):
        CommandOutbox(tmp_path / "outbox")
    assert path.read_bytes() == original


def test_command_outbox_delivers_large_queue_in_backend_sized_chunks(tmp_path):
    commands = tuple(
        {
            "command_id": str(uuid4()),
            "kind": "update_run_checkpoint",
            "metadata": {"position": position},
        }
        for position in range(149)
    )

    class Backend:
        def __init__(self):
            self.calls = []

        def send_commands(self, pending):
            assert len(pending) <= 100
            self.calls.append(pending)
            return {
                "accepted_command_ids": [
                    item["command_id"] for item in pending
                ],
            }

    backend = Backend()
    outbox = CommandOutbox(tmp_path / "outbox")
    outbox.append(commands)

    outbox.deliver_pending(backend)

    assert [len(call) for call in backend.calls] == [100, 49]
    assert outbox.pending_commands == ()
    assert [
        len(record["command_ids"])
        for record in outbox._log.records
        if record["kind"] == "delivered"
    ] == [100, 49]



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


def _sealed_journal(tmp_path):
    journal = SegmentedJournal(tmp_path / "journal", started_at_ms=0, max_segment_bytes=1)
    journal.append_batch_once(batch(1))
    assert journal.rotate_if_due(1)
    return journal


def test_missing_segment_conflicts_with_immutable_catalog(tmp_path):
    journal = _sealed_journal(tmp_path)
    journal.sealed_segments[0].path.unlink()

    with pytest.raises(ArchiveUploadFailed):
        _ = journal.sealed_segments


def test_sealed_segment_index_gap_conflicts_with_immutable_catalog(tmp_path):
    journal = _sealed_journal(tmp_path)
    journal.append_batch_once(batch(2))
    assert journal.rotate_if_due(2) is True
    second = tmp_path / "journal" / "segment-00000002.journal"
    second.replace(tmp_path / "journal" / "segment-00000003.journal")

    with pytest.raises(ArchiveUploadFailed):
        _ = journal.sealed_segments


def test_extra_sealed_file_conflicts_with_immutable_catalog(tmp_path):
    journal = _sealed_journal(tmp_path)
    first = journal.sealed_segments[0].path
    shutil.copyfile(first, tmp_path / "journal" / "segment-00000002.journal")

    with pytest.raises(ArchiveUploadFailed):
        _ = journal.sealed_segments





def test_segment_catalog_is_persisted_at_seal_time_and_contiguous(tmp_path):
    journal = _sealed_journal(tmp_path)
    catalog = journal.root / "segments.catalog"

    assert catalog.exists()
    assert journal.segment_catalog == (
        {
            **journal.segment_catalog[0],
            "index": 1,
            "previous_raw_sha256": None,
        },
    )





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
