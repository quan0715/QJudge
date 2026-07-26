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
        event_type="mouse_leave_triggered",
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
        registry_version="2026-07-21.2",
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
            registry_version="2026-07-21.2",
            first_seq=3,
            last_seq=5,
            records=[record(seq=3), record(seq=5)],
            client_build="frontend-test",
        )


def test_batch_rejects_extreme_sequence_span_without_materializing_range():
    with pytest.raises(ValidationError, match="records must exactly cover first_seq..last_seq"):
        EventBatch(
            schema_version=1,
            batch_id=uuid4(),
            run_id=uuid4(),
            participant_id=101,
            device_id="device-a",
            registry_version="2026-07-21.2",
            first_seq=1,
            last_seq=2**1000,
            records=[record(1)],
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


@pytest.mark.parametrize(
    ("model", "field", "invalid"),
    [
        (EventRecord, "seq", "1"),
        (EventRecord, "seq", True),
        (EventRecord, "event_type", True),
        (EventBatch, "schema_version", True),
        (EventBatch, "schema_version", 1.0),
        (EventBatch, "schema_version", "1"),
        (EventBatch, "participant_id", "101"),
        (EventBatch, "participant_id", True),
        (EventBatch, "device_id", True),
        (BatchAck, "acked_through_seq", "0"),
        (BatchAck, "release_evidence_before_ms", False),
    ],
)
def test_wire_contract_rejects_scalar_coercion(model, field, invalid):
    examples = {
        EventRecord: record(1).model_dump(mode="json"),
        EventBatch: batch(1, 1).model_dump(mode="json"),
        BatchAck: {
            "acked_through_seq": 0,
            "pending_commands": [],
            "release_evidence_before_ms": 0,
        },
    }
    wire = examples[model]
    wire[field] = invalid

    with pytest.raises(ValidationError):
        model.model_validate(wire)


@pytest.mark.parametrize("model", [EventRecord, EventBatch, BatchAck])
def test_wire_contract_rejects_unknown_top_level_fields(model):
    examples = {
        EventRecord: record(1).model_dump(mode="json"),
        EventBatch: batch(1, 1).model_dump(mode="json"),
        BatchAck: {
            "acked_through_seq": 0,
            "pending_commands": [],
            "release_evidence_before_ms": 0,
        },
    }
    wire = examples[model]
    wire["unsupported"] = "must-not-be-ignored"

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        model.model_validate(wire)


def test_ack_rejects_unknown_command_fields():
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BatchAck.model_validate(
            {
                "acked_through_seq": 0,
                "pending_commands": [
                    {
                        "command_id": str(uuid4()),
                        "incident_id": str(uuid4()),
                        "event_id": "event-1",
                        "sources": ["webcam"],
                        "start_at_ms": 0,
                        "end_at_ms": 1,
                        "unsupported": True,
                    }
                ],
                "release_evidence_before_ms": 0,
            }
        )


def test_wire_contract_round_trips_json_string_uuids():
    wire = batch(1, 1).model_dump(mode="json")
    parsed = EventBatch.model_validate(wire)

    assert str(parsed.batch_id) == wire["batch_id"]
    assert str(parsed.records[0].event_id) == wire["records"][0]["event_id"]


@pytest.mark.parametrize(
    ("field", "invalid"),
    [
        ("payload", {"nested": [float("nan")]}),
        ("payload", {"nested": {"value": float("inf")}}),
        ("evidence_descriptors", [{"confidence": float("-inf")}]),
    ],
)
def test_record_rejects_recursive_non_finite_json_values(field, invalid):
    wire = record(1).model_dump(mode="json")
    wire[field] = invalid

    with pytest.raises(ValidationError, match="finite"):
        EventRecord.model_validate(wire)


def test_encoder_rejects_non_finite_values_even_if_validation_was_bypassed():
    original = batch(1, 1)
    invalid_record = original.records[0].model_copy(update={"payload": {"value": float("nan")}})
    invalid_batch = original.model_copy(update={"records": [invalid_record]})

    with pytest.raises(ValueError, match="Out of range float values"):
        encode_record(invalid_batch)
