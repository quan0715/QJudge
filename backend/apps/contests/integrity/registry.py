"""Canonical, data-defined integrity event registry."""
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal, TypeAlias


REGISTRY_VERSION = "2026-07-21.1"

Emission = Literal["every", "edge", "sample", "state_snapshot"]
JsonScalar: TypeAlias = str | int | float | bool | None
FrozenJsonValue: TypeAlias = (
    JsonScalar
    | tuple["FrozenJsonValue", ...]
    | Mapping[str, "FrozenJsonValue"]
)


@dataclass(frozen=True)
class EventDefinition:
    id: str
    schema_version: int
    signals: Mapping[str, str]
    emission: Emission
    incident_family: str
    priority: int
    grace_ms: int
    evidence: Mapping[str, FrozenJsonValue]
    action: str
    metadata_schema: Mapping[str, FrozenJsonValue]


def _freeze_json(value: object) -> FrozenJsonValue:
    if isinstance(value, Mapping):
        return MappingProxyType({key: _freeze_json(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_json(item) for item in value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise TypeError(f"Unsupported registry JSON value: {type(value)!r}")


def _freeze_json_mapping(value: Mapping[str, object]) -> Mapping[str, FrozenJsonValue]:
    frozen = _freeze_json(value)
    assert isinstance(frozen, Mapping)
    return frozen


def _json_snapshot(value: FrozenJsonValue) -> object:
    if isinstance(value, Mapping):
        return {key: _json_snapshot(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_json_snapshot(item) for item in value]
    return value


def _definition(
    definition_id: str,
    *,
    triggered: str,
    escalated: str = "",
    restored: str = "",
    emission: Emission,
    family: str,
    priority: int,
    grace_ms: int = 0,
    sources: tuple[str, ...] = (),
    action: str = "record_event",
) -> EventDefinition:
    return EventDefinition(
        id=definition_id,
        schema_version=1,
        signals=MappingProxyType({
            "triggered": triggered,
            "escalated": escalated,
            "restored": restored,
        }),
        emission=emission,
        incident_family=family,
        priority=priority,
        grace_ms=grace_ms,
        evidence=_freeze_json_mapping({
            "mode": "incident_window" if sources else "none",
            "sources": list(sources),
            "before_ms": 10_000 if sources else 0,
            "after_ms": 10_000 if sources else 0,
            "max_segment_ms": 60_000,
        }),
        action=action,
        metadata_schema=_freeze_json_mapping({
            "type": "object",
            "additionalProperties": True,
        }),
    )


DEFINITIONS = MappingProxyType({
    "state_snapshot": _definition(
        "state_snapshot", triggered="state_snapshot",
        emission="state_snapshot", family="connectivity", priority=3,
    ),
    "connectivity": _definition(
        "connectivity", triggered="connectivity_suspect",
        escalated="heartbeat_timeout", restored="connectivity_restored",
        emission="state_snapshot", family="connectivity", priority=1,
        grace_ms=45_000, action="pause",
    ),
    "fullscreen_integrity": _definition(
        "fullscreen_integrity", triggered="exit_fullscreen_triggered",
        escalated="exit_fullscreen", restored="fullscreen_restored",
        emission="edge", family="fullscreen", priority=1,
        grace_ms=30_000, sources=("screen_share",), action="pause",
    ),
    "mouse_leave": _definition(
        "mouse_leave", triggered="mouse_leave_triggered", escalated="mouse_leave",
        restored="mouse_leave_restored", emission="edge", family="pointer_boundary",
        priority=1, grace_ms=20_000, sources=("screen_share",),
    ),
    "multi_display": _definition(
        "multi_display", triggered="multi_display_triggered",
        escalated="multiple_displays", restored="multi_display_restored",
        emission="edge", family="display_topology", priority=1, grace_ms=30_000,
        sources=("screen_share",), action="pause",
    ),
    "screen_share": _definition(
        "screen_share", triggered="screen_share_interrupted",
        escalated="screen_share_stopped", restored="screen_share_restored",
        emission="edge", family="screen_capture", priority=0, grace_ms=30_000,
        sources=("screen_share",), action="pause",
    ),
    "webcam": _definition(
        "webcam", triggered="webcam_interrupted", escalated="webcam_stopped",
        restored="webcam_restored", emission="edge", family="webcam_capture",
        priority=1, grace_ms=30_000, sources=("webcam",), action="pause",
    ),
    "viewport": _definition(
        "viewport", triggered="viewport_interrupted", escalated="viewport_stopped",
        restored="viewport_restored", emission="edge", family="viewport_integrity",
        priority=1, grace_ms=30_000, sources=("screen_share",), action="pause",
    ),
    "clipboard": _definition(
        "clipboard", triggered="clipboard_action", emission="every",
        family="clipboard", priority=2, sources=("screen_share",),
    ),
    "listener_integrity": _definition(
        "listener_integrity", triggered="listener_tampered", emission="edge",
        family="listener_integrity", priority=0, sources=("screen_share", "webcam"),
        action="pause",
    ),
    "display_api": _definition(
        "display_api", triggered="display_api_degraded", emission="sample",
        family="display_api", priority=2,
    ),
    "evidence_buffer": _definition(
        "evidence_buffer", triggered="evidence_buffer_degraded", emission="edge",
        family="evidence_buffer", priority=2,
    ),
    "evidence_source": _definition(
        "evidence_source", triggered="evidence_source_degraded", emission="edge",
        family="evidence_source", priority=2,
    ),
    "clock_integrity": _definition(
        "clock_integrity", triggered="clock_integrity_degraded", emission="edge",
        family="clock_integrity", priority=2,
    ),
    "exam_entered": _definition(
        "exam_entered", triggered="exam_entered", emission="every",
        family="exam_lifecycle", priority=3,
    ),
    "exam_submit_initiated": _definition(
        "exam_submit_initiated", triggered="exam_submit_initiated", emission="every",
        family="exam_lifecycle", priority=3,
    ),
    "concurrent_login": _definition(
        "concurrent_login", triggered="concurrent_login_detected", emission="edge",
        family="device_session", priority=0, sources=("screen_share", "webcam"),
        action="pause",
    ),
    "other_devices_logged_out": _definition(
        "other_devices_logged_out", triggered="other_devices_logged_out",
        emission="every", family="device_session", priority=3,
    ),
    "end_exam_device_mismatch": _definition(
        "end_exam_device_mismatch", triggered="end_exam_device_mismatch",
        emission="edge", family="device_session", priority=1,
        sources=("screen_share", "webcam"),
    ),
})
ACTIVE_SIGNAL_IDS = frozenset(
    signal
    for definition in DEFINITIONS.values()
    for signal in definition.signals.values()
    if signal
)


def build_registry_snapshot() -> dict:
    """Return a JSON-serializable copy of the immutable registry contract."""
    return {
        "version": REGISTRY_VERSION,
        "definitions": {
            key: {
                "id": definition.id,
                "schema_version": definition.schema_version,
                "signals": dict(definition.signals),
                "emission": definition.emission,
                "incident_family": definition.incident_family,
                "priority": definition.priority,
                "grace_ms": definition.grace_ms,
                "evidence": _json_snapshot(definition.evidence),
                "action": definition.action,
                "metadata_schema": _json_snapshot(definition.metadata_schema),
            }
            for key, definition in DEFINITIONS.items()
        },
    }
