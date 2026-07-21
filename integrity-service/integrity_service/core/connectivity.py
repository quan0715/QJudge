"""Server-receipt-time-only connectivity transition monitor."""

from __future__ import annotations

from dataclasses import dataclass

from integrity_service.core.commands import (
    CommandAction,
    EngineContext,
    IntegrityCommand,
    deterministic_uuid,
    make_command,
)
from integrity_service.core.registry import Registry


@dataclass(slots=True)
class _DeviceState:
    last_received_at_server_ms: int
    suspect_sent: bool = False
    timeout_sent: bool = False


class ConnectivityMonitor:
    def __init__(self, policy: dict[str, object], registry: Registry, context: EngineContext):
        suspect_after_ms = policy.get("suspect_after_ms")
        disconnected_after_ms = policy.get("disconnected_after_ms")
        if type(suspect_after_ms) is not int or suspect_after_ms < 0:
            raise ValueError("suspect_after_ms must be a non-negative integer")
        if type(disconnected_after_ms) is not int or disconnected_after_ms < suspect_after_ms:
            raise ValueError("disconnected_after_ms must be an integer at least suspect_after_ms")
        self._suspect_after_ms = suspect_after_ms
        self._disconnected_after_ms = disconnected_after_ms
        self._registry = registry
        self._context = context
        self._devices: dict[tuple[int, str], _DeviceState] = {}

    def observe(
        self, *, participant_id: int, device_id: str, server_ms: int
    ) -> tuple[IntegrityCommand, ...]:
        key = (participant_id, device_id)
        previous = self._devices.get(key)
        restored = previous is not None and (previous.suspect_sent or previous.timeout_sent)
        self._devices[key] = _DeviceState(last_received_at_server_ms=server_ms)
        if not restored:
            return ()
        return (
            self._transition_command(
                participant_id=participant_id,
                device_id=device_id,
                event_type="connectivity_restored",
                phase="restored",
                transition_at_server_ms=server_ms,
                last_received_at_server_ms=previous.last_received_at_server_ms,
                action="audit",
            ),
        )

    def tick(self, now_server_ms: int) -> tuple[IntegrityCommand, ...]:
        commands: list[IntegrityCommand] = []
        for (participant_id, device_id), state in sorted(self._devices.items()):
            suspect_at = state.last_received_at_server_ms + self._suspect_after_ms
            timeout_at = state.last_received_at_server_ms + self._disconnected_after_ms
            if not state.suspect_sent and now_server_ms >= suspect_at:
                state.suspect_sent = True
                commands.append(
                    self._transition_command(
                        participant_id=participant_id,
                        device_id=device_id,
                        event_type="connectivity_suspect",
                        phase="triggered",
                        transition_at_server_ms=suspect_at,
                        last_received_at_server_ms=state.last_received_at_server_ms,
                        action="record",
                    )
                )
            if not state.timeout_sent and now_server_ms >= timeout_at:
                state.timeout_sent = True
                definition, phase = self._registry.resolve("heartbeat_timeout")
                assert phase == "escalated"
                action = "record" if definition.action == "record_event" else definition.action
                commands.append(
                    self._transition_command(
                        participant_id=participant_id,
                        device_id=device_id,
                        event_type="heartbeat_timeout",
                        phase="escalated",
                        transition_at_server_ms=timeout_at,
                        last_received_at_server_ms=state.last_received_at_server_ms,
                        action=action,  # type: ignore[arg-type]
                    )
                )
        return tuple(commands)

    def _transition_command(
        self,
        *,
        participant_id: int,
        device_id: str,
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
            incident_id=deterministic_uuid(
                self._context.run_id,
                "connectivity-incident",
                participant_id,
                device_id,
                last_received_at_server_ms,
            ),
            event_id=event_id,
            phase=phase,
            event_type=event_type,
            action=action,
            client_occurred_at_ms=transition_at_server_ms,
            received_at_server_ms=transition_at_server_ms,
            evidence={},
            metadata=metadata,
        )
