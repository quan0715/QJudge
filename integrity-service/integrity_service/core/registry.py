"""Parser and metadata validator for frozen event-registry snapshots."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from dataclasses import dataclass

import jsonschema


_PHASES = ("triggered", "escalated", "restored")
_DEFINITION_SCHEMA = {
    "type": "object",
    "required": [
        "id",
        "schema_version",
        "signals",
        "emission",
        "incident_family",
        "priority",
        "grace_ms",
        "evidence",
        "action",
        "metadata_schema",
    ],
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string", "minLength": 1},
        "schema_version": {"type": "integer", "minimum": 1},
        "signals": {
            "type": "object",
            "required": list(_PHASES),
            "additionalProperties": False,
            "properties": {phase: {"type": "string"} for phase in _PHASES},
        },
        "emission": {"enum": ["every", "edge", "sample", "state_snapshot"]},
        "incident_family": {"type": "string", "minLength": 1},
        "priority": {"type": "integer", "minimum": 0},
        "grace_ms": {"type": "integer", "minimum": 0},
        "evidence": {
            "type": "object",
            "required": ["mode", "sources", "before_ms", "after_ms", "max_segment_ms"],
            "additionalProperties": False,
            "properties": {
                "mode": {"enum": ["none", "incident_window"]},
                "sources": {"type": "array", "items": {"type": "string"}, "uniqueItems": True},
                "before_ms": {"type": "integer", "minimum": 0},
                "after_ms": {"type": "integer", "minimum": 0},
                "max_segment_ms": {"type": "integer", "minimum": 0},
            },
        },
        "action": {"enum": ["record_event", "record", "pause", "lock", "submit", "audit"]},
        "metadata_schema": {"type": "object"},
    },
}
_SNAPSHOT_SCHEMA = {
    "type": "object",
    "required": ["version", "definitions"],
    "additionalProperties": False,
    "properties": {
        "version": {"type": ["string", "integer"]},
        "definitions": {
            "type": "object",
            "additionalProperties": _DEFINITION_SCHEMA,
        },
    },
}


class UnknownSignal(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ParsedDefinition:
    id: str
    schema_version: int
    triggered: str
    escalated: str
    restored: str
    emission: str
    incident_family: str
    priority: int
    grace_ms: int
    evidence_sources: tuple[str, ...]
    evidence_before_ms: int
    evidence_after_ms: int
    action: str
    metadata_schema: dict[str, object]


def parse_definition(definition_id: str, raw: Mapping[str, object]) -> ParsedDefinition:
    if raw["id"] != definition_id:
        raise ValueError(f"registry definition key/id mismatch {definition_id}")
    signals = raw["signals"]
    evidence = raw["evidence"]
    assert isinstance(signals, Mapping)
    assert isinstance(evidence, Mapping)
    metadata_schema = deepcopy(raw["metadata_schema"])
    assert isinstance(metadata_schema, dict)
    jsonschema.Draft202012Validator.check_schema(metadata_schema)
    return ParsedDefinition(
        id=str(raw["id"]),
        schema_version=int(raw["schema_version"]),
        triggered=str(signals["triggered"]),
        escalated=str(signals["escalated"]),
        restored=str(signals["restored"]),
        emission=str(raw["emission"]),
        incident_family=str(raw["incident_family"]),
        priority=int(raw["priority"]),
        grace_ms=int(raw["grace_ms"]),
        evidence_sources=tuple(str(source) for source in evidence["sources"]),
        evidence_before_ms=int(evidence["before_ms"]),
        evidence_after_ms=int(evidence["after_ms"]),
        action=str(raw["action"]),
        metadata_schema=metadata_schema,
    )


class Registry:
    def __init__(self, snapshot: dict[str, object]):
        jsonschema.validate(snapshot, _SNAPSHOT_SCHEMA)
        self.version = str(snapshot["version"])
        self.by_signal: dict[str, tuple[ParsedDefinition, str]] = {}
        definitions = snapshot["definitions"]
        assert isinstance(definitions, Mapping)
        for definition_id in sorted(definitions):
            raw = definitions[definition_id]
            assert isinstance(raw, Mapping)
            parsed = parse_definition(definition_id, raw)
            for phase in _PHASES:
                signal_id = getattr(parsed, phase)
                if not signal_id:
                    continue
                if signal_id in self.by_signal:
                    raise ValueError("duplicate registry signal " + signal_id)
                self.by_signal[signal_id] = (parsed, phase)

    def resolve(self, event_type: str) -> tuple[ParsedDefinition, str]:
        try:
            return self.by_signal[event_type]
        except KeyError as exc:
            raise UnknownSignal(event_type) from exc

    def validate_payload(self, event_type: str, payload: dict[str, object]) -> None:
        definition, _ = self.resolve(event_type)
        jsonschema.validate(payload, definition.metadata_schema)
