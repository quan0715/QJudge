"""Rotating raw journal segments and a deterministic verified archive manifest."""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid5

from integrity_service.core.schemas import EventBatch
from integrity_service.journal.command_outbox import CommandOutbox, DurableJsonLog
from integrity_service.journal.encoding import encode_record
from integrity_service.journal.recovery import RecoveredRecord, recover_journal
from integrity_service.journal.writer import BatchIdentityConflict, JournalWriter
from integrity_service.worker.backend_client import BackendUnavailable


class ArchiveUploadFailed(RuntimeError):
    """A sealed segment or manifest could not be durably verified upstream."""


class ArchiveBackend(Protocol):
    def send_commands(
        self, commands: tuple[dict[str, object], ...]
    ) -> dict[str, object]: ...

    def upload_presigned(self, url: str, content: bytes, sha256: str) -> None: ...


@dataclass(frozen=True, slots=True)
class SealedSegment:
    index: int
    path: Path
    first_seq: int
    last_seq: int
    batch_count: int
    record_count: int


@dataclass(frozen=True, slots=True)
class ArchiveManifest:
    object_key: str
    sha256: str
    payload: dict[str, object]
    content: bytes


@dataclass(frozen=True, slots=True)
class ArchiveResult:
    archived: bool
    manifest_key: str
    manifest_sha256: str


class SegmentedJournal:
    """JournalWriter wrapper that preserves global batch identity across rotations."""

    def __init__(
        self,
        root: Path,
        *,
        started_at_ms: int,
        rotate_after_ms: int = 60_000,
        max_segment_bytes: int = 8 * 1024 * 1024,
        capacity_warning_bytes: int = 0,
    ) -> None:
        if rotate_after_ms < 1 or max_segment_bytes < 1:
            raise ValueError("journal rotation thresholds must be positive")
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._segment_started_at_ms = started_at_ms
        self._rotate_after_ms = rotate_after_ms
        self._max_segment_bytes = max_segment_bytes
        self._capacity_warning_bytes = capacity_warning_bytes
        self._healthy = True
        self._warnings: set[str] = set()
        self._batch_digests: dict[UUID, bytes] = {}
        self._batches: list[EventBatch] = []
        for segment in self._discover_sealed():
            for recovered in recover_journal(segment.path).records:
                self._index_recovered(recovered)
        active_recovery = recover_journal(root / "active.journal")
        for recovered in active_recovery.records:
            self._index_recovered(recovered)
        self._writer = JournalWriter(root)

    @property
    def active_path(self) -> Path:
        return self._writer.active_path

    @property
    def sealed_segments(self) -> tuple[SealedSegment, ...]:
        return self._discover_sealed()

    @property
    def healthy(self) -> bool:
        return self._healthy

    @property
    def warning_codes(self) -> frozenset[str]:
        return frozenset(self._warnings)

    @property
    def recovered_batches(self) -> tuple[EventBatch, ...]:
        return tuple(self._batches)

    def append_batch_once(self, batch: EventBatch) -> bool:
        with self._lock:
            encoded = encode_record(batch)
            digest = hashlib.sha256(encoded).digest()
            prior = self._batch_digests.get(batch.batch_id)
            if prior is not None:
                if prior != digest:
                    raise BatchIdentityConflict(str(batch.batch_id))
                return False
            try:
                appended = self._writer.append_batch_once(batch)
            except BaseException:
                self._healthy = False
                raise
            if appended:
                self._batch_digests[batch.batch_id] = digest
                self._batches.append(batch)
            if (
                self._capacity_warning_bytes > 0
                and self._local_bytes() >= self._capacity_warning_bytes
            ):
                self._warnings.add("journal_capacity_low")
            return appended

    def rotate_if_due(self, now_ms: int, *, force: bool = False) -> bool:
        with self._lock:
            try:
                active_size = self.active_path.stat().st_size
            except FileNotFoundError:
                active_size = 0
            if active_size == 0:
                return False
            due = (
                force
                or now_ms - self._segment_started_at_ms >= self._rotate_after_ms
                or active_size >= self._max_segment_bytes
            )
            if not due:
                return False
            self._writer.close()
            next_index = 1 + max(
                (segment.index for segment in self._discover_sealed()), default=0
            )
            target = self.root / f"segment-{next_index:08d}.journal"
            os.replace(self.root / "active.journal", target)
            self._fsync_directory(self.root)
            self._writer = JournalWriter(self.root)
            self._segment_started_at_ms = now_ms
            return True

    def close(self) -> None:
        self._writer.close()

    def _discover_sealed(self) -> tuple[SealedSegment, ...]:
        segments: list[SealedSegment] = []
        for path in sorted(self.root.glob("segment-*.journal")):
            try:
                index = int(path.stem.split("-")[1])
            except (IndexError, ValueError) as error:
                raise ValueError("invalid sealed segment name") from error
            recovered = recover_journal(path).records
            if not recovered:
                raise ValueError("sealed journal segment must not be empty")
            sequence_values = [
                record.seq
                for item in recovered
                for record in item.batch.records
            ]
            segments.append(
                SealedSegment(
                    index=index,
                    path=path,
                    first_seq=min(sequence_values),
                    last_seq=max(sequence_values),
                    batch_count=len(recovered),
                    record_count=len(sequence_values),
                )
            )
        return tuple(segments)

    def _index_recovered(self, recovered: RecoveredRecord) -> None:
        digest = hashlib.sha256(recovered.encoded).digest()
        prior = self._batch_digests.get(recovered.batch.batch_id)
        if prior is not None:
            raise ValueError("journal contains repeated batch_id across segments")
        self._batch_digests[recovered.batch.batch_id] = digest
        self._batches.append(recovered.batch)

    def _local_bytes(self) -> int:
        return sum(
            path.stat().st_size
            for path in self.root.iterdir()
            if path.is_file()
        )

    @staticmethod
    def _fsync_directory(path: Path) -> None:
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


