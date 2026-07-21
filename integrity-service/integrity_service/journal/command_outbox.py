"""Fsynced JSON logs for deterministic commands and run-local timeline inputs."""

from __future__ import annotations

import hashlib
import json
import os
import threading
from collections.abc import Mapping
from pathlib import Path
from typing import Protocol
from uuid import UUID

from integrity_service.core.commands import IntegrityCommand
from integrity_service.core.records import AdmittedEventRecord
from integrity_service.core.timeline import (
    BatchReceiptEntry,
    SubmissionEntry,
    TimelineBaseline,
)


class DurableLogCorruption(ValueError):
    """A fully persisted record is malformed or non-canonical."""


class CommandConflict(ValueError):
    """A deterministic command ID was reused for different command bytes."""


class CommandBackend(Protocol):
    def send_commands(
        self, commands: tuple[dict[str, object], ...]
    ) -> dict[str, object]: ...


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    ).encode("utf-8")


def _encode_log_record(record: dict[str, object]) -> bytes:
    payload = _canonical_json(record)
    digest = hashlib.sha256(payload).hexdigest().encode("ascii")
    return f"{len(payload):08x} ".encode("ascii") + digest + b" " + payload + b"\n"


class DurableJsonLog:
    """Small append-only canonical JSON log with tail-only crash recovery."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self._records = list(self._recover())
        self._fd = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
        self._failed = False

    @property
    def records(self) -> tuple[dict[str, object], ...]:
        with self._lock:
            return tuple(json.loads(_canonical_json(item)) for item in self._records)

    def append(self, record: dict[str, object]) -> None:
        encoded = _encode_log_record(record)
        with self._lock:
            if self._failed:
                raise OSError("durable log requires recovery after append failure")
            remaining = memoryview(encoded)
            try:
                while remaining:
                    try:
                        written = os.write(self._fd, remaining)
                    except InterruptedError:
                        continue
                    if written <= 0:
                        raise OSError("durable log write made no progress")
                    remaining = remaining[written:]
                while True:
                    try:
                        os.fsync(self._fd)
                        break
                    except InterruptedError:
                        continue
            except BaseException:
                self._failed = True
                raise
            self._records.append(json.loads(_canonical_json(record)))

    def close(self) -> None:
        with self._lock:
            if self._fd < 0:
                return
            os.close(self._fd)
            self._fd = -1

    def _recover(self) -> tuple[dict[str, object], ...]:
        if not self.path.exists():
            return ()
        content = self.path.read_bytes()
        position = 0
        valid_end = 0
        recovered: list[dict[str, object]] = []
        while position < len(content):
            header_end = min(position + 8, len(content))
            header = content[position:header_end]
            if any(byte not in b"0123456789abcdef" for byte in header):
                raise DurableLogCorruption("invalid durable log length")
            if header_end < position + 8:
                self._truncate(valid_end)
                break
            if position + 8 == len(content):
                self._truncate(valid_end)
                break
            if content[position + 8 : position + 9] != b" ":
                raise DurableLogCorruption("invalid durable log separator")
            digest_end = min(position + 73, len(content))
            digest = content[position + 9 : digest_end]
            if any(byte not in b"0123456789abcdef" for byte in digest):
                raise DurableLogCorruption("invalid durable log digest")
            if digest_end < position + 73:
                self._truncate(valid_end)
                break
            if position + 73 == len(content):
                self._truncate(valid_end)
                break
            if content[position + 73 : position + 74] != b" ":
                raise DurableLogCorruption("invalid durable log separator")
            length = int(header, 16)
            payload_start = position + 74
            payload_end = payload_start + length
            record_end = payload_end + 1
            if record_end > len(content):
                if b"\n" in content[payload_start:]:
                    raise DurableLogCorruption("invalid partial durable log payload")
                self._truncate(valid_end)
                break
            if content[payload_end:record_end] != b"\n":
                raise DurableLogCorruption("invalid durable log newline")
            payload = content[payload_start:payload_end]
            if hashlib.sha256(payload).hexdigest().encode("ascii") != digest:
                raise DurableLogCorruption("durable log digest mismatch")
            try:
                decoded = json.loads(payload)
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                raise DurableLogCorruption("invalid durable log JSON") from error
            if not isinstance(decoded, dict) or _canonical_json(decoded) != payload:
                raise DurableLogCorruption("non-canonical durable log record")
            recovered.append(decoded)
            position = record_end
            valid_end = position
        return tuple(recovered)

    def _truncate(self, size: int) -> None:
        fd = os.open(self.path, os.O_RDWR)
        try:
            os.ftruncate(fd, size)
            os.fsync(fd)
        finally:
            os.close(fd)


def _command_json(command: object) -> dict[str, object]:
    if isinstance(command, IntegrityCommand):
        return command.to_json()
    if not isinstance(command, Mapping):
        raise TypeError("commands must be IntegrityCommand values or mappings")
    projected = json.loads(_canonical_json(command))
    if not isinstance(projected, dict):
        raise TypeError("command must be a JSON object")
    return projected


class CommandOutbox:
    """Durably deduplicate commands and checkpoint successful Backend delivery."""

    def __init__(self, root: Path) -> None:
        self._log = DurableJsonLog(root / "commands.log")
        self._lock = threading.RLock()
        self._commands: dict[str, dict[str, object]] = {}
        self._command_bytes: dict[str, bytes] = {}
        self._delivered: set[str] = set()
        self._responses: dict[str, dict[str, object]] = {}
        self._rebuild()

    @property
    def pending_commands(self) -> tuple[dict[str, object], ...]:
        with self._lock:
            return tuple(
                json.loads(_canonical_json(command))
                for command_id, command in self._commands.items()
                if command_id not in self._delivered
            )

    def append(self, commands: tuple[object, ...]) -> bool:
        if type(commands) is not tuple:
            raise TypeError("commands must be an immutable tuple")
        with self._lock:
            candidates: list[tuple[str, dict[str, object], bytes]] = []
            prospective = dict(self._command_bytes)
            for source in commands:
                command = _command_json(source)
                command_id = command.get("command_id")
                try:
                    canonical_id = str(UUID(str(command_id)))
                except (ValueError, TypeError) as error:
                    raise ValueError("command_id must be a UUID") from error
                if command_id != canonical_id:
                    raise ValueError("command_id must use canonical UUID text")
                encoded = _canonical_json(command)
                prior = prospective.get(canonical_id)
                if prior is not None:
                    if prior != encoded:
                        raise CommandConflict(canonical_id)
                    continue
                candidates.append((canonical_id, command, encoded))
                prospective[canonical_id] = encoded
            if not candidates:
                return False
            self._log.append(
                {
                    "kind": "commands",
                    "commands": [command for _, command, _ in candidates],
                }
            )
            for command_id, command, encoded in candidates:
                self._command_bytes[command_id] = encoded
                self._commands[command_id] = command
            return True

    def deliver_pending(self, backend: CommandBackend) -> dict[str, object]:
        with self._lock:
            pending = self.pending_commands
            if not pending:
                return {}
            response = backend.send_commands(pending)
            if not isinstance(response, dict):
                raise TypeError("Backend command response must be an object")
            command_ids = [str(command["command_id"]) for command in pending]
            self._log.append(
                {
                    "kind": "delivered",
                    "command_ids": command_ids,
                    "response": response,
                }
            )
            for command_id in command_ids:
                self._delivered.add(command_id)
                self._responses[command_id] = json.loads(_canonical_json(response))
            return response

    def delivery_response(self, command_id: str) -> dict[str, object] | None:
        with self._lock:
            response = self._responses.get(command_id)
            return None if response is None else json.loads(_canonical_json(response))

    def close(self) -> None:
        self._log.close()

    def _rebuild(self) -> None:
        for record in self._log.records:
            kind = record.get("kind")
            if kind == "commands":
                commands = record.get("commands")
                if not isinstance(commands, list):
                    raise DurableLogCorruption("command record is malformed")
                for source in commands:
                    command = _command_json(source)
                    command_id = str(command.get("command_id"))
                    try:
                        if str(UUID(command_id)) != command_id:
                            raise ValueError
                    except ValueError as error:
                        raise DurableLogCorruption("command ID is malformed") from error
                    encoded = _canonical_json(command)
                    prior = self._command_bytes.get(command_id)
                    if prior is not None and prior != encoded:
                        raise CommandConflict(command_id)
                    self._commands.setdefault(command_id, command)
                    self._command_bytes.setdefault(command_id, encoded)
            elif kind == "delivered":
                command_ids = record.get("command_ids")
                response = record.get("response")
                if not isinstance(command_ids, list) or not isinstance(response, dict):
                    raise DurableLogCorruption("delivery checkpoint is malformed")
                for command_id in command_ids:
                    if command_id not in self._commands:
                        raise DurableLogCorruption(
                            "delivery checkpoint references an unknown command"
                        )
                    self._delivered.add(str(command_id))
                    self._responses[str(command_id)] = response
            else:
                raise DurableLogCorruption("unknown command outbox record")


class TimelineJournal:
    """Durable total-order inputs consumed by DecisionTimeline live and on replay."""

    def __init__(self, root: Path) -> None:
        self._log = DurableJsonLog(root / "timeline.log")
        self._lock = threading.RLock()
        self._last_timeline_seq = 0
        self._last_server_ms = 0
        for record in self._log.records:
            server_ms = record.get("server_ms")
            if type(server_ms) is not int or server_ms < self._last_server_ms:
                raise DurableLogCorruption("timeline server time is invalid")
            self._last_server_ms = server_ms
            if record.get("kind") in ("batch_receipt", "submission"):
                timeline_seq = record.get("timeline_seq")
                if timeline_seq != self._last_timeline_seq + 1:
                    raise DurableLogCorruption("timeline sequence is not gap-free")
                self._last_timeline_seq = timeline_seq

    @property
    def records(self) -> tuple[dict[str, object], ...]:
        return self._log.records

    def ensure_baseline(self, baseline: TimelineBaseline) -> None:
        with self._lock:
            projected = baseline.to_json()
            records = self.records
            if not records:
                self._log.append(projected)
                self._last_server_ms = baseline.server_ms
                return
            if records[0] != projected:
                raise DurableLogCorruption("timeline baseline conflicts with bootstrap")

    def append_receipt(
        self,
        entry: BatchReceiptEntry,
        records: tuple[AdmittedEventRecord, ...],
        delayed_event_ids: frozenset[UUID] = frozenset(),
    ) -> None:
        with self._lock:
            projected = entry.to_json()
            projected["records"] = [record.to_json() for record in records]
            projected["delayed_event_ids"] = sorted(
                str(event_id) for event_id in delayed_event_ids
            )
            self._append_ordered(projected)

    def append_submission(self, entry: SubmissionEntry) -> None:
        with self._lock:
            self._append_ordered(entry.to_json())

    def append_advance(self, server_ms: int) -> None:
        with self._lock:
            if type(server_ms) is not int or server_ms < self.last_server_ms:
                raise ValueError("timeline advance cannot move backwards")
            self._log.append({"kind": "advance", "server_ms": server_ms})
            self._last_server_ms = server_ms

    def close(self) -> None:
        self._log.close()

    @property
    def last_timeline_seq(self) -> int:
        return self._last_timeline_seq

    @property
    def last_server_ms(self) -> int:
        return self._last_server_ms

    def _append_ordered(self, projected: dict[str, object]) -> None:
        if int(projected["timeline_seq"]) != self.last_timeline_seq + 1:
            raise ValueError("timeline_seq must be gap-free")
        if int(projected["server_ms"]) < self.last_server_ms:
            raise ValueError("timeline server time cannot move backwards")
        self._log.append(projected)
        self._last_timeline_seq = int(projected["timeline_seq"])
        self._last_server_ms = int(projected["server_ms"])
