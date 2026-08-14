"""Immutable, deterministic commands produced by the integrity core."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass
import json
import math
from types import MappingProxyType
from typing import TYPE_CHECKING, Literal
from uuid import UUID, uuid5

if TYPE_CHECKING:
    from integrity_service.core.records import AdmittedEventRecord


CommandKind = Literal[
    "record_event",
    "auto_submit",
    "update_run_checkpoint",
    "create_archive_upload",
    "publish_archive_manifest",
]
CommandAction = Literal["audit", "record", "pause", "lock", "submit"]


class FrozenDict(Mapping[str, object]):
    """Transitively immutable mapping used for JSON object values."""

    __slots__ = ("__data",)

    def __init__(self, values: Mapping[object, object], *, _path: str = "$"):
        frozen: dict[str, object] = {}
        for key, item in values.items():
            if type(key) is not str:
                raise TypeError(f"{_path} must contain only string JSON object keys")
            frozen[key] = freeze_json(item, f"{_path}.{key}")
        object.__setattr__(self, "_FrozenDict__data", MappingProxyType(frozen))

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError("FrozenDict is immutable")

    def __delattr__(self, name: str) -> None:
        raise AttributeError("FrozenDict is immutable")

    def __getitem__(self, key: str) -> object:
        return self.__data[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self.__data)

    def __len__(self) -> int:
        return len(self.__data)

    def __repr__(self) -> str:
        return repr(dict(self.__data))

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Mapping) and dict(self.items()) == dict(other.items())


def freeze_json(value: object, path: str = "$") -> object:
    """Normalize only JSON-compatible values into immutable containers."""

    value_type = type(value)
    if value is None or value_type in (str, bool, int):
        return value
    if value_type is float:
        if not math.isfinite(value):
            raise ValueError(f"{path} must contain only finite JSON numbers")
        return value
    if value_type is FrozenDict:
        return FrozenDict(value, _path=path)
    if value_type is dict:
        return FrozenDict(value, _path=path)
    if value_type in (list, tuple):
        return tuple(
            freeze_json(item, f"{path}[{index}]") for index, item in enumerate(value)
        )
    raise TypeError(f"{path} must contain only JSON-compatible values")


def json_projection(value: object) -> object:
    """Return a fresh mutable JSON projection without exposing internal containers."""

    if type(value) is FrozenDict:
        return {key: json_projection(item) for key, item in value.items()}
    if type(value) is tuple:
        return [json_projection(item) for item in value]
    return value


@dataclass(frozen=True, slots=True)
class EngineContext:
    """Run-scoped identity required by every deterministic core engine."""

    run_id: UUID

    def __post_init__(self) -> None:
        if type(self.run_id) is not UUID:
            raise TypeError("run_id must be a UUID")
        if self.run_id.int == 0:
            raise ValueError("run_id must be a non-zero UUID")


@dataclass(frozen=True, slots=True)
class ReceivedEvent:
    """A sequenced browser event paired with authoritative receipt context."""

    participant_id: int
    device_id: str
    record: AdmittedEventRecord
    received_at_server_ms: int
    delayed_delivery: bool = False

    def __post_init__(self) -> None:
        from integrity_service.core.records import AdmittedEventRecord

        if self.participant_id < 1:
            raise ValueError("participant_id must be positive")
        if not self.device_id:
            raise ValueError("device_id must not be empty")
        if self.received_at_server_ms < 0:
            raise ValueError("received_at_server_ms must not be negative")
        if not isinstance(self.record, AdmittedEventRecord):
            raise TypeError("record must be an admitted immutable event snapshot")


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
    evidence: Mapping[str, object]
    metadata: Mapping[str, object]

    def __post_init__(self) -> None:
        object.__setattr__(self, "evidence", freeze_json(self.evidence, "$.evidence"))
        object.__setattr__(self, "metadata", freeze_json(self.metadata, "$.metadata"))

    def to_json(self) -> dict[str, object]:
        """Project the complete command into canonical JSON-compatible values."""

        return {
            "command_id": str(self.command_id),
            "run_id": str(self.run_id),
            "kind": self.kind,
            "participant_id": self.participant_id,
            "device_id": self.device_id,
            "incident_id": None if self.incident_id is None else str(self.incident_id),
            "event_type": self.event_type,
            "action": self.action,
            "client_occurred_at_ms": self.client_occurred_at_ms,
            "received_at_server_ms": self.received_at_server_ms,
            "delayed_delivery": self.delayed_delivery,
            "evidence": json_projection(self.evidence),
            "metadata": json_projection(self.metadata),
        }


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
    evidence: Mapping[str, object] | None = None,
    metadata: Mapping[str, object] | None = None,
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
