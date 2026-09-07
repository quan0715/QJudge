"""Resident archive authorization and publication CAS; storage I/O is outside locks."""
import base64
import hmac
import re
from uuid import UUID, uuid4
import httpx

from django.db import transaction
from django.utils import timezone

from apps.contests.models import (Contest, ContestParticipant, ExamIntegrityRun, IntegrityUploadGrant,
                                 IntegrityBatchAdmission, ExamEvidenceChunk)
from .integrity_commands import (
    IntegrityCommandRejected, resident_service_digest, generate_archive_put_url, _archive_bucket,
)
from .anticheat_storage import get_s3_client


def _locked_run(run_id, digest):
    contest_id = ExamIntegrityRun.objects.values_list("contest_id", flat=True).get(pk=run_id)
    contest = Contest.objects.select_for_update().get(pk=contest_id)
    run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
    if not digest or not hmac.compare_digest(digest, resident_service_digest()):
        raise IntegrityCommandRejected("invalid_integrity_run_scope")
    return contest, run


def _authorize(contest, run, revision):
    if (revision != run.schedule_revision or revision != contest.schedule_revision
            or run.session_state != "draining" or run.data_state != "open"
            or not run.accept_until or timezone.now() < run.accept_until
            or not contest.end_time or timezone.now() < contest.end_time):
        raise IntegrityCommandRejected("stale_or_pending_finalize")


def verify_candidate(*, object_key, sha256, byte_length):
    # Presigning is local. Bound the actual HEAD independently of boto's default
    # retry sleeps so lost resident responses cannot accumulate long SDK calls.
    url = get_s3_client().generate_presigned_url("head_object", Params={"Bucket": _archive_bucket(),
        "Key": object_key, "ChecksumMode": "ENABLED"}, ExpiresIn=60)
    response = httpx.head(url, headers={"x-amz-checksum-mode": "ENABLED"}, timeout=httpx.Timeout(2.0, connect=1.0))
    response.raise_for_status()
    if (response.headers.get("Content-Length") != str(byte_length)
            or response.headers.get("x-amz-checksum-sha256") != base64.b64encode(bytes.fromhex(sha256)).decode()):
        raise OSError("archive candidate checksum not verified")


