"""Immutable, deterministic commands produced by the integrity core."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Literal
from uuid import UUID, uuid5

from integrity_service.core.schemas import EventRecord


CommandKind = Literal[
    "record_event",
    "auto_submit",
    "update_run_checkpoint",
    "create_archive_upload",
    "publish_archive_manifest",
]
CommandAction = Literal["audit", "record", "pause", "lock", "submit"]


class FrozenDict(dict[str, object]):
    """A JSON-serializable dictionary that rejects mutation."""

    def _immutable(self, *args: object, **kwargs: object) -> None:
        raise TypeError("command data is immutable")

    __delitem__ = _immutable
    __ior__ = _immutable
    __setitem__ = _immutable
    clear = _immutable
    pop = _immutable
    popitem = _immutable
    setdefault = _immutable
    update = _immutable


def _freeze_json(value: object) -> object:
    if isinstance(value, dict):
        return FrozenDict({key: _freeze_json(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze_json(item) for item in value)
    return value


@dataclass(frozen=True, slots=True)
class EngineContext:
    """Run-scoped identity required by every deterministic core engine."""

    run_id: UUID


@dataclass(frozen=True, slots=True)
class ReceivedEvent:
    """A sequenced browser event paired with authoritative receipt context."""

    participant_id: int
    device_id: str
    record: EventRecord
    received_at_server_ms: int
    delayed_delivery: bool = False

    def __post_init__(self) -> None:
        if self.participant_id < 1:
            raise ValueError("participant_id must be positive")
        if not self.device_id:
            raise ValueError("device_id must not be empty")
        if self.received_at_server_ms < 0:
            raise ValueError("received_at_server_ms must not be negative")


@dataclass(frozen=True, slots=True)
class IntegrityCommand:
    command_id: UUID
    run_id: UUID
    kind: CommandKind
    participant_id: int
    device_id: str
    incident_id: UUID | None
    event_type: str
    action: CommandAction
    client_occurred_at_ms: int
    received_at_server_ms: int
    delayed_delivery: bool
    evidence: dict[str, object]
    metadata: dict[str, object]

    def __post_init__(self) -> None:
        object.__setattr__(self, "evidence", _freeze_json(self.evidence))
        object.__setattr__(self, "metadata", _freeze_json(self.metadata))


def deterministic_uuid(run_id: UUID, *parts: object) -> UUID:
    """Derive an unambiguous UUIDv5 from JSON-stable identity parts."""

    name = json.dumps(parts, ensure_ascii=False, separators=(",", ":"), default=str)
    return uuid5(run_id, name)


def make_command(
    *,
    context: EngineContext,
    kind: CommandKind,
    participant_id: int,
    device_id: str,
    incident_id: UUID | None,
    event_id: UUID,
    phase: str,
    event_type: str,
    action: CommandAction,
    client_occurred_at_ms: int,
    received_at_server_ms: int,
    delayed_delivery: bool = False,
    evidence: dict[str, object] | None = None,
    metadata: dict[str, object] | None = None,
) -> IntegrityCommand:
    return IntegrityCommand(
        command_id=deterministic_uuid(
            context.run_id,
            participant_id,
            device_id,
            event_id,
            phase,
        ),
        run_id=context.run_id,
        kind=kind,
        participant_id=participant_id,
        device_id=device_id,
        incident_id=incident_id,
        event_type=event_type,
        action=action,
        client_occurred_at_ms=client_occurred_at_ms,
        received_at_server_ms=received_at_server_ms,
        delayed_delivery=delayed_delivery,
        evidence={} if evidence is None else evidence,
        metadata={} if metadata is None else metadata,
    )