class ArchiveManager:
    """Upload sealed journal bytes and publish a content-addressed manifest."""

    def __init__(
        self,
        *,
        root: Path,
        run_id: UUID,
        generation: int,
        journal: SegmentedJournal,
        outbox: CommandOutbox,
        backend: ArchiveBackend,
        snapshot_digests: dict[str, str],
        frozen_snapshots: dict[str, object] | None = None,
        previous_manifest_sha256: str | None = None,
    ) -> None:
        root.mkdir(parents=True, exist_ok=True)
        self.root = root
        self.run_id = run_id
        self.generation = generation
        self.journal = journal
        self.outbox = outbox
        self.backend = backend
        self.snapshot_digests = dict(snapshot_digests)
        self.frozen_snapshots = json.loads(
            json.dumps(
                {} if frozen_snapshots is None else frozen_snapshots,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
                allow_nan=False,
            )
        )
        self.previous_manifest_sha256 = previous_manifest_sha256
        self._state = DurableJsonLog(root / "archive-state.log")
        self._warnings: set[str] = set()

    @property
    def healthy(self) -> bool:
        return self.journal.healthy

    @property
    def warning_codes(self) -> frozenset[str]:
        return frozenset(self._warnings) | self.journal.warning_codes

    def rotate_due(self, now_ms: int) -> bool:
        return self.journal.rotate_if_due(now_ms)

    def upload_all_sealed(self) -> None:
        uploaded = self._uploaded_segments()
        previous_hash: str | None = None
        for segment in self.journal.sealed_segments:
            content = self._gzip_segment(segment)
            digest = hashlib.sha256(content).hexdigest()
            if segment.index in uploaded:
                if uploaded[segment.index]["sha256"] != digest:
                    raise ArchiveUploadFailed("archived segment digest conflict")
                previous_hash = digest
                continue
            object_key = self._segment_key(segment.index)
            command = self._archive_upload_command(
                object_key=object_key,
                sha256=digest,
                byte_length=len(content),
                content_type="application/gzip",
            )
            try:
                upload_url = self._request_upload(command, object_key)
                self.backend.upload_presigned(upload_url, content, digest)
            except (BackendUnavailable, OSError, ValueError) as error:
                self._warnings.add("archive_upload_failed")
                raise ArchiveUploadFailed("sealed archive upload failed") from error
            checkpoint = {
                "kind": "segment_uploaded",
                "index": segment.index,
                "object_key": object_key,
                "sha256": digest,
                "previous_sha256": previous_hash,
                "compressed_bytes": len(content),
                "first_seq": segment.first_seq,
                "last_seq": segment.last_seq,
                "batch_count": segment.batch_count,
                "record_count": segment.record_count,
            }
            self._state.append(checkpoint)
            uploaded[segment.index] = checkpoint
            previous_hash = digest
        self._warnings.discard("archive_upload_failed")

    def build_manifest(
        self, *, final_cursors: dict[str, int]
    ) -> ArchiveManifest:
        uploaded = self._uploaded_segments()
        segments = []
        for segment in self.journal.sealed_segments:
            if segment.index not in uploaded:
                raise ArchiveUploadFailed("not every sealed segment is verified")
            segments.append(
                {
                    key: value
                    for key, value in uploaded[segment.index].items()
                    if key != "kind"
                }
            )
        payload: dict[str, object] = {
            "schema_version": 1,
            "run_id": str(self.run_id),
            "generation": self.generation,
            "segments": segments,
            "final_device_cursors": dict(sorted(final_cursors.items())),
            "snapshot_digests": dict(sorted(self.snapshot_digests.items())),
            "frozen_snapshots": self.frozen_snapshots,
            "counts": {
                "segments": len(segments),
                "batches": sum(int(item["batch_count"]) for item in segments),
                "records": sum(int(item["record_count"]) for item in segments),
            },
            "previous_manifest_sha256": self.previous_manifest_sha256,
        }
        content = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        ).encode("utf-8")
        digest = hashlib.sha256(content).hexdigest()
        return ArchiveManifest(
            object_key=(
                f"runs/{self.run_id}/generation-{self.generation}/manifest.json"
            ),
            sha256=digest,
            payload=payload,
            content=content,
        )

    def upload_and_publish_manifest(
        self, manifest: ArchiveManifest
    ) -> ArchiveResult:
        upload = self._archive_upload_command(
            object_key=manifest.object_key,
            sha256=manifest.sha256,
            byte_length=len(manifest.content),
            content_type="application/json",
        )
        try:
            upload_url = self._request_upload(upload, manifest.object_key)
            self.backend.upload_presigned(
                upload_url, manifest.content, manifest.sha256
            )
            publish = self._publish_manifest_command(manifest)
            self.outbox.append((publish,))
            self.outbox.deliver_pending(self.backend)
        except (BackendUnavailable, OSError, ValueError) as error:
            self._warnings.add("archive_upload_failed")
            raise ArchiveUploadFailed("archive manifest publication failed") from error
        self._warnings.discard("archive_upload_failed")
        return ArchiveResult(True, manifest.object_key, manifest.sha256)

    def close(self) -> None:
        self._state.close()

    def _request_upload(
        self, command: dict[str, object], object_key: str
    ) -> str:
        command_id = str(command["command_id"])
        self.outbox.append((command,))
        self.outbox.deliver_pending(self.backend)
        response = self.outbox.delivery_response(command_id)
        if response is None:
            raise ValueError("archive upload response is missing")
        uploads = response.get("archive_uploads")
        if not isinstance(uploads, list):
            raise ValueError("archive upload response is malformed")
        for upload in uploads:
            if (
                isinstance(upload, dict)
                and upload.get("command_id") == command_id
                and upload.get("object_key") == object_key
                and isinstance(upload.get("upload_url"), str)
            ):
                return str(upload["upload_url"])
        raise ValueError("archive upload response does not match command")

    def _archive_upload_command(
        self,
        *,
        object_key: str,
        sha256: str,
        byte_length: int,
        content_type: str,
    ) -> dict[str, object]:
        command_id = uuid5(
            self.run_id,
            f"create-archive-upload:{self.generation}:{object_key}:{sha256}",
        )
        return {
            "command_id": str(command_id),
            "run_id": str(self.run_id),
            "kind": "create_archive_upload",
            "metadata": {
                "object_key": object_key,
                "sha256": sha256,
                "byte_length": byte_length,
                "content_type": content_type,
                "generation": self.generation,
            },
        }

    def _publish_manifest_command(
        self, manifest: ArchiveManifest
    ) -> dict[str, object]:
        command_id = uuid5(
            self.run_id,
            f"publish-archive-manifest:{self.generation}:{manifest.sha256}",
        )
        return {
            "command_id": str(command_id),
            "run_id": str(self.run_id),
            "kind": "publish_archive_manifest",
            "metadata": {
                "object_key": manifest.object_key,
                "sha256": manifest.sha256,
                "generation": self.generation,
            },
        }

    def _gzip_segment(self, segment: SealedSegment) -> bytes:
        compressed_path = self.root / f"segment-{segment.index:08d}.journal.gz"
        source = segment.path.read_bytes()
        content = gzip.compress(source, compresslevel=6, mtime=0)
        if compressed_path.exists():
            if compressed_path.read_bytes() != content:
                raise ArchiveUploadFailed("local compressed segment conflict")
            return content
        descriptor = os.open(
            compressed_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
        )
        try:
            remaining = memoryview(content)
            while remaining:
                written = os.write(descriptor, remaining)
                if written <= 0:
                    raise OSError("compressed segment write made no progress")
                remaining = remaining[written:]
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return content

    def _uploaded_segments(self) -> dict[int, dict[str, object]]:
        uploaded: dict[int, dict[str, object]] = {}
        for record in self._state.records:
            if record.get("kind") != "segment_uploaded":
                raise ValueError("unknown archive state record")
            uploaded[int(record["index"])] = record
        return uploaded

    def _segment_key(self, index: int) -> str:
        return (
            f"runs/{self.run_id}/generation-{self.generation}/segments/"
            f"{index:08d}.journal.gz"
        )
