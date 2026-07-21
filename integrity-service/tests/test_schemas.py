import hashlib
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from integrity_service.core.schemas import BatchAck, EventBatch, EventRecord
from integrity_service.journal.writer import encode_record


def record(seq: int) -> EventRecord:
    return EventRecord(
        event_id=uuid4(),
        seq=seq,
        kind="event",
        event_type="tab_hidden",
        event_schema_version=1,
        client_occurred_at_ms=1,
        client_recorded_at_ms=2,
        monotonic_ms=3.0,
    )


def batch(first_seq: int, last_seq: int) -> EventBatch:
    return EventBatch(
        schema_version=1,
        batch_id=uuid4(),
        run_id=uuid4(),
        participant_id=101,
        device_id="device-a",
        registry_version="2026-07-21.1",
        first_seq=first_seq,
        last_seq=last_seq,
        records=[record(seq) for seq in range(first_seq, last_seq + 1)],
        client_build="frontend-test",
    )


def test_batch_rejects_non_contiguous_records():
    with pytest.raises(ValidationError, match="records must exactly cover first_seq..last_seq"):
        EventBatch(
            schema_version=1,
            batch_id=uuid4(),
            run_id=uuid4(),
            participant_id=101,
            device_id="device-a",
            registry_version="2026-07-21.1",
            first_seq=3,
            last_seq=5,
            records=[record(seq=3), record(seq=5)],
            client_build="frontend-test",
        )


def test_record_and_ack_validate_required_bounds():
    with pytest.raises(ValidationError):
        record(0)
    with pytest.raises(ValidationError):
        BatchAck(acked_through_seq=-1, release_evidence_before_ms=0)


def test_journal_encoding_is_canonical_length_prefixed_and_hash_checked():
    encoded = encode_record(batch(1, 1))
    header, digest, payload_with_newline = encoded.split(b" ", 2)
    payload = payload_with_newline[:-1]

    assert len(header) == 8
    assert int(header, 16) == len(payload)
    assert len(digest) == 64
    assert digest == hashlib.sha256(payload).hexdigest().encode("ascii")
    assert payload_with_newline.endswith(b"\n")
    assert payload == json.dumps(
        json.loads(payload), ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
