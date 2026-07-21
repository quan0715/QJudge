"""Validated Worker process settings and frozen Backend bootstrap contract."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping
from uuid import UUID


def _positive_int(value: object, name: str) -> int:
    if type(value) is not int or value < 1:
        raise ValueError(f"{name} must be a positive integer")
    return value


def _server_ms(value: object, name: str) -> int:
    if type(value) is not int or value < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return value


def _participant_tuple(value: object, name: str) -> tuple[int, ...]:
    if not isinstance(value, (list, tuple)):
        raise TypeError(f"{name} must be a list or tuple")
    result = tuple(_positive_int(item, name) for item in value)
    if result != tuple(sorted(set(result))):
        raise ValueError(f"{name} must be sorted and unique")
    return result


@dataclass(frozen=True, slots=True)
class WorkerBootstrap:
    run_id: UUID
    contest_id: int
    server_ms: int
    scheduled_end_ms: int
    active_participant_ids: tuple[int, ...]
    submitted_participant_ids: tuple[int, ...]
    policy_snapshot: dict[str, object]
    registry_snapshot: dict[str, object]
    backend_signing_public_key_b64: str
    archive_policy: dict[str, object]
    generation: int = 1

    def __post_init__(self) -> None:
        if type(self.run_id) is not UUID or self.run_id.int == 0:
            raise ValueError("run_id must be a non-zero UUID")
        _positive_int(self.contest_id, "contest_id")
        _server_ms(self.server_ms, "server_ms")
        _server_ms(self.scheduled_end_ms, "scheduled_end_ms")
        _participant_tuple(self.active_participant_ids, "active_participant_ids")
        _participant_tuple(self.submitted_participant_ids, "submitted_participant_ids")
        if not set(self.submitted_participant_ids).issubset(
            self.active_participant_ids
        ):
            raise ValueError("submitted participants must belong to the active snapshot")
        if type(self.policy_snapshot) is not dict:
            raise TypeError("policy_snapshot must be an object")
        if type(self.registry_snapshot) is not dict:
            raise TypeError("registry_snapshot must be an object")
        if type(self.backend_signing_public_key_b64) is not str or not (
            self.backend_signing_public_key_b64
        ):
            raise ValueError("backend signing public key is required")
        if type(self.archive_policy) is not dict:
            raise TypeError("archive_policy must be an object")
        _positive_int(self.generation, "generation")

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> "WorkerBootstrap":
        participants = payload.get("participants")
        if participants is not None:
            if not isinstance(participants, list):
                raise TypeError("participants must be a list")
            active = sorted(
                _positive_int(item["participant_id"], "participant_id")
                for item in participants
                if isinstance(item, Mapping) and item.get("status") == "active"
            )
            submitted = sorted(
                _positive_int(item["participant_id"], "participant_id")
                for item in participants
                if isinstance(item, Mapping) and item.get("status") == "submitted"
            )
            active = sorted(set(active + submitted))
        else:
            active = list(
                _participant_tuple(
                    payload.get("active_participant_ids"),
                    "active_participant_ids",
                )
            )
            submitted = list(
                _participant_tuple(
                    payload.get("submitted_participant_ids", []),
                    "submitted_participant_ids",
                )
            )
        return cls(
            run_id=UUID(str(payload["run_id"])),
            contest_id=_positive_int(payload["contest_id"], "contest_id"),
            server_ms=_server_ms(payload["server_ms"], "server_ms"),
            scheduled_end_ms=_server_ms(
                payload["scheduled_end_ms"], "scheduled_end_ms"
            ),
            active_participant_ids=tuple(active),
            submitted_participant_ids=tuple(submitted),
            policy_snapshot=dict(payload["policy_snapshot"]),
            registry_snapshot=dict(payload["registry_snapshot"]),
            backend_signing_public_key_b64=str(
                payload["backend_signing_public_key_b64"]
            ),
            archive_policy=dict(payload["archive_policy"]),
            generation=_positive_int(payload.get("generation", 1), "generation"),
        )


@dataclass(frozen=True, slots=True)
class WorkerSettings:
    run_id: UUID
    backend_base_url: str
    token_path: Path
    data_root: Path
    connect_timeout_seconds: float = 2.0
    request_timeout_seconds: float = 5.0
    retry_attempts: int = 3

    @classmethod
    def from_environment(cls) -> "WorkerSettings":
        try:
            run_id = UUID(os.environ["QJUDGE_INTEGRITY_RUN_ID"])
            backend_base_url = os.environ["QJUDGE_BACKEND_URL"]
        except (KeyError, ValueError) as error:
            raise RuntimeError("required Worker configuration is invalid") from error
        return cls(
            run_id=run_id,
            backend_base_url=backend_base_url.rstrip("/"),
            token_path=Path(
                os.environ.get("QJUDGE_RUN_TOKEN_PATH", "/run-secrets/token")
            ),
            data_root=Path(os.environ.get("QJUDGE_RUN_DATA", "/run-data")),
        )

    def read_token(self) -> str:
        try:
            token = self.token_path.read_text(encoding="utf-8").strip()
        except OSError as error:
            raise RuntimeError("run credential is unavailable") from error
        if not token:
            raise RuntimeError("run credential is unavailable")
        return token
