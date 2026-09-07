"""Server-receipt-time-only connectivity transition monitor."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from integrity_service.core.commands import (
    CommandAction,
    EngineContext,
    IntegrityCommand,
    deterministic_uuid,
    make_command,
)
from integrity_service.core.registry import Registry


_REGISTRY_ACTIONS: dict[str, CommandAction] = {
    "audit": "audit",
    "record": "record",
    "record_event": "record",
    "pause": "pause",
    "lock": "lock",
    "submit": "submit",
}


def connectivity_effect_overlaps_gap(command: IntegrityCommand, started_ms: int, ended_ms: int) -> bool:
    """Only an unavailable interval in the observed silence can mask a sanction."""
    return (
        command.kind == "record_event"
        and command.event_type in {"connectivity_suspect", "connectivity_timeout"}
        and command.action in {"record", "pause", "lock", "submit"}
        and command.metadata.get("timing_basis") == "server_receipt"
        and started_ms < ended_ms
        and command.metadata.get("last_received_at_server_ms", ended_ms) < ended_ms
        and command.metadata.get("transition_at_server_ms", started_ms) > started_ms
    )


@dataclass(slots=True)
class _DeviceState:
    last_received_at_server_ms: int
    suspect_sent: bool = False
    timeout_sent: bool = False

    @property
    def degraded(self) -> bool:
        return self.suspect_sent or self.timeout_sent


@dataclass(slots=True)
class _ConnectivityIncident:
    incident_id: UUID
    active_devices: set[str] = field(default_factory=set)
    action_applied: bool = False


class ConnectivityMonitor:
    def __init__(
        self,
        policy: dict[str, object],
        registry: Registry,
        context: EngineContext,
    ):
        suspect_after_ms = policy.get("suspect_after_ms")
        disconnected_after_ms = policy.get("disconnected_after_ms")
        if type(suspect_after_ms) is not int or suspect_after_ms < 0:
            raise ValueError("suspect_after_ms must be a non-negative integer")
        if (
            type(disconnected_after_ms) is not int
            or disconnected_after_ms < suspect_after_ms
        ):
            raise ValueError(
                "disconnected_after_ms must be an integer at least suspect_after_ms"
            )
        definition, phase = registry.resolve("connectivity_suspect")
        if phase != "triggered":
            raise ValueError("connectivity_suspect must be a triggered registry signal")
        if definition.origin != "server":
            raise ValueError("connectivity lifecycle must be server-owned")
        timeout_definition, timeout_phase = registry.resolve("connectivity_timeout")
        restored_definition, restored_phase = registry.resolve("connectivity_restored")
        if (
            timeout_definition.id != definition.id
            or timeout_phase != "escalated"
            or restored_definition.id != definition.id
            or restored_phase != "restored"
        ):
            raise ValueError("connectivity signals must share one registry lifecycle")
        self._suspect_after_ms = suspect_after_ms
        self._disconnected_after_ms = disconnected_after_ms
        self._registry = registry
        self._definition = definition
        self._context = context
        self._devices: dict[tuple[int, str], _DeviceState] = {}
        self._incidents: dict[tuple[int, str], _ConnectivityIncident] = {}

    def observe(
        self, *, participant_id: int, device_id: str, server_ms: int
    ) -> tuple[IntegrityCommand, ...]:
        if type(participant_id) is not int or participant_id < 1:
            raise ValueError("participant_id must be a positive integer")
        if type(device_id) is not str or not device_id:
            raise ValueError("device_id must not be empty")
        if type(server_ms) is not int or server_ms < 0:
            raise ValueError("server_ms must be a non-negative integer")

        # Receipt time is itself a deterministic clock advance. All devices transition before
        # the observed device is restored, so scheduler timing cannot erase a real gap.
        commands = list(self._advance(server_ms))
        key = (participant_id, device_id)
        previous = self._devices.get(key)
        if previous is not None and previous.degraded:
            incident_key = self._incident_key(participant_id)
            incident = self._incidents[incident_key]
            commands.append(
                self._transition_command(
                    participant_id=participant_id,
                    device_id=device_id,
                    incident_id=incident.incident_id,
                    event_type="connectivity_restored",
                    phase="restored",
                    transition_at_server_ms=server_ms,
                    last_received_at_server_ms=previous.last_received_at_server_ms,
                    action="audit",
                )
            )
            incident.active_devices.discard(device_id)
            if not incident.active_devices:
                del self._incidents[incident_key]
        self._devices[key] = _DeviceState(last_received_at_server_ms=server_ms)
        return tuple(commands)

    def tick(self, now_server_ms: int) -> tuple[IntegrityCommand, ...]:
        if type(now_server_ms) is not int or now_server_ms < 0:
            raise ValueError("now_server_ms must be a non-negative integer")
        return self._advance(now_server_ms)

    def stop_participant(self, participant_id: int) -> None:
        if type(participant_id) is not int or participant_id < 1:
            raise ValueError("participant_id must be a positive integer")
        for key in tuple(self._devices):
            if key[0] == participant_id:
                del self._devices[key]
        self._incidents.pop(self._incident_key(participant_id), None)

    def next_transition_server_ms(self) -> int | None:
        deadlines: list[int] = []
        for state in self._devices.values():
            if not state.suspect_sent:
                deadlines.append(
                    state.last_received_at_server_ms + self._suspect_after_ms
                )
            if not state.timeout_sent:
                deadlines.append(
                    state.last_received_at_server_ms + self._disconnected_after_ms
                )
        return min(deadlines, default=None)

    def _advance(self, now_server_ms: int) -> tuple[IntegrityCommand, ...]:
        due: list[tuple[int, int, int, str, str]] = []
        for (participant_id, device_id), state in self._devices.items():
            suspect_at = state.last_received_at_server_ms + self._suspect_after_ms
            timeout_at = state.last_received_at_server_ms + self._disconnected_after_ms
            if not state.suspect_sent and now_server_ms >= suspect_at:
                due.append(
                    (suspect_at, 0, participant_id, device_id, "connectivity_suspect")
                )
            if not state.timeout_sent and now_server_ms >= timeout_at:
                due.append(
                    (timeout_at, 1, participant_id, device_id, "connectivity_timeout")
                )

        commands: list[IntegrityCommand] = []
        for transition_ms, _, participant_id, device_id, event_type in sorted(due):
            state = self._devices[(participant_id, device_id)]
            if event_type == "connectivity_suspect":
                if state.suspect_sent:
                    continue
                state.suspect_sent = True
                commands.append(
                    self._suspect_command(
                        participant_id, device_id, state, transition_ms
                    )
                )
            else:
                if state.timeout_sent:
                    continue
                state.timeout_sent = True
                commands.append(
                    self._timeout_command(
                        participant_id, device_id, state, transition_ms
                    )
                )
        return tuple(commands)

    def _suspect_command(
        self,
        participant_id: int,
        device_id: str,
        state: _DeviceState,
        transition_ms: int,
    ) -> IntegrityCommand:
        incident_key = self._incident_key(participant_id)
        incident = self._incidents.get(incident_key)
        first_device = incident is None
        if incident is None:
            incident = _ConnectivityIncident(
                incident_id=deterministic_uuid(
                    self._context.run_id,
                    "connectivity-incident",
                    participant_id,
                    self._definition.incident_family,
                    transition_ms,
                )
            )
            self._incidents[incident_key] = incident
        incident.active_devices.add(device_id)
        action: CommandAction = "record" if first_device else "audit"
        return self._transition_command(
            participant_id=participant_id,
            device_id=device_id,
            incident_id=incident.incident_id,
            event_type="connectivity_suspect",
            phase="triggered",
            transition_at_server_ms=transition_ms,
            last_received_at_server_ms=state.last_received_at_server_ms,
            action=action,
        )

    def _timeout_command(
        self,
        participant_id: int,
        device_id: str,
        state: _DeviceState,
        transition_ms: int,
    ) -> IntegrityCommand:
        incident = self._incidents[self._incident_key(participant_id)]
        action: CommandAction = "audit"
        if not incident.action_applied:
            action = _REGISTRY_ACTIONS[self._definition.action]
            incident.action_applied = True
        return self._transition_command(
            participant_id=participant_id,
            device_id=device_id,
            incident_id=incident.incident_id,
            event_type="connectivity_timeout",
            phase="escalated",
            transition_at_server_ms=transition_ms,
            last_received_at_server_ms=state.last_received_at_server_ms,
            action=action,
        )

    def _transition_command(
        self,
        *,
        participant_id: int,
        device_id: str,
        incident_id: UUID,
        event_type: str,
        phase: str,
        transition_at_server_ms: int,
        last_received_at_server_ms: int,
        action: CommandAction,
    ) -> IntegrityCommand:
        metadata = {
            "timing_basis": "server_receipt",
            "last_received_at_server_ms": last_received_at_server_ms,
            "transition_at_server_ms": transition_at_server_ms,
        }
        self._registry.validate_payload(event_type, metadata)
        event_id = deterministic_uuid(
            self._context.run_id,
            "connectivity-event",
            participant_id,
            device_id,
            event_type,
            transition_at_server_ms,
        )
        return make_command(
            context=self._context,
            kind="record_event",
            participant_id=participant_id,
            device_id=device_id,
            incident_id=incident_id,
            event_id=event_id,
            phase=phase,
            event_type=event_type,
            action=action,
            client_occurred_at_ms=transition_at_server_ms,
            received_at_server_ms=transition_at_server_ms,
            evidence={},
            metadata=metadata,
        )

    def _incident_key(self, participant_id: int) -> tuple[int, str]:
        return (participant_id, self._definition.incident_family)
