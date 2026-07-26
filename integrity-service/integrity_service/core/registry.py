"""Parser and metadata validator for frozen event-registry snapshots."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from dataclasses import dataclass
from types import MappingProxyType

from jsonschema import Draft202012Validator
from referencing import Registry as ReferencingRegistry
from referencing.exceptions import NoSuchResource

from integrity_service.core.commands import FrozenDict, freeze_json, json_projection


_PHASES = ("triggered", "escalated", "restored")
_DEFINITION_SCHEMA = {
    "type": "object",
    "required": [
        "id",
        "schema_version",
        "origin",
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
        "origin": {"enum": ["browser", "server"]},
        "signals": {
            "type": "object",
            "required": list(_PHASES),
            "additionalProperties": False,
            "properties": {phase: {"type": "string"} for phase in _PHASES},
        },
        "emission": {"enum": ["every", "edge", "sample", "health_snapshot"]},
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
    origin: str
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
    metadata_schema: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class _CompiledValidator:
    validator: Draft202012Validator

    def validate(self, payload: Mapping[str, object]) -> None:
        self.validator.validate(payload)


def _reject_retrieval(uri: str):
    raise NoSuchResource(ref=uri)


_NO_RETRIEVAL_REGISTRY = ReferencingRegistry(retrieve=_reject_retrieval)
_SNAPSHOT_VALIDATOR = Draft202012Validator(
    _SNAPSHOT_SCHEMA, registry=_NO_RETRIEVAL_REGISTRY
)
_REFERENCE_KEYWORDS = frozenset(("$ref", "$dynamicRef", "$recursiveRef"))


def _reject_nonlocal_references(value: object, path: str = "$") -> None:
    if type(value) is dict:
        for key, item in value.items():
            item_path = f"{path}.{key}"
            if key in _REFERENCE_KEYWORDS and (
                type(item) is not str or not item.startswith("#")
            ):
                raise ValueError(f"{item_path} must be a local fragment reference")
            _reject_nonlocal_references(item, item_path)
    elif type(value) in (list, tuple):
        for index, item in enumerate(value):
            _reject_nonlocal_references(item, f"{path}[{index}]")


def parse_definition(definition_id: str, raw: Mapping[str, object]) -> ParsedDefinition:
    if raw["id"] != definition_id:
        raise ValueError(f"registry definition key/id mismatch {definition_id}")
    signals = raw["signals"]
    evidence = raw["evidence"]
    assert isinstance(signals, Mapping)
    assert isinstance(evidence, Mapping)
    metadata_schema = deepcopy(raw["metadata_schema"])
    assert isinstance(metadata_schema, dict)
    _reject_nonlocal_references(metadata_schema)
    Draft202012Validator.check_schema(metadata_schema)
    frozen_schema = freeze_json(metadata_schema, "$.metadata_schema")
    assert isinstance(frozen_schema, FrozenDict)
    return ParsedDefinition(
        id=str(raw["id"]),
        schema_version=int(raw["schema_version"]),
        origin=str(raw["origin"]),
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
        metadata_schema=frozen_schema,
    )


class Registry:
    def __init__(self, snapshot: dict[str, object]):
        _SNAPSHOT_VALIDATOR.validate(snapshot)
        self.version = str(snapshot["version"])
        by_signal: dict[str, tuple[ParsedDefinition, str]] = {}
        validators: dict[str, _CompiledValidator] = {}
        definitions = snapshot["definitions"]
        assert isinstance(definitions, Mapping)
        for definition_id in sorted(definitions):
            raw = definitions[definition_id]
            assert isinstance(raw, Mapping)
            parsed = parse_definition(definition_id, raw)
            validator_schema = deepcopy(raw["metadata_schema"])
            assert isinstance(validator_schema, dict)
            validators[parsed.id] = _CompiledValidator(
                Draft202012Validator(
                    validator_schema, registry=_NO_RETRIEVAL_REGISTRY
                )
            )
            for phase in _PHASES:
                signal_id = getattr(parsed, phase)
                if not signal_id:
                    continue
                if signal_id in by_signal:
                    raise ValueError("duplicate registry signal " + signal_id)
                by_signal[signal_id] = (parsed, phase)
        self._by_signal = MappingProxyType(by_signal)
        self._validators = MappingProxyType(validators)

    def resolve(self, event_type: str) -> tuple[ParsedDefinition, str]:
        try:
            return self._by_signal[event_type]
        except KeyError as exc:
            raise UnknownSignal(event_type) from exc

    def validate_payload(self, event_type: str, payload: Mapping[str, object]) -> None:
        definition, _ = self.resolve(event_type)
        projected = json_projection(payload)
        assert isinstance(projected, dict)
        self._validators[definition.id].validate(projected)
