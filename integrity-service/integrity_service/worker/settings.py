"""Validated Worker process settings and frozen Backend bootstrap contract."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping
from uuid import UUID

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from integrity_service.core.commands import FrozenDict, freeze_json
from integrity_service.worker.auth import load_public_key


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
    contest_id: UUID
    server_ms: int
    scheduled_end_ms: int
    active_participant_ids: tuple[int, ...]
    submitted_participant_ids: tuple[int, ...]
    policy_snapshot: Mapping[str, object]
    registry_snapshot: Mapping[str, object]
    backend_signing_public_key_b64: str
    archive_policy: Mapping[str, object]
    generation: int = 1
    previous_manifest: Mapping[str, object] | None = None
    backend_signing_public_key: Ed25519PublicKey = field(
        init=False, repr=False, compare=False
    )

    def __post_init__(self) -> None:
        if type(self.run_id) is not UUID or self.run_id.int == 0:
            raise ValueError("run_id must be a non-zero UUID")
        if type(self.contest_id) is not UUID or self.contest_id.int == 0:
            raise ValueError("contest_id must be a non-zero UUID")
        _server_ms(self.server_ms, "server_ms")
        _server_ms(self.scheduled_end_ms, "scheduled_end_ms")
        _participant_tuple(self.active_participant_ids, "active_participant_ids")
        _participant_tuple(self.submitted_participant_ids, "submitted_participant_ids")
        if not set(self.submitted_participant_ids).issubset(
            self.active_participant_ids
        ):
            raise ValueError("submitted participants must belong to the active snapshot")
        if not isinstance(self.policy_snapshot, Mapping):
            raise TypeError("policy_snapshot must be an object")
        if not isinstance(self.registry_snapshot, Mapping):
            raise TypeError("registry_snapshot must be an object")
        if type(self.backend_signing_public_key_b64) is not str or not (
            self.backend_signing_public_key_b64
        ):
            raise ValueError("backend signing public key is required")
        public_key = load_public_key(self.backend_signing_public_key_b64)
        object.__setattr__(self, "backend_signing_public_key", public_key)
        if not isinstance(self.archive_policy, Mapping):
            raise TypeError("archive_policy must be an object")
        _positive_int(self.generation, "generation")
        object.__setattr__(
            self, "policy_snapshot", freeze_json(self.policy_snapshot)
        )
        object.__setattr__(
            self, "registry_snapshot", freeze_json(self.registry_snapshot)
        )
        object.__setattr__(self, "archive_policy", freeze_json(self.archive_policy))
        previous = self._validate_previous_manifest(self.previous_manifest)
        object.__setattr__(self, "previous_manifest", previous)

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> "WorkerBootstrap":
        participants = payload.get("participants")
        if participants is not None:
            if not isinstance(participants, list):
                raise TypeError("participants must be a list")
            active = []
            submitted = []
            seen: set[int] = set()
            for item in participants:
                if not isinstance(item, Mapping) or set(item) != {
                    "participant_id",
                    "status",
                }:
                    raise TypeError("participant entries must contain id and status")
                participant_id = _positive_int(
                    item["participant_id"], "participant_id"
                )
                if participant_id in seen:
                    raise ValueError("participant entries must be unique")
                seen.add(participant_id)
                status = item["status"]
                if status not in ("active", "submitted"):
                    raise ValueError("participant status is not supported")
                active.append(participant_id)
                if status == "submitted":
                    submitted.append(participant_id)
            active.sort()
            submitted.sort()
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
            contest_id=UUID(str(payload["contest_id"])),
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
            previous_manifest=payload.get("previous_manifest"),
        )

    def _validate_previous_manifest(
        self, value: Mapping[str, object] | None
    ) -> FrozenDict | None:
        if self.generation == 1:
            if value is not None:
                raise ValueError("previous manifest is invalid for generation one")
            return None
        if not isinstance(value, Mapping) or set(value) != {
            "generation",
            "object_key",
            "sha256",
        }:
            raise ValueError("previous manifest identity is required")
        prior_generation = value.get("generation")
        expected_key = (
            f"runs/{self.run_id}/generation-{self.generation - 1}/manifest.json"
        )
        digest = value.get("sha256")
        if (
            prior_generation != self.generation - 1
            or value.get("object_key") != expected_key
            or type(digest) is not str
            or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
        ):
            raise ValueError("previous manifest identity conflicts with generation")
        frozen = freeze_json(value)
        assert isinstance(frozen, FrozenDict)
        return frozen


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
            run_id = UUID(
                os.environ.get("INTEGRITY_RUN_ID")
                or os.environ["QJUDGE_INTEGRITY_RUN_ID"]
            )
            backend_base_url = (
                os.environ.get("BACKEND_INTERNAL_URL")
                or os.environ["QJUDGE_BACKEND_URL"]
            )
        except (KeyError, ValueError) as error:
            raise RuntimeError("required Worker configuration is invalid") from error
        return cls(
            run_id=run_id,
            backend_base_url=backend_base_url.rstrip("/"),
            token_path=Path(
                os.environ.get("RUN_TOKEN_FILE")
                or os.environ.get("QJUDGE_RUN_TOKEN_PATH", "/run-secrets/token")
            ),
            data_root=Path(
                os.environ.get("RUN_DATA_DIR")
                or os.environ.get("QJUDGE_RUN_DATA", "/run-data")
            ),
        )

    def read_token(self) -> str:
        try:
            token = self.token_path.read_text(encoding="utf-8").strip()
        except OSError as error:
            raise RuntimeError("run credential is unavailable") from error
        if not token:
            raise RuntimeError("run credential is unavailable")
        return token
