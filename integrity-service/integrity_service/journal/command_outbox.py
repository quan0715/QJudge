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
    TimelineBaseline,
)
from integrity_service.journal.durability import (
    ensure_durable_directory,
    open_durable_file,
)


class DurableLogCorruption(ValueError):
    """A fully persisted record is malformed or non-canonical."""


class CommandConflict(ValueError):
    """A deterministic command ID was reused for different command bytes."""


class CommandDeliveryProtocolError(ValueError):
    """A Backend 2xx response did not prove the exact command receipt succeeded."""


class CommandBackend(Protocol):
    def send_commands(
        self, commands: tuple[dict[str, object], ...]
    ) -> dict[str, object]: ...


MAX_COMMANDS_PER_DELIVERY = 100


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
        ensure_durable_directory(path.parent)
        self.path = path
        self._lock = threading.RLock()
        self._records = list(self._recover())
        self._fd = open_durable_file(
            path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600
        )
        try:
            # Complete recovered frames may only be survivors in the page cache
            # after an earlier failed fsync. Do not publish them as durable yet.
            while True:
                try:
                    os.fsync(self._fd)
                    break
                except InterruptedError:
                    continue
        except BaseException:
            os.close(self._fd)
            self._fd = -1
            raise
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


def _validate_delivery_response(
    response: object,
    commands: tuple[dict[str, object], ...],
) -> dict[str, object]:
    if not isinstance(response, dict) or set(response) != {
        "accepted_command_ids",
        "archive_uploads",
    }:
        raise CommandDeliveryProtocolError("command response schema is invalid")
    accepted = response.get("accepted_command_ids")
    uploads = response.get("archive_uploads")
    if not isinstance(accepted, list) or not all(
        type(command_id) is str for command_id in accepted
    ):
        raise CommandDeliveryProtocolError("command response accepted IDs are invalid")
    if len(accepted) != len(set(accepted)):
        raise CommandDeliveryProtocolError("command response repeats an accepted ID")
    expected_ids = tuple(str(command["command_id"]) for command in commands)
    if len(accepted) != len(expected_ids) or set(accepted) != set(expected_ids):
        raise CommandDeliveryProtocolError("command response does not accept the receipt")
    if not isinstance(uploads, list):
        raise CommandDeliveryProtocolError("command response archive uploads are invalid")

    expected_uploads = {
        str(command["command_id"]): command
        for command in commands
        if command.get("kind") == "create_archive_upload"
    }
    seen_uploads: set[str] = set()
    for upload in uploads:
        if not isinstance(upload, dict) or set(upload) != {
            "command_id",
            "object_key",
            "upload_url",
            "checksum_sha256",
            "checksum_enforced",
        }:
            raise CommandDeliveryProtocolError(
                "command response archive upload schema is invalid"
            )
        command_id = upload.get("command_id")
        if type(command_id) is not str or command_id in seen_uploads:
            raise CommandDeliveryProtocolError(
                "command response archive upload ID is invalid"
            )
        try:
            command = expected_uploads[command_id]
        except KeyError as error:
            raise CommandDeliveryProtocolError(
                "command response references an unknown archive upload"
            ) from error
        metadata = command.get("metadata")
        if not isinstance(metadata, dict):
            raise CommandDeliveryProtocolError("archive command metadata is invalid")
        if (
            upload.get("object_key") != metadata.get("object_key")
            or upload.get("checksum_sha256") != metadata.get("sha256")
            or upload.get("checksum_enforced") is not True
            or type(upload.get("upload_url")) is not str
            or not upload.get("upload_url")
        ):
            raise CommandDeliveryProtocolError(
                "command response checksum enforcement is invalid"
            )
        seen_uploads.add(command_id)
    if seen_uploads != set(expected_uploads):
        raise CommandDeliveryProtocolError(
            "command response omits an archive upload result"
        )
    return json.loads(_canonical_json(response))


