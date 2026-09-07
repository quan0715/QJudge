"""Registry-driven incident transitions with no external side effects."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from integrity_service.core.commands import (
    CommandAction,
    EngineContext,
    FrozenDict,
    IntegrityCommand,
    ReceivedEvent,
    deterministic_uuid,
    freeze_json,
    make_command,
)
from integrity_service.core.registry import ParsedDefinition, Registry


_REGISTRY_ACTIONS: dict[str, CommandAction] = {
    "audit": "audit",
    "record": "record",
    "record_event": "record",
    "pause": "pause",
    "lock": "lock",
    "submit": "submit",
}


@dataclass(frozen=True, slots=True)
class IncidentResult:
    commands: tuple[IntegrityCommand, ...]


@dataclass(slots=True)
class _OpenIncident:
    definition: ParsedDefinition
    incident_id: UUID
    participant_id: int
    device_id: str
    trigger_event_id: UUID
    trigger_client_occurred_at_ms: int
    trigger_metadata: FrozenDict
    deadline_server_ms: int
    escalated: bool = False


class IncidentEngine:
    def __init__(
        self,
        registry: Registry,
        context: EngineContext,
        *,
        delivery_tolerance_ms: int = 0,
    ):
        if type(delivery_tolerance_ms) is not int or delivery_tolerance_ms < 0:
            raise ValueError("delivery_tolerance_ms must be a non-negative integer")
        self._registry = registry
        self._context = context
        self._delivery_tolerance_ms = delivery_tolerance_ms
        self._open: dict[tuple[int, str], _OpenIncident] = {}

    def ingest(self, received: ReceivedEvent) -> IncidentResult:
        definition, phase = self._registry.resolve(received.record.event_type)
        self._registry.validate_payload(
            received.record.event_type, received.record.payload
        )

        # Server-owned registry lifecycles are observations claimed by an untrusted browser here.
        # Their distinct identity phase cannot collide with the authoritative server producer.
        if definition.origin == "server":
            return IncidentResult(
                (
                    self._event_command(
                        received,
                        f"external_server_{phase}_audit",
                        definition,
                        "audit",
                        None,
                    ),
                )
            )

        key = (received.participant_id, definition.incident_family)

        # Registry escalated signal IDs are observable browser claims, never timer authority.
        # A distinct phase keeps their command identity disjoint from canonical escalation.
        if phase == "escalated":
            opened = self._open.get(key)
            return IncidentResult(
                (
                    self._event_command(
                        received,
                        "external_escalated_audit",
                        definition,
                        "audit",
                        None if opened is None else opened.incident_id,
                    ),
                )
            )

        if received.delayed_delivery:
            command = self._event_command(received, phase, definition, "audit", None)
            return IncidentResult((command,))

        if phase == "restored":
            opened = self._open.get(key)
            commands: list[IntegrityCommand] = []
            if (
                opened is not None
                and not opened.escalated
                and self._client_grace_expired(opened, received)
            ):
                commands.append(self._escalate(opened))
            opened = self._open.pop(key, None)
            commands.append(
                self._event_command(
                    received,
                    phase,
                    definition,
                    "audit",
                    None if opened is None else opened.incident_id,
                )
            )
            return IncidentResult(tuple(commands))

        opened = self._open.get(key)
        if opened is not None:
            return IncidentResult(
                (
                    self._event_command(
                        received, phase, definition, "audit", opened.incident_id
                    ),
                )
            )

        lifecycle_signal = bool(definition.escalated or definition.restored)
        incident_id = None
        action = _REGISTRY_ACTIONS[definition.action]
        if lifecycle_signal:
            incident_id = deterministic_uuid(
                self._context.run_id,
                "incident",
                received.participant_id,
                definition.incident_family,
                received.record.event_id,
            )
            self._open[key] = _OpenIncident(
                definition=definition,
                incident_id=incident_id,
                participant_id=received.participant_id,
                device_id=received.device_id,
                trigger_event_id=received.record.event_id,
                trigger_client_occurred_at_ms=received.record.client_occurred_at_ms,
                trigger_metadata=self._snapshot_metadata(received.record.payload),
                deadline_server_ms=(
                    received.received_at_server_ms
                    + definition.grace_ms
                    + self._delivery_tolerance_ms
                ),
            )
            action = "record"
        return IncidentResult(
            (self._event_command(received, phase, definition, action, incident_id),)
        )

    def tick(self, now_server_ms: int) -> IncidentResult:
        commands = []
        for key in sorted(self._open):
            opened = self._open[key]
            if not opened.escalated and now_server_ms >= opened.deadline_server_ms:
                commands.append(self._escalate(opened))
        return IncidentResult(tuple(commands))

    @staticmethod
    def _client_grace_expired(
        opened: _OpenIncident,
        restored: ReceivedEvent,
    ) -> bool:
        duration_ms = (
            restored.record.client_occurred_at_ms - opened.trigger_client_occurred_at_ms
        )
        return duration_ms >= opened.definition.grace_ms

    def next_deadline_server_ms(self) -> int | None:
        deadlines = [
            opened.deadline_server_ms
            for opened in self._open.values()
            if not opened.escalated
        ]
        return min(deadlines, default=None)

    def evidence_anchors(self, participant_id: int, device_id: str) -> tuple[tuple[UUID, int], ...]:
        """Original trigger windows remain protected until the lifecycle closes."""
        return tuple((opened.trigger_event_id,
            max(0, opened.trigger_client_occurred_at_ms - opened.definition.evidence_before_ms))
            for opened in self._open.values()
            if opened.participant_id == participant_id and opened.device_id == device_id
            and opened.definition.evidence_sources)

    def _escalate(self, opened: _OpenIncident) -> IntegrityCommand:
        opened.escalated = True
        return make_command(
            context=self._context,
            kind="record_event",
            participant_id=opened.participant_id,
            device_id=opened.device_id,
            incident_id=opened.incident_id,
            event_id=opened.trigger_event_id,
            phase="escalated",
            event_type=opened.definition.escalated,
            action=_REGISTRY_ACTIONS[opened.definition.action],
            client_occurred_at_ms=opened.trigger_client_occurred_at_ms,
            received_at_server_ms=opened.deadline_server_ms,
            evidence=self._evidence(opened.definition),
            metadata=opened.trigger_metadata,
        )

    def _event_command(
        self,
        received: ReceivedEvent,
        phase: str,
        definition: ParsedDefinition,
        action: CommandAction,
        incident_id: UUID | None,
    ) -> IntegrityCommand:
        return make_command(
            context=self._context,
            kind="record_event",
            participant_id=received.participant_id,
            device_id=received.device_id,
            incident_id=incident_id,
            event_id=received.record.event_id,
            phase=phase,
            event_type=received.record.event_type,
            action=action,
            client_occurred_at_ms=received.record.client_occurred_at_ms,
            received_at_server_ms=received.received_at_server_ms,
            delayed_delivery=received.delayed_delivery,
            evidence=self._evidence(definition),
            metadata=dict(received.record.payload),
        )

    @staticmethod
    def _evidence(definition: ParsedDefinition) -> dict[str, object]:
        return {
            "sources": list(definition.evidence_sources),
            "before_ms": definition.evidence_before_ms,
            "after_ms": definition.evidence_after_ms,
        }

    @staticmethod
    def _snapshot_metadata(payload: dict[str, object]) -> FrozenDict:
        frozen = freeze_json(payload, "$.trigger.payload")
        assert isinstance(frozen, FrozenDict)
        return frozen
