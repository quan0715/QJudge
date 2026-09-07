"""Backend-authoritative resident control contract."""
from dataclasses import dataclass
from collections.abc import Mapping

from integrity_service.core.commands import json_projection
from integrity_service.worker.settings import WorkerBootstrap

PROTOCOL = "resident-v1"


@dataclass(frozen=True)
class RunDescriptor:
    bootstrap: WorkerBootstrap
    schedule_revision: int
    scheduled_start_ms: int
    scheduled_end_ms: int
    accept_until_ms: int
    session_state: str

    def __post_init__(self):
        for name in ("schedule_revision", "scheduled_start_ms", "scheduled_end_ms", "accept_until_ms"):
            value = getattr(self, name)
            if type(value) is not int or value < 0:
                raise ValueError(f"invalid {name}")
        if self.schedule_revision < 1 or not self.scheduled_start_ms <= self.scheduled_end_ms <= self.accept_until_ms:
            raise ValueError("invalid resident schedule")
        if self.session_state not in {"prepared", "active", "draining", "archived", "closed"}:
            raise ValueError("invalid resident session state")

    def to_payload(self):
        b = self.bootstrap
        return {"protocol": PROTOCOL, "bootstrap": {
            "run_id": str(b.run_id), "contest_id": str(b.contest_id),
            "server_ms": b.server_ms, "scheduled_end_ms": b.scheduled_end_ms,
            "active_participant_ids": list(b.active_participant_ids),
            "policy_snapshot": json_projection(b.policy_snapshot),
            "registry_snapshot": json_projection(b.registry_snapshot),
            "backend_signing_public_key_b64": b.backend_signing_public_key_b64,
            "archive_policy": json_projection(b.archive_policy),
            "generation": b.generation, "previous_manifest": json_projection(b.previous_manifest),
        }, **{name: getattr(self, name) for name in ("schedule_revision", "scheduled_start_ms", "scheduled_end_ms", "accept_until_ms", "session_state")}}

    @classmethod
    def from_payload(cls, payload):
        if not isinstance(payload, Mapping) or payload.get("protocol") != PROTOCOL:
            raise ValueError("explicit resident protocol required")
        return cls(WorkerBootstrap.from_payload(payload["bootstrap"]), **{
            name: payload[name] for name in ("schedule_revision", "scheduled_start_ms", "scheduled_end_ms", "accept_until_ms", "session_state")
        })

    def immutable_identity(self):
        payload = self.to_payload()["bootstrap"]
        for field in ("server_ms", "scheduled_end_ms", "active_participant_ids", "backend_signing_public_key_b64"):
            payload.pop(field)
        return payload

    def schedule(self):
        return self.scheduled_start_ms, self.scheduled_end_ms, self.accept_until_ms
