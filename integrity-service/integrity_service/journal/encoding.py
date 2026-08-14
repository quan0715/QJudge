"""Canonical byte encoding for integrity journal records."""

import hashlib
import json
from uuid import UUID

from integrity_service.core.schemas import EventBatch


def encode_record(batch: EventBatch) -> bytes:
    """Encode one validated batch in the journal's canonical wire format."""
    payload = json.dumps(
        batch.model_dump(mode="python", by_alias=True, exclude_none=True),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
        default=_encode_json_scalar,
    ).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest().encode("ascii")
    return f"{len(payload):08x} ".encode("ascii") + digest + b" " + payload + b"\n"


def _encode_json_scalar(value: object) -> str:
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"unsupported canonical JSON value: {type(value).__name__}")
