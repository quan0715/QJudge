from __future__ import annotations

import base64
import binascii
import re
import time
import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import UUID

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.conf import settings

from apps.contests.models import ExamIntegrityRun


_SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")


class _HttpClient(Protocol):
    def post(self, url: str, **kwargs) -> httpx.Response: ...


class IntegrityWorkerError(RuntimeError):
    pass


def sign_resident_request(*, method: str, path: str, run_id: UUID,
                          revision: int, body: bytes, timestamp: int | None = None) -> dict[str, str]:
    """Shared signature contract for resident control, receipts and recovery."""
    timestamp = int(time.time()) if timestamp is None else timestamp
    key = load_integrity_worker_private_key(settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE)
    message = f"resident-v1\n{method}\n{path}\n{run_id}\n{revision}\n{timestamp}\n".encode("ascii") + body
    return {"X-QJudge-Protocol": "resident-v1", "X-QJudge-Run-Id": str(run_id),
            "X-QJudge-Revision": str(revision), "X-QJudge-Timestamp": str(timestamp),
            "X-QJudge-Signature": base64.b64encode(key.sign(message)).decode("ascii")}


class IntegrityWorkerUnavailable(IntegrityWorkerError):
    pass


class IntegrityWorkerProtocolError(IntegrityWorkerError):
    pass


class IntegrityWorkerRejected(IntegrityWorkerError):
    def __init__(self, status_code: int, payload: dict) -> None:
        super().__init__("integrity_worker_rejected")
        self.status_code = status_code
        self.payload = payload


def _strict_nonnegative_int(payload: Mapping, key: str) -> int:
    value = payload.get(key)
    if type(value) is not int or value < 0:
        raise IntegrityWorkerProtocolError("invalid Worker ACK")
    return value


def _strict_uuid_string(payload: Mapping, key: str) -> str:
    value = payload.get(key)
    if type(value) is not str:
        raise IntegrityWorkerProtocolError("invalid Worker ACK")
    try:
        return str(UUID(value))
    except (ValueError, AttributeError):
        raise IntegrityWorkerProtocolError("invalid Worker ACK") from None


def _validate_pending_command(value) -> dict:
    if type(value) is not dict:
        raise IntegrityWorkerProtocolError("invalid Worker ACK")
    expected_keys = {
        "command_id",
        "incident_id",
        "event_id",
        "sources",
        "start_at_ms",
        "end_at_ms",
    }
    if set(value) != expected_keys:
        raise IntegrityWorkerProtocolError("invalid Worker ACK")
    command = {
        "command_id": _strict_uuid_string(value, "command_id"),
        "incident_id": _strict_uuid_string(value, "incident_id"),
    }
    event_id = value.get("event_id")
    sources = value.get("sources")
    start_at_ms = value.get("start_at_ms")
    end_at_ms = value.get("end_at_ms")
    if (
        type(event_id) is not str
        or type(sources) is not list
        or any(type(source) is not str for source in sources)
        or any(source not in {"screen_share", "webcam"} for source in sources)
        or type(start_at_ms) is not int
        or type(end_at_ms) is not int
    ):
        raise IntegrityWorkerProtocolError("invalid Worker ACK")
    command.update(
        {
            "event_id": event_id,
            "sources": list(sources),
            "start_at_ms": start_at_ms,
            "end_at_ms": end_at_ms,
        }
    )
    return command


@dataclass(frozen=True)
class WorkerBatchAck:
    acked_through_seq: int
    pending_commands: tuple[dict, ...]
    release_evidence_before_ms: int

    @classmethod
    def model_validate(cls, payload) -> "WorkerBatchAck":
        if type(payload) is not dict or set(payload) != {
            "acked_through_seq",
            "pending_commands",
            "release_evidence_before_ms",
        }:
            raise IntegrityWorkerProtocolError("invalid Worker ACK")
        pending_commands = payload.get("pending_commands")
        if type(pending_commands) is not list:
            raise IntegrityWorkerProtocolError("invalid Worker ACK")
        return cls(
            acked_through_seq=_strict_nonnegative_int(
                payload,
                "acked_through_seq",
            ),
            pending_commands=tuple(
                _validate_pending_command(command)
                for command in pending_commands
            ),
            release_evidence_before_ms=_strict_nonnegative_int(
                payload,
                "release_evidence_before_ms",
            ),
        )

    def as_dict(self) -> dict:
        return {
            "acked_through_seq": self.acked_through_seq,
            "pending_commands": [
                dict(command) for command in self.pending_commands
            ],
            "release_evidence_before_ms": self.release_evidence_before_ms,
        }


