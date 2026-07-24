"""Rotating raw journal segments and a deterministic verified archive manifest."""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid5

from integrity_service.core.schemas import EventBatch
from integrity_service.core.commands import json_projection, freeze_json
from integrity_service.journal.command_outbox import (
    CommandDeliveryProtocolError,
    CommandOutbox,
    DurableJsonLog,
    DurableLogCorruption,
)
from integrity_service.journal.durability import (
    durable_replace,
    ensure_durable_directory,
    open_durable_file,
)
from integrity_service.journal.encoding import encode_record
from integrity_service.journal.recovery import (
    JournalCorruption,
    RecoveredRecord,
    read_sealed_journal,
    recover_journal,
)
from integrity_service.journal.writer import BatchIdentityConflict, JournalWriter
from integrity_service.worker.backend_client import (
    BackendDeliveryUncertain,
    BackendProtocolError,
    BackendUnavailable,
)


class ArchiveUploadFailed(RuntimeError):
    """A sealed segment or manifest could not be durably verified upstream."""


class ArchiveRetryableFailure(ArchiveUploadFailed):
    """An upstream transient/uncertain result may be retried with identical bytes."""


class ArchiveFatalFailure(ArchiveUploadFailed):
    """Local durability, catalog, or protocol validation failed closed."""


class ArchiveBackend(Protocol):
    def send_commands(
        self, commands: tuple[dict[str, object], ...]
    ) -> dict[str, object]: ...

    def upload_presigned(
        self,
        url: str,
        content: bytes,
        sha256: str,
        content_type: str,
    ) -> None: ...


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    ).encode("utf-8")


@dataclass(frozen=True, slots=True)
class SealedSegment:
    index: int
    path: Path
    first_seq: int
    last_seq: int
    batch_count: int
    record_count: int
    raw_sha256: str
    previous_raw_sha256: str | None


def segment_to_catalog(segment: SealedSegment) -> dict[str, object]:
    return {
        "kind": "segment_sealed",
        "index": segment.index,
        "file_name": segment.path.name,
        "raw_sha256": segment.raw_sha256,
        "previous_raw_sha256": segment.previous_raw_sha256,
        "first_seq": segment.first_seq,
        "last_seq": segment.last_seq,
        "batch_count": segment.batch_count,
        "record_count": segment.record_count,
    }