def finalize_control(run_id, body, *, digest):
    if type(body) is not dict or type(body.get("revision")) is not int or body["revision"] < 1:
        raise ValueError("invalid finalize request")
    phase, revision = body.get("phase"), body["revision"]
    if phase not in {"authorize", "upload", "segment_upload", "commit"}:
        raise ValueError("invalid finalize phase")
    expected = {"phase", "revision"}
    if phase != "authorize":
        expected |= {"candidate_id", "sha256", "byte_length", "gaps"}
        if (str(UUID(body["candidate_id"])) != body["candidate_id"]
                or type(body["sha256"]) is not str or not re.fullmatch(r"[0-9a-f]{64}", body["sha256"])
                or type(body["byte_length"]) is not int or not 0 < body["byte_length"] <= 16 * 1024 * 1024
                or type(body["gaps"]) is not dict or set(body["gaps"]) - {"pending_commands", "pending_receipts"}
                or any(type(v) is not int or v < 0 for v in body["gaps"].values())):
            raise ValueError("invalid candidate")
    if set(body) != expected:
        raise ValueError("invalid finalize fields")
    with transaction.atomic():
        contest, run = _locked_run(run_id, digest)
        state = run.metrics.get("finalization", {})
        if run.session_state == "archived" and run.data_state == "archived":
            if phase == "authorize" or (revision == run.schedule_revision
                    and state.get("candidate_id") == body["candidate_id"]
                    and run.archive_manifest_sha256 == body["sha256"]):
                return {"archived": True, "run_id": str(run_id), "revision": run.schedule_revision,
                        "manifest_key": run.archive_manifest_key, "manifest_sha256": run.archive_manifest_sha256}
            raise IntegrityCommandRejected("terminal_finalize_conflict")
        _authorize(contest, run, revision)
        if phase == "authorize":
            if state.get("revision") != revision:
                state = {"revision": revision, "candidate_id": str(uuid4()), "status": "authorized"}
                run.metrics = {**run.metrics, "finalization": state}
                run.save(update_fields=["metrics", "updated_at"])
            return {"run_id": str(run_id), "revision": revision, "candidate_id": state["candidate_id"],
                    "deadline_expired": True, "archived": False}
        if state.get("revision") != revision or state.get("candidate_id") != body["candidate_id"]:
            raise IntegrityCommandRejected("stale_finalize_candidate")
        key = f"runs/{run_id}/resident-revision-{revision}/{body['candidate_id']}/{body['sha256']}.json"
        if phase == "segment_upload":
            key = f"runs/{run_id}/resident-segments/{body['sha256']}.journal.gz"
    # Neither presigning (including credential lookup) nor object HEAD owns row locks.
    if phase in {"upload", "segment_upload"}:
        url = generate_archive_put_url(bucket=_archive_bucket(), object_key=key,
                                      content_type="application/gzip" if phase == "segment_upload" else "application/json",
                                      sha256=body["sha256"], byte_length=body["byte_length"])
        return {"object_key": key, "upload_url": url, "sha256": body["sha256"]}
    try:
        verify_candidate(object_key=key, sha256=body["sha256"], byte_length=body["byte_length"])
    except Exception:
        ExamIntegrityRun.objects.filter(pk=run_id, schedule_revision=revision, data_state="open").update(
            health="unhealthy", last_error="resident_archive_verification_failed")
        raise
    with transaction.atomic():
        contest, run = _locked_run(run_id, digest)
        state = run.metrics.get("finalization", {})
        if (run.session_state == "archived" and run.archive_manifest_key == key
                and run.archive_manifest_sha256 == body["sha256"]):
            return {"archived": True, "run_id": str(run_id), "revision": revision,
                    "manifest_key": key, "manifest_sha256": body["sha256"]}
        _authorize(contest, run, revision)
        if state.get("candidate_id") != body["candidate_id"]:
            raise IntegrityCommandRejected("stale_finalize_candidate")
        grants = IntegrityUploadGrant.objects.filter(run=run, completed_at__isnull=True)
        participants = ContestParticipant.objects.filter(contest=contest,
            exam_status__in=("in_progress", "paused", "locked", "submitted"))
        admissions = IntegrityBatchAdmission.objects.filter(run=run)
        from .integrity_evidence import build_evidence_delivery
        pending_evidence = sum(len(build_evidence_delivery(run, participant,
            int(timezone.now().timestamp() * 1000)).pending_commands) for participant in participants.iterator())
        gaps = {**body["gaps"], "missing_final_markers": grants.filter(final_seq__isnull=True).count(),
                "incomplete_upload_scopes": grants.count(),
                "participants_without_receipts": participants.exclude(pk__in=admissions.values("participant_id")).count(),
                "participants_without_upload_grant": participants.exclude(
                    pk__in=IntegrityUploadGrant.objects.filter(run=run).values("participant_id")).count(),
                "pending_evidence_demands": pending_evidence,
                "unverified_evidence_chunks": ExamEvidenceChunk.objects.filter(integrity_run=run)
                    .exclude(status__in=("verified", "unavailable")).count()}
        run.metrics = {**run.metrics, "finalization": {**state, "status": "archived", "gaps": gaps,
                       "local_recovery_retained": True, "admission_ownership_retained": True}}
        run.session_state = run.data_state = "archived"
        run.archive_manifest_key, run.archive_manifest_sha256 = key, body["sha256"]
        run.archive_generation = max(1, run.archive_generation)
        run.stopped_at = timezone.now()
        run.last_error = "resident_archive_with_gaps" if any(gaps.values()) else ""
        run.save(update_fields=["metrics", "session_state", "data_state", "archive_manifest_key",
            "archive_manifest_sha256", "archive_generation", "stopped_at", "last_error", "updated_at"])
        return {"archived": True, "run_id": str(run_id), "revision": revision,
                "manifest_key": key, "manifest_sha256": body["sha256"]}