@dataclass(frozen=True)
class WorkerStopResult:
    archived: bool
    manifest_key: str
    manifest_sha256: str

    @classmethod
    def model_validate(
        cls,
        payload,
        *,
        expected_manifest_key: str,
    ) -> "WorkerStopResult":
        if type(payload) is not dict or set(payload) != {
            "archived",
            "manifest_key",
            "manifest_sha256",
        }:
            raise IntegrityWorkerProtocolError("invalid Worker Stop response")
        archived = payload.get("archived")
        manifest_key = payload.get("manifest_key")
        manifest_sha256 = payload.get("manifest_sha256")
        if (
            archived is not True
            or type(manifest_key) is not str
            or manifest_key != expected_manifest_key
            or type(manifest_sha256) is not str
            or not _SHA256_RE.fullmatch(manifest_sha256)
        ):
            raise IntegrityWorkerProtocolError("invalid Worker Stop response")
        return cls(
            archived=True,
            manifest_key=manifest_key,
            manifest_sha256=manifest_sha256,
        )

    def as_dict(self) -> dict:
        return {
            "archived": self.archived,
            "manifest_key": self.manifest_key,
            "manifest_sha256": self.manifest_sha256,
        }


def load_integrity_worker_private_key(path: str) -> Ed25519PrivateKey:
    try:
        encoded = Path(path).read_bytes()
    except OSError:
        raise IntegrityWorkerUnavailable("Worker signing credential unavailable") from None

    candidates = [encoded]
    stripped = encoded.strip()
    if stripped != encoded:
        candidates.append(stripped)
    try:
        decoded = base64.b64decode(stripped, validate=True)
    except (ValueError, binascii.Error):
        decoded = b""
    if decoded:
        candidates.append(decoded)

    for candidate in candidates:
        try:
            if len(candidate) == 32:
                return Ed25519PrivateKey.from_private_bytes(candidate)
            if candidate.startswith(b"-----BEGIN"):
                private_key = serialization.load_pem_private_key(
                    candidate,
                    password=None,
                )
            else:
                private_key = serialization.load_der_private_key(
                    candidate,
                    password=None,
                )
        except (TypeError, ValueError):
            continue
        if isinstance(private_key, Ed25519PrivateKey):
            return private_key
    raise IntegrityWorkerUnavailable("Worker signing credential unavailable")


def _valid_rejection_payload(response: httpx.Response) -> dict:
    try:
        payload = response.json()
    except (ValueError, TypeError):
        raise IntegrityWorkerProtocolError("invalid Worker error response") from None
    if type(payload) is not dict or "acked_through_seq" in payload:
        raise IntegrityWorkerProtocolError("invalid Worker error response")
    return payload