@dataclass(frozen=True, slots=True)
class ArchiveManifest:
    object_key: str
    sha256: str
    content: bytes

    def __post_init__(self) -> None:
        if hashlib.sha256(self.content).hexdigest() != self.sha256:
            raise ValueError("manifest content digest is invalid")
        payload = json.loads(self.content)
        if not isinstance(payload, dict) or _canonical_json(payload) != self.content:
            raise ValueError("manifest content is not canonical")

    @property
    def payload(self) -> dict[str, object]:
        payload = json.loads(self.content)
        assert isinstance(payload, dict)
        return payload


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
        capacity_root: Path | None = None,
        capacity_reserve_bytes: int = 0,
    ) -> None:
        if rotate_after_ms < 1 or max_segment_bytes < 1:
            raise ValueError("journal rotation thresholds must be positive")
        self.root = root
        ensure_durable_directory(self.root)
        self._lock = threading.RLock()
        self._segment_started_at_ms = started_at_ms
        self._rotate_after_ms = rotate_after_ms
        self._max_segment_bytes = max_segment_bytes
        self._capacity_warning_bytes = capacity_warning_bytes
        self._capacity_root = root if capacity_root is None else capacity_root
        self._capacity_reserve_bytes = capacity_reserve_bytes
        self._healthy = True
        self._warnings: set[str] = set()
        self._batch_digests: dict[UUID, bytes] = {}
        self._batches: list[EventBatch] = []
        self._catalog = DurableJsonLog(root / "segments.catalog")
        self._writer: JournalWriter | None = None
        try:
            for segment in self._discover_sealed():
                for recovered in read_sealed_journal(segment.path).records:
                    self._index_recovered(recovered)
            active_recovery = recover_journal(root / "active.journal")
            for recovered in active_recovery.records:
                self._index_recovered(recovered)
            self._writer = JournalWriter(root)
            self.check_capacity()
        except BaseException:
            if self._writer is not None:
                self._writer.close()
            self._catalog.close()
            raise

    @property
    def active_path(self) -> Path:
        if self._writer is None:
            return self.root / "active.journal"
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

    @property
    def segment_catalog(self) -> tuple[dict[str, object], ...]:
        return tuple(segment_to_catalog(item) for item in self._discover_sealed())

    def append_batch_once(self, batch: EventBatch) -> bool:
        with self._lock:
            self.check_capacity()
            encoded = encode_record(batch)
            digest = hashlib.sha256(encoded).digest()
            prior = self._batch_digests.get(batch.batch_id)
            if prior is not None:
                if prior != digest:
                    raise BatchIdentityConflict(str(batch.batch_id))
                return False
            try:
                if self._writer is None:
                    raise OSError("journal writer requires process recovery")
                appended = self._writer.append_batch_once(batch)
            except BaseException:
                self._healthy = False
                raise
            if appended:
                self._batch_digests[batch.batch_id] = digest
                self._batches.append(batch)
            self.check_capacity()
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
            if self._writer is None:
                raise OSError("journal writer requires process recovery")
            existing = self._discover_sealed()
            self._writer.close()
            self._writer = None
            next_index = len(existing) + 1
            target = self.root / f"segment-{next_index:08d}.journal"
            try:
                durable_replace(self.root / "active.journal", target)
                previous = existing[-1].raw_sha256 if existing else None
                segment = self._read_segment(target, next_index, previous)
                self._catalog.append(segment_to_catalog(segment))
                self._writer = JournalWriter(self.root)
                self._segment_started_at_ms = now_ms
                self.check_capacity()
                return True
            except BaseException:
                self._healthy = False
                raise

    def close(self) -> None:
        try:
            if self._writer is not None:
                self._writer.close()
                self._writer = None
        finally:
            self._catalog.close()

    def _discover_sealed(self) -> tuple[SealedSegment, ...]:
        catalog = self._catalog.records
        paths = tuple(sorted(self.root.glob("segment-*.journal")))
        expected_names = {
            str(record.get("file_name")) for record in catalog
        }
        if {path.name for path in paths} != expected_names:
            raise ArchiveFatalFailure("sealed segment catalog does not match files")
        segments: list[SealedSegment] = []
        previous: str | None = None
        for expected_index, record in enumerate(catalog, start=1):
            if set(record) != {
                "kind",
                "index",
                "file_name",
                "raw_sha256",
                "previous_raw_sha256",
                "first_seq",
                "last_seq",
                "batch_count",
                "record_count",
            } or record.get("kind") != "segment_sealed":
                raise ArchiveFatalFailure("sealed segment catalog record is invalid")
            if (
                record.get("index") != expected_index
                or record.get("file_name")
                != f"segment-{expected_index:08d}.journal"
                or record.get("previous_raw_sha256") != previous
            ):
                raise ArchiveFatalFailure("sealed segment catalog is not contiguous")
            path = self.root / str(record["file_name"])
            segment = self._read_segment(path, expected_index, previous)
            if segment_to_catalog(segment) != record:
                raise ArchiveFatalFailure("sealed segment conflicts with catalog")
            segments.append(segment)
            previous = segment.raw_sha256
        return tuple(segments)

    def _read_segment(
        self, path: Path, index: int, previous_raw_sha256: str | None
    ) -> SealedSegment:
        try:
            recovered = read_sealed_journal(path).records
        except JournalCorruption as error:
            raise ArchiveFatalFailure("sealed segment is corrupt") from error
        if not recovered:
            raise ArchiveFatalFailure("sealed journal segment must not be empty")
        sequence_values = [
            record.seq for item in recovered for record in item.batch.records
        ]
        return SealedSegment(
            index=index,
            path=path,
            first_seq=min(sequence_values),
            last_seq=max(sequence_values),
            batch_count=len(recovered),
            record_count=len(sequence_values),
            raw_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            previous_raw_sha256=previous_raw_sha256,
        )

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
            for path in self._capacity_root.rglob("*")
            if path.is_file()
        )

    def check_capacity(self) -> None:
        available = os.statvfs(self._capacity_root)
        free_bytes = available.f_bavail * available.f_frsize
        low = (
            self._capacity_reserve_bytes > 0
            and free_bytes <= self._capacity_reserve_bytes
        ) or (
            self._capacity_warning_bytes > 0
            and self._local_bytes() >= self._capacity_warning_bytes
        )
        if low:
            self._warnings.add("journal_capacity_low")
        else:
            self._warnings.discard("journal_capacity_low")


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
        snapshot_digests: Mapping[str, str],
        frozen_snapshots: Mapping[str, object] | None = None,
        previous_manifest: Mapping[str, object] | None = None,
    ) -> None:
        ensure_durable_directory(root)
        self.root = root
        self.run_id = run_id
        self.generation = generation
        self.journal = journal
        self.outbox = outbox
        self.backend = backend
        self._snapshot_digests = freeze_json(dict(snapshot_digests))
        self._frozen_snapshots = freeze_json(
            {} if frozen_snapshots is None else dict(frozen_snapshots)
        )
        self._previous_manifest = self._validate_previous_manifest(previous_manifest)
        self._state = DurableJsonLog(
            root / f"generation-{generation}" / "archive-state.log"
        )
        self._warnings: set[str] = set()
        self._healthy = True
        try:
            self._uploaded_segments(self.journal.sealed_segments)
        except BaseException:
            self._state.close()
            raise

    @property
    def snapshot_digests(self) -> dict[str, object]:
        projected = json_projection(self._snapshot_digests)
        assert isinstance(projected, dict)
        return projected

    @property
    def frozen_snapshots(self) -> dict[str, object]:
        projected = json_projection(self._frozen_snapshots)
        assert isinstance(projected, dict)
        return projected

    @property
    def previous_manifest(self) -> dict[str, object] | None:
        projected = json_projection(self._previous_manifest)
        assert projected is None or isinstance(projected, dict)
        return projected

    @property
    def healthy(self) -> bool:
        return self._healthy and self.journal.healthy

    @property
    def warning_codes(self) -> frozenset[str]:
        return frozenset(self._warnings) | self.journal.warning_codes

    def rotate_due(self, now_ms: int) -> bool:
        try:
            return self.journal.rotate_if_due(now_ms)
        except BaseException:
            self._healthy = False
            raise

    def upload_all_sealed(self) -> None:
        try:
            segments = self.journal.sealed_segments
            uploaded = self._uploaded_segments(segments)
        except ArchiveFatalFailure:
            self._healthy = False
            self._warnings.add("archive_upload_failed")
            raise
        previous_hash: str | None = None
        for segment in segments:
            try:
                content = self._gzip_segment(segment)
            except OSError as error:
                self._raise_failure(error, "sealed archive durability failed")
            digest = hashlib.sha256(content).hexdigest()
            checkpoint = self._segment_checkpoint(
                segment=segment,
                digest=digest,
                compressed_bytes=len(content),
                previous_sha256=previous_hash,
            )
            if segment.index in uploaded:
                if uploaded[segment.index] != checkpoint:
                    self._healthy = False
                    raise ArchiveFatalFailure("archive checkpoint conflicts with segment")
                previous_hash = digest
                continue
            command = self._archive_upload_command(
                object_key=str(checkpoint["object_key"]),
                sha256=digest,
                byte_length=len(content),
                content_type="application/gzip",
            )
            try:
                upload_url = self._request_upload(
                    command, str(checkpoint["object_key"])
                )
                self.backend.upload_presigned(
                    upload_url,
                    content,
                    digest,
                    "application/gzip",
                )
            except (BackendUnavailable, BackendProtocolError, ValueError) as error:
                message = (
                    "archive checksum verification failed"
                    if "checksum" in str(error)
                    else "sealed archive upload failed"
                )
                self._raise_failure(error, message)
            try:
                self._state.append(checkpoint)
            except OSError as error:
                self._raise_failure(error, "archive checkpoint durability failed")
            uploaded[segment.index] = checkpoint
            previous_hash = digest
        self._warnings.discard("archive_upload_failed")

    def build_manifest(
        self, *, final_cursors: dict[str, int]
    ) -> ArchiveManifest:
        try:
            sealed = self.journal.sealed_segments
            uploaded = self._uploaded_segments(sealed)
            if set(uploaded) != {segment.index for segment in sealed}:
                raise ArchiveFatalFailure("not every catalog segment is verified")
            segments = [
                {
                    key: value
                    for key, value in uploaded[segment.index].items()
                    if key != "kind"
                }
                for segment in sealed
            ]
            previous_hash: str | None = None
            for segment, checkpoint in zip(sealed, segments, strict=True):
                content = self._gzip_segment(segment)
                expected = self._segment_checkpoint(
                    segment=segment,
                    digest=hashlib.sha256(content).hexdigest(),
                    compressed_bytes=len(content),
                    previous_sha256=previous_hash,
                )
                if checkpoint != {
                    key: value for key, value in expected.items() if key != "kind"
                }:
                    raise ArchiveFatalFailure(
                        "archive checkpoint chain conflicts with catalog"
                    )
                previous_hash = str(expected["sha256"])
        except (ArchiveFatalFailure, OSError) as error:
            self._healthy = False
            self._warnings.add("archive_upload_failed")
            if isinstance(error, ArchiveFatalFailure):
                raise
            raise ArchiveFatalFailure("manifest durability validation failed") from error
        previous_manifest = self.previous_manifest
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
            "previous_manifest": previous_manifest,
            "previous_manifest_sha256": (
                None if previous_manifest is None else previous_manifest["sha256"]
            ),
        }
        content = _canonical_json(payload)
        digest = hashlib.sha256(content).hexdigest()
        return ArchiveManifest(
            object_key=(
                f"runs/{self.run_id}/generation-{self.generation}/manifest.json"
            ),
            sha256=digest,
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
                upload_url,
                manifest.content,
                manifest.sha256,
                "application/json",
            )
            publish = self._publish_manifest_command(manifest)
            self.outbox.append((publish,))
            self.outbox.deliver_pending(self.backend)
        except (BackendUnavailable, BackendProtocolError, OSError, ValueError) as error:
            self._raise_failure(error, "archive manifest publication failed")
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
                and upload.get("checksum_enforced") is True
                and upload.get("checksum_sha256")
                == command["metadata"]["sha256"]
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
                raise ArchiveFatalFailure("local compressed segment conflict")
            return content
        descriptor = open_durable_file(
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

    def _uploaded_segments(
        self, segments: tuple[SealedSegment, ...]
    ) -> dict[int, dict[str, object]]:
        uploaded: dict[int, dict[str, object]] = {}
        valid_indexes = {segment.index for segment in segments}
        for expected_index, record in enumerate(self._state.records, start=1):
            if set(record) != {
                "kind",
                "index",
                "object_key",
                "sha256",
                "previous_sha256",
                "compressed_bytes",
                "first_seq",
                "last_seq",
                "batch_count",
                "record_count",
                "raw_sha256",
            } or record.get("kind") != "segment_uploaded":
                raise ArchiveFatalFailure("archive checkpoint record is invalid")
            index = record.get("index")
            if (
                type(index) is not int
                or index != expected_index
                or index not in valid_indexes
                or index in uploaded
            ):
                raise ArchiveFatalFailure("archive checkpoint index conflicts with catalog")
            uploaded[index] = record
        return uploaded

    def _segment_checkpoint(
        self,
        *,
        segment: SealedSegment,
        digest: str,
        compressed_bytes: int,
        previous_sha256: str | None,
    ) -> dict[str, object]:
        return {
            "kind": "segment_uploaded",
            "index": segment.index,
            "object_key": self._segment_key(segment.index),
            "sha256": digest,
            "previous_sha256": previous_sha256,
            "compressed_bytes": compressed_bytes,
            "first_seq": segment.first_seq,
            "last_seq": segment.last_seq,
            "batch_count": segment.batch_count,
            "record_count": segment.record_count,
            "raw_sha256": segment.raw_sha256,
        }

    def _validate_previous_manifest(
        self, value: Mapping[str, object] | None
    ) -> object:
        if self.generation == 1:
            if value is not None:
                raise ValueError("previous manifest conflicts with generation")
            return None
        if not isinstance(value, Mapping) or set(value) != {
            "generation",
            "object_key",
            "sha256",
        }:
            raise ValueError("previous manifest identity is required")
        expected_key = (
            f"runs/{self.run_id}/generation-{self.generation - 1}/manifest.json"
        )
        digest = value.get("sha256")
        if (
            value.get("generation") != self.generation - 1
            or value.get("object_key") != expected_key
            or type(digest) is not str
            or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
        ):
            raise ValueError("previous manifest identity conflicts with generation")
        return freeze_json(dict(value))

    def _raise_failure(self, error: BaseException, message: str) -> None:
        self._warnings.add("archive_upload_failed")
        if isinstance(error, BackendUnavailable):
            raise ArchiveRetryableFailure(message) from error
        self._healthy = False
        raise ArchiveFatalFailure(message) from error

    def _segment_key(self, index: int) -> str:
        return (
            f"runs/{self.run_id}/generation-{self.generation}/segments/"
            f"{index:08d}.journal.gz"
        )