class CommandOutbox:
    """Durably deduplicate commands and checkpoint successful Backend delivery."""

    def __init__(self, root: Path) -> None:
        self._log = DurableJsonLog(root / "commands.log")
        self._lock = threading.RLock()
        self._delivery_lock = threading.Lock()
        self._commands: dict[str, dict[str, object]] = {}
        self._command_bytes: dict[str, bytes] = {}
        self._delivered: set[str] = set()
        self._responses: dict[str, dict[str, object]] = {}
        try:
            self._rebuild()
        except BaseException:
            self._log.close()
            raise

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

    def deliver_pending(self, backend: CommandBackend, *, max_batches: int | None = None) -> dict[str, object]:
        # Serialize deliveries, never appenders: network I/O must not transitively
        # hold a runtime receipt lock through process_pending -> outbox.append.
        with self._delivery_lock:
            delivered_ids: list[object] = []
            archive_uploads: list[object] = []
            batches = 0
            while pending := self.pending_commands[:MAX_COMMANDS_PER_DELIVERY]:
                if max_batches is not None and batches >= max_batches:
                    break
                response = backend.send_commands(pending)
                command_ids = [str(command["command_id"]) for command in pending]
                validated_response = _validate_delivery_response(response, pending)
                with self._lock:
                    self._log.append(
                        {
                            "kind": "delivered",
                            "command_ids": command_ids,
                            "response": validated_response,
                        }
                    )
                    for command_id in command_ids:
                        self._delivered.add(command_id)
                        self._responses[command_id] = json.loads(
                            _canonical_json(validated_response)
                        )
                batches += 1
                delivered_ids.extend(validated_response["accepted_command_ids"])
                archive_uploads.extend(validated_response["archive_uploads"])
            if not delivered_ids:
                return {}
            return json.loads(
                _canonical_json(
                    {
                        "accepted_command_ids": delivered_ids,
                        "archive_uploads": archive_uploads,
                    }
                )
            )

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
                if len(command_ids) != len(set(command_ids)):
                    raise DurableLogCorruption("delivery checkpoint repeats a command")
                commands = []
                for command_id in command_ids:
                    if command_id not in self._commands:
                        raise DurableLogCorruption(
                            "delivery checkpoint references an unknown command"
                        )
                    if command_id in self._delivered:
                        raise DurableLogCorruption(
                            "delivery checkpoint repeats a delivered command"
                        )
                    commands.append(self._commands[str(command_id)])
                try:
                    validated = _validate_delivery_response(response, tuple(commands))
                except CommandDeliveryProtocolError as error:
                    raise DurableLogCorruption(
                        "delivery checkpoint response is malformed"
                    ) from error
                for command_id in command_ids:
                    self._delivered.add(str(command_id))
                    self._responses[str(command_id)] = validated
            else:
                raise DurableLogCorruption("unknown command outbox record")


class TimelineJournal:
    """Durable total-order inputs consumed by DecisionTimeline live and on replay."""

    def __init__(self, root: Path) -> None:
        self._log = DurableJsonLog(root / "timeline.log")
        self._receipt_context_log: DurableJsonLog | None = None
        self._lock = threading.RLock()
        self._last_timeline_seq = 0
        self._last_server_ms = 0
        try:
            self._receipt_context_log = DurableJsonLog(
                root / "batch-receipt-context.log"
            )
            self._receipt_contexts = self._load_receipt_contexts()
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
        except BaseException:
            if self._receipt_context_log is not None:
                self._receipt_context_log.close()
            self._log.close()
            raise

    @property
    def records(self) -> tuple[dict[str, object], ...]:
        return self._log.records

    @property
    def receipt_contexts(self) -> tuple[dict[str, object], ...]:
        return tuple(self._receipt_contexts.values())

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

    def append_receipt_context(self, entry: BatchReceiptEntry) -> None:
        """Persist receipt authority after raw evidence and before any dependency."""
        with self._lock:
            projected = entry.to_json()
            projected["kind"] = "batch_receipt_context"
            batch_id = str(entry.batch_id)
            prior = self._receipt_contexts.get(batch_id)
            if prior is not None:
                if prior != projected:
                    raise DurableLogCorruption("batch receipt context conflicts")
                return
            if self._receipt_context_log is None:
                raise OSError("batch receipt context log is closed")
            self._receipt_context_log.append(projected)
            self._receipt_contexts[batch_id] = projected

    def append_advance(self, server_ms: int) -> None:
        with self._lock:
            if type(server_ms) is not int or server_ms < self.last_server_ms:
                raise ValueError("timeline advance cannot move backwards")
            self._log.append({"kind": "advance", "server_ms": server_ms})
            self._last_server_ms = server_ms

    def close(self) -> None:
        try:
            self._log.close()
        finally:
            if self._receipt_context_log is not None:
                self._receipt_context_log.close()
                self._receipt_context_log = None

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

    def _load_receipt_contexts(self) -> dict[str, dict[str, object]]:
        if self._receipt_context_log is None:
            raise RuntimeError("batch receipt context log is not initialized")
        contexts: dict[str, dict[str, object]] = {}
        expected_keys = {
            "kind",
            "timeline_seq",
            "server_ms",
            "batch_id",
            "participant_id",
            "device_id",
        }
        for projected in self._receipt_context_log.records:
            if set(projected) != expected_keys or projected.get("kind") != (
                "batch_receipt_context"
            ):
                raise DurableLogCorruption("batch receipt context is malformed")
            try:
                entry = BatchReceiptEntry(
                    timeline_seq=projected["timeline_seq"],
                    server_ms=projected["server_ms"],
                    batch_id=UUID(str(projected["batch_id"])),
                    participant_id=projected["participant_id"],
                    device_id=projected["device_id"],
                )
            except (TypeError, ValueError) as error:
                raise DurableLogCorruption(
                    "batch receipt context is malformed"
                ) from error
            canonical = entry.to_json()
            canonical["kind"] = "batch_receipt_context"
            if projected != canonical:
                raise DurableLogCorruption("batch receipt context is noncanonical")
            batch_id = str(entry.batch_id)
            if batch_id in contexts:
                raise DurableLogCorruption("batch receipt context is duplicated")
            contexts[batch_id] = projected
        return contexts
