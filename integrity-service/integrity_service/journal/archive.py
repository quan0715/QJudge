"""Durable raw journal rotation and deterministic resident archive compression."""

from __future__ import annotations

import gzip
import hashlib
import os
import threading
from dataclasses import dataclass
from pathlib import Path

from integrity_service.core.schemas import EventBatch
from integrity_service.journal.command_outbox import (
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


class ArchiveUploadFailed(RuntimeError):
    """A sealed segment or manifest could not be durably verified upstream."""


class ArchiveFatalFailure(ArchiveUploadFailed):
    """Local durability, catalog, or protocol validation failed closed."""


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


def gzip_segment(root: Path, segment: SealedSegment) -> bytes:
    compressed_path = root / f"segment-{segment.index:08d}.journal.gz"
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