@dataclass(frozen=True)
class IntegrityWorkerClient:
    private_key: Ed25519PrivateKey
    http: _HttpClient = httpx
    connect_timeout_seconds: float = 1.0
    read_timeout_seconds: float = 5.0

    def _signed_post(
        self,
        run: ExamIntegrityRun,
        *,
        path: str,
        body: bytes,
    ) -> httpx.Response:
        if run.execution_backend == "resident":
            from apps.contests.services.integrity_availability import record_outage, outage_handoff, acknowledge_outage
            started_ms = time.time_ns() // 1_000_000
            gap = outage_handoff(run.pk) if path.endswith("/batches") else None
            if gap:
                payload = json.loads(body)
                envelope = payload if "batch" in payload else {"batch": payload, "late_unverified": False}
                body = json.dumps({**envelope, "service_gap": gap}, separators=(",", ":"), sort_keys=True).encode()
            headers = sign_resident_request(method="POST", path=path, run_id=run.pk,
                revision=run.schedule_revision, body=body)
            try:
                response = self.http.post(settings.INTEGRITY_RESIDENT_URL.rstrip("/") + path,
                    content=body, headers={**headers, "Content-Type": "application/json"},
                    timeout=httpx.Timeout(5.0, connect=2.0))
            except httpx.TransportError:
                record_outage(run.pk, started_ms=started_ms)
                raise IntegrityWorkerUnavailable("Integrity resident unavailable") from None
            if response.status_code in {404, 429, 502, 503, 504, 507}:
                record_outage(run.pk, started_ms=started_ms)
                raise IntegrityWorkerUnavailable("Integrity resident unavailable")
            if response.status_code == 200 and response.headers.get("X-QJudge-Protocol") != "resident-v1":
                raise IntegrityWorkerProtocolError("resident capability not confirmed")
            if gap and response.status_code == 200:
                if response.headers.get("X-QJudge-Gap-Generation") != str(gap["generation"]):
                    raise IntegrityWorkerProtocolError("resident gap handoff not acknowledged")
                acknowledge_outage(run.pk, gap["generation"])
            return response
        timestamp = str(int(time.time()))
        message = (
            str(run.id).encode("ascii")
            + b"\n"
            + timestamp.encode("ascii")
            + b"\n"
            + body
        )
        signature = base64.b64encode(
            self.private_key.sign(message)
        ).decode("ascii")
        try:
            response = self.http.post(
                f"{run.worker_url.rstrip('/')}{path}",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-QJudge-Run-Id": str(run.id),
                    "X-QJudge-Timestamp": timestamp,
                    "X-QJudge-Signature": signature,
                },
                timeout=httpx.Timeout(
                    self.read_timeout_seconds,
                    connect=self.connect_timeout_seconds,
                ),
            )
        except (httpx.TimeoutException, httpx.ConnectError):
            raise IntegrityWorkerUnavailable("Integrity Worker unavailable") from None
        return response

    @staticmethod
    def _validate_status(
        response: httpx.Response,
        *,
        rejection_statuses: frozenset[int],
    ) -> None:
        if response.status_code in {502, 503, 504}:
            raise IntegrityWorkerUnavailable("Integrity Worker unavailable")
        if response.status_code in rejection_statuses:
            raise IntegrityWorkerRejected(
                response.status_code,
                _valid_rejection_payload(response),
            )
        if response.status_code != 200:
            raise IntegrityWorkerProtocolError("unexpected Worker response")

    def post_batch(
        self,
        run: ExamIntegrityRun,
        body: bytes,
    ) -> WorkerBatchAck:
        response = self._signed_post(
            run,
            path=f"/v1/runs/{run.id}/batches",
            body=body,
        )
        self._validate_status(
            response,
            rejection_statuses=frozenset({409, 422}),
        )

        try:
            payload = response.json()
        except (ValueError, TypeError):
            raise IntegrityWorkerProtocolError("invalid Worker ACK") from None
        return WorkerBatchAck.model_validate(payload)

    def student_progress(self, run, *, participant_id, device_id):
        scope = {"participant_id": participant_id, "device_id": device_id}
        response = self._signed_post(run, path=f"/v1/runs/{run.pk}/progress",
            body=json.dumps(scope, separators=(",", ":")).encode())
        self._validate_status(response, rejection_statuses=frozenset({409, 422}))
        try:
            value = response.json()
        except ValueError:
            raise IntegrityWorkerProtocolError("invalid progress") from None
        if (type(value) is not dict or set(value) != {*scope, "received_seq", "processed_seq", "commands_drained"}
                or any(value.get(key) != val for key, val in scope.items())
                or type(value.get("commands_drained")) is not bool):
            raise IntegrityWorkerProtocolError("invalid progress scope")
        received = _strict_nonnegative_int(value, "received_seq")
        processed = _strict_nonnegative_int(value, "processed_seq")
        if processed > received:
            raise IntegrityWorkerProtocolError("decision cursor exceeds receipt")
        return value

    def request_stop(self, run: ExamIntegrityRun) -> dict:
        response = self._signed_post(
            run,
            path=f"/v1/runs/{run.id}/control/stop",
            body=b"",
        )
        self._validate_status(
            response,
            rejection_statuses=frozenset({409, 422, 507}),
        )
        try:
            payload = response.json()
        except (ValueError, TypeError):
            raise IntegrityWorkerProtocolError(
                "invalid Worker Stop response"
            ) from None
        generation = max(1, run.archive_generation)
        expected_manifest_key = (
            f"runs/{run.id}/generation-{generation}/manifest.json"
        )
        return WorkerStopResult.model_validate(
            payload,
            expected_manifest_key=expected_manifest_key,
        ).as_dict()


def build_integrity_worker_client() -> IntegrityWorkerClient:
    return IntegrityWorkerClient(
        private_key=load_integrity_worker_private_key(
            settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE
        ),
        connect_timeout_seconds=settings.INTEGRITY_WORKER_CONNECT_TIMEOUT_SECONDS,
        read_timeout_seconds=settings.INTEGRITY_WORKER_READ_TIMEOUT_SECONDS,
    )
