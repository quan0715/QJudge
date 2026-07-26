"""Deterministic scheduled-end submission commands."""

from __future__ import annotations

from integrity_service.core.commands import (
    EngineContext,
    IntegrityCommand,
    deterministic_uuid,
    make_command,
)


class DeadlineScheduler:
    def __init__(
        self,
        scheduled_end_ms: int,
        context: EngineContext,
    ):
        if scheduled_end_ms < 0:
            raise ValueError("scheduled_end_ms must not be negative")
        self.scheduled_end_ms = scheduled_end_ms
        self._context = context
        self._emitted_participant_ids: set[int] = set()

    def tick(
        self, now_ms: int, active_participant_ids: set[int]
    ) -> tuple[IntegrityCommand, ...]:
        if now_ms < self.scheduled_end_ms:
            return ()
        commands = []
        for participant_id in sorted(active_participant_ids):
            if participant_id in self._emitted_participant_ids:
                continue
            event_id = deterministic_uuid(
                self._context.run_id,
                "scheduled-end",
                participant_id,
                self.scheduled_end_ms,
            )
            commands.append(
                make_command(
                    context=self._context,
                    kind="auto_submit",
                    participant_id=participant_id,
                    device_id="scheduler",
                    incident_id=None,
                    event_id=event_id,
                    phase="auto_submit",
                    event_type="scheduled_end",
                    action="submit",
                    client_occurred_at_ms=self.scheduled_end_ms,
                    received_at_server_ms=self.scheduled_end_ms,
                    metadata={"scheduled_end_ms": self.scheduled_end_ms},
                )
            )
            self._emitted_participant_ids.add(participant_id)
        return tuple(commands)
