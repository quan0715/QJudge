"""Revision CAS across external archive I/O; local recovery stores are retained."""
from dataclasses import replace
import hashlib
import json
from uuid import UUID

from integrity_service.journal.archive import ArchiveResult, gzip_segment
from integrity_service.journal.command_outbox import DurableJsonLog


class StaleSchedule(ValueError):
    pass


def finalize(registry, run_id, expected_revision):
    with registry._run_lock(run_id):
        runtime = registry.get(run_id)
        if registry.descriptor(run_id).schedule_revision != expected_revision:
            raise StaleSchedule("stale finalize schedule")
    # Backend authorization is fresh and is never called under a Run lock.
    auth = runtime.backend.finalize_control({"phase": "authorize", "revision": expected_revision})
    if auth.get("run_id") != str(run_id) or auth.get("revision") != expected_revision:
        raise StaleSchedule("finalize authorization scope mismatch")
    if auth.get("archived") is True:
        result = ArchiveResult(True, auth["manifest_key"], auth["manifest_sha256"])
        _retire(registry, run_id, runtime, expected_revision, result)
        return result
    if auth.get("deadline_expired") is not True:
        return ArchiveResult(False, "", "")
    candidate = str(UUID(auth["candidate_id"]))
    with registry._run_lock(run_id), runtime._lock:
        if registry.descriptor(run_id).schedule_revision != expected_revision:
            raise StaleSchedule("schedule changed during authorization")
        if not runtime.healthy:
            raise OSError("Run requires recovery")
        runtime._accepting = False
        runtime._state = "STOPPING"
        # Yield to the bounded decision lane. No receipt is silently discarded.
        if runtime.receipts.pending(1):
            return ArchiveResult(False, "", "")
        runtime.journal.rotate_if_due(registry.descriptor(run_id).accept_until_ms, force=True)
        cursors = dict(runtime._final_cursors)
        segments = runtime.journal.sealed_segments
    uploaded = _upload_segments(registry, runtime, segments, expected_revision, candidate)
    with registry._run_lock(run_id), runtime._lock:
        if registry.descriptor(run_id).schedule_revision != expected_revision:
            raise StaleSchedule("schedule changed during segment upload")
        manifest = {"schema_version": 2, "run_id": str(run_id), "segments": uploaded,
            "final_device_cursors": cursors, **runtime.archive_snapshot(),
            "counts": {"segments": len(segments), "batches": sum(s.batch_count for s in segments),
                       "records": sum(s.record_count for s in segments)}}
        gaps = {"pending_commands": len(runtime.outbox.pending_commands), "pending_receipts": 0}
        manifest.update(resident_revision=expected_revision, candidate_id=candidate, deadline_gaps=gaps,
            recovery_retention={"location": "resident_volume", "run_id": str(run_id),
                "required": ["receipts", "timeline", "outbox", "journal", "descriptor.log", "resident-archive.log"],
                "admission_ownership": "backend_retained", "purged": False})
        content = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
        if len(content) > 16 * 1024 * 1024:
            raise OSError("archive manifest capacity reached")
        sha256 = hashlib.sha256(content).hexdigest()
    body = {"revision": expected_revision, "candidate_id": candidate, "sha256": sha256,
            "byte_length": len(content), "gaps": gaps}
    upload = runtime.backend.finalize_control({**body, "phase": "upload"})
    key = f"runs/{run_id}/resident-revision-{expected_revision}/{candidate}/{sha256}.json"
    if upload.get("object_key") != key or upload.get("sha256") != sha256:
        raise ValueError("candidate upload scope mismatch")
    runtime.backend.upload_presigned(upload["upload_url"], content, sha256, "application/json")
    committed = runtime.backend.finalize_control({**body, "phase": "commit"})
    if (committed.get("archived") is not True or committed.get("run_id") != str(run_id)
            or committed.get("revision") != expected_revision or committed.get("manifest_key") != key
            or committed.get("manifest_sha256") != sha256):
        raise ValueError("candidate commit scope mismatch")
    result = ArchiveResult(True, key, sha256)
    _retire(registry, run_id, runtime, expected_revision, result)
    return result


def _upload_segments(registry, runtime, segments, revision, candidate):
    log = DurableJsonLog(registry.root / str(runtime.run_id) / "resident-archive.log")
    try:
        verified = {}
        for expected_index, row in enumerate(log.records, 1):
            if (row.get("index") != expected_index or row.get("sha256") in verified
                    or expected_index > len(segments)):
                raise ValueError("resident archive checkpoint order conflict")
            verified[row["sha256"]] = row
        results = []
        for segment in segments:
            # Normal rotation bounds this at the configured 8 MiB + one batch.
            # A historical oversized segment stays local and visibly retryable.
            if segment.path.stat().st_size > 16 * 1024 * 1024:
                raise OSError("resident archive segment capacity exceeded")
            content = gzip_segment(runtime.archive_root, segment)
            sha256 = hashlib.sha256(content).hexdigest()
            key = f"runs/{runtime.run_id}/resident-segments/{sha256}.journal.gz"
            row = {"index": segment.index, "object_key": key, "sha256": sha256,
                "byte_length": len(content), "raw_sha256": segment.raw_sha256,
                "previous_raw_sha256": segment.previous_raw_sha256, "batch_count": segment.batch_count,
                "record_count": segment.record_count, "first_seq": segment.first_seq, "last_seq": segment.last_seq}
            if sha256 not in verified:
                upload = runtime.backend.finalize_control({"phase": "segment_upload", "revision": revision,
                    "candidate_id": candidate, "sha256": sha256, "byte_length": len(content), "gaps": {}})
                if upload.get("object_key") != key or upload.get("sha256") != sha256:
                    raise ValueError("segment upload scope mismatch")
                runtime.backend.upload_presigned(upload["upload_url"], content, sha256, "application/gzip")
                log.append(row)
            elif verified[sha256] != row:
                raise ValueError("resident archive segment checkpoint conflict")
            results.append(row)
        return results
    finally:
        log.close()


def _retire(registry, run_id, runtime, revision, result):
    with registry._run_lock(run_id), runtime._lock:
        descriptor = registry.descriptor(run_id)
        if descriptor.schedule_revision != revision:
            raise StaleSchedule("schedule changed before terminal checkpoint")
        terminal = replace(descriptor, session_state="archived")
        log = DurableJsonLog(registry.root / str(run_id) / "descriptor.log")
        try:
            log.append(terminal.to_payload())
        finally:
            log.close()
        registry._descriptors[run_id] = terminal
        runtime._state, runtime._accepting = "ARCHIVED", False
    # Wait for admitted delivery to finish without holding registry/Run locks.
    # Late maintenance references check runtime._closed under this same lock.
    with runtime.outbox._delivery_lock:
        runtime.close()
        if hasattr(runtime.backend, "close"):
            runtime.backend.close()
    with registry._run_lock(run_id):
        with registry._lock:
            registry._runtimes.pop(run_id, None)
            registry._descriptors.pop(run_id, None)
            registry.errors.pop(run_id, None)
            registry.finalize_requests.pop(run_id, None)
            registry._retired.add(run_id)
