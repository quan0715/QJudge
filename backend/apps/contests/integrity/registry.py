"""Canonical, data-defined integrity event registry."""
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal, TypeAlias


REGISTRY_VERSION = "2026-09-10.1"

Emission = Literal["every", "edge", "sample", "health_snapshot"]
Origin = Literal["browser", "server"]
JsonScalar: TypeAlias = str | int | float | bool | None
FrozenJsonValue: TypeAlias = (
    JsonScalar | tuple["FrozenJsonValue", ...] | Mapping[str, "FrozenJsonValue"]
)


@dataclass(frozen=True)
class EventDefinition:
    id: str
    schema_version: int
    origin: Origin
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
        return MappingProxyType(
            {key: _freeze_json(item) for key, item in value.items()}
        )
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
    origin: Origin = "browser",
) -> EventDefinition:
    return EventDefinition(
        id=definition_id,
        schema_version=1,
        origin=origin,
        signals=MappingProxyType(
            {
                "triggered": triggered,
                "escalated": escalated,
                "restored": restored,
            }
        ),
        emission=emission,
        incident_family=family,
        priority=priority,
        grace_ms=grace_ms,
        evidence=_freeze_json_mapping(
            {
                "mode": "incident_window" if sources else "none",
                "sources": list(sources),
                "before_ms": 5_000 if sources else 0,
                "after_ms": 5_000 if sources else 0,
                "max_segment_ms": 60_000,
            }
        ),
        action=action,
        metadata_schema=_freeze_json_mapping(
            {
                "type": "object",
                "additionalProperties": True,
            }
        ),
    )


DEFINITIONS = MappingProxyType(
    {
        "health_snapshot": _definition(
            "health_snapshot",
            triggered="health_snapshot",
            emission="health_snapshot",
            family="connectivity",
            priority=3,
        ),
        "connectivity": _definition(
            "connectivity",
            triggered="connectivity_suspect",
            escalated="connectivity_timeout",
            restored="connectivity_restored",
            emission="health_snapshot",
            family="connectivity",
            priority=1,
            grace_ms=30_000,
            action="pause",
            origin="server",
        ),
        # No pause action on purpose. Leaving fullscreen does not cost us the
        # ability to collect evidence -- the screen share keeps recording the
        # whole display. Sending the student back to pre-check would, because
        # pre-check runs outside the monitored runtime. Reserve pre-check for
        # events that actually end evidence capture; this one is recorded and
        # penalized, and the student keeps answering.
        "fullscreen_integrity": _definition(
            "fullscreen_integrity",
            triggered="exit_fullscreen_triggered",
            escalated="exit_fullscreen",
            restored="fullscreen_restored",
            emission="edge",
            family="fullscreen",
            priority=1,
            grace_ms=10_000,
            sources=("screen_share",),
        ),
        "mouse_leave": _definition(
            "mouse_leave",
            triggered="mouse_leave_triggered",
            escalated="mouse_leave",
            restored="mouse_leave_restored",
            emission="edge",
            family="pointer_boundary",
            priority=1,
            grace_ms=5_000,
            sources=("screen_share",),
        ),
        "multi_display": _definition(
            "multi_display",
            triggered="multi_display_triggered",
            escalated="multiple_displays",
            restored="multi_display_restored",
            emission="edge",
            family="display_topology",
            priority=1,
            grace_ms=20_000,
            sources=("screen_share",),
            action="pause",
        ),
        "screen_share": _definition(
            "screen_share",
            triggered="screen_share_interrupted",
            escalated="screen_share_stopped",
            restored="screen_share_restored",
            emission="edge",
            family="screen_capture",
            priority=0,
            grace_ms=20_000,
            sources=("screen_share",),
            action="pause",
        ),
        "webcam": _definition(
            "webcam",
            triggered="webcam_interrupted",
            escalated="webcam_stopped",
            restored="webcam_restored",
            emission="edge",
            family="webcam_capture",
            priority=1,
            grace_ms=20_000,
            sources=("webcam",),
            action="pause",
        ),
        # Tablet-only (see resolveDeviceMonitoringPlan), where the evidence
        # source is the webcam -- Split View never interrupts it, so this is
        # recorded rather than paused. Pre-check cannot verify the condition
        # either: it has no viewport step, and an iPad PWA window can enter
        # Split View. The runtime `viewport_restored` signal is what actually
        # confirms recovery.
        "viewport": _definition(
            "viewport",
            triggered="viewport_interrupted",
            escalated="viewport_stopped",
            restored="viewport_restored",
            emission="edge",
            family="viewport_integrity",
            priority=1,
            grace_ms=5_000,
            sources=("webcam",),
        ),
        "clipboard": _definition(
            "clipboard",
            triggered="clipboard_action",
            emission="every",
            family="clipboard",
            priority=2,
            sources=("screen_share",),
        ),
        "forbidden_action": _definition(
            "forbidden_action",
            triggered="forbidden_action",
            emission="every",
            family="forbidden_action",
            priority=2,
            sources=("screen_share",),
        ),
        "listener_integrity": _definition(
            "listener_integrity",
            triggered="listener_tampered",
            emission="edge",
            family="listener_integrity",
            priority=0,
            sources=("screen_share", "webcam"),
            action="pause",
        ),
        # Written by the backend when POST /exam/start/ carries pre-check
        # evidence, so a passed pre-check leaves an auditable record instead of
        # living only in the client's sessionStorage.
        "precheck_passed": _definition(
            "precheck_passed",
            triggered="precheck_passed",
            emission="every",
            family="exam_lifecycle",
            priority=3,
            origin="server",
        ),
        "exam_entered": _definition(
            "exam_entered",
            triggered="exam_entered",
            emission="every",
            family="exam_lifecycle",
            priority=3,
        ),
        "exam_submit_initiated": _definition(
            "exam_submit_initiated",
            triggered="exam_submit_initiated",
            emission="every",
            family="exam_lifecycle",
            priority=3,
        ),
    }
)
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
                "origin": definition.origin,
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
