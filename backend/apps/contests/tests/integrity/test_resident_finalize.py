from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4
import json
import httpx

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from test_resident_internal import resident
from test_internal_commands import owner, student, contest, participant, running_integrity_run


@pytest.fixture(autouse=True)
def full_frozen_policy(resident):
    from apps.contests.services.anticheat_config import build_integrity_policy_snapshot
    resident.policy_snapshot = build_integrity_policy_snapshot(resident.contest)
    resident.save(update_fields=["policy_snapshot"])


def call(run, body, token="temporary-test-service-token"):
    return APIClient().post(f"/api/v1/internal/integrity/runs/{run.pk}/finalize/", body,
                           format="json", HTTP_AUTHORIZATION=f"Resident {token}")


def due(run):
    now = timezone.now()
    run.contest.start_time = now - timedelta(hours=2)
    run.contest.end_time = now - timedelta(minutes=10)
    run.contest.save()
    run.scheduled_start_at = run.contest.start_time
    run.scheduled_end_at = run.contest.end_time
    run.accept_until = now - timedelta(seconds=1)
    run.session_state = "draining"
    run.save()


def test_authorize_requires_latest_revision_and_expired_grace(resident):
    body = {"phase": "authorize", "revision": 1}
    assert call(resident, body).status_code == 409
    due(resident)
    assert call(resident, body, "wrong").status_code == 403
    assert call(resident, {**body, "revision": 2}).status_code == 409
    result = call(resident, body)
    assert result.status_code == 200
    assert result.data["revision"] == 1
    assert result.data["run_id"] == str(resident.pk)
    assert result.data["deadline_expired"] is True
    assert result.data["candidate_id"] == call(resident, body).data["candidate_id"]


@pytest.mark.django_db(transaction=True)
def test_extension_during_remote_verification_invalidates_commit(resident):
    from apps.contests.services.exam_schedule import update_exam_schedule
    due(resident)
    auth = call(resident, {"phase": "authorize", "revision": 1})
    assert auth.status_code == 200
    candidate = auth.data["candidate_id"]
    body = {"phase": "commit", "revision": 1, "candidate_id": candidate,
            "sha256": "a" * 64, "byte_length": 123, "gaps": {"pending_commands": 2}}
    def verify(**kwargs):
        # Transport barrier: an extension commits while object HEAD is running.
        assert not connection.in_atomic_block
        update_exam_schedule(resident.contest_id, start_time=resident.contest.start_time,
                             end_time=timezone.now() + timedelta(hours=1), actor=resident.contest.owner)
    with patch("apps.contests.services.integrity_finalize.verify_candidate", side_effect=verify):
        result = call(resident, body)
    assert result.status_code == 409
    resident.refresh_from_db()
    assert resident.session_state == "active"
    assert resident.data_state == "open"
    assert resident.archive_manifest_key == ""


def test_verified_commit_is_idempotent_and_keeps_missing_final_marker_gap(resident, participant):
    from apps.contests.models import IntegrityUploadGrant, IntegrityBatchAdmission
    due(resident)
    grant = IntegrityUploadGrant.objects.create(run=resident, participant=participant,
        device_id="device-a", attempt_id=uuid4(), submitted_at=resident.scheduled_end_at,
        accept_until=resident.accept_until)
    admission = IntegrityBatchAdmission.objects.create(run=resident, participant=participant,
        device_id="device-a", attempt_id=grant.attempt_id, batch_id=uuid4(), body_sha256="a" * 64,
        first_seq=1, last_seq=1, first_received_at=resident.scheduled_end_at)
    auth = call(resident, {"phase": "authorize", "revision": 1})
    assert auth.status_code == 200
    body = {"phase": "commit", "revision": 1, "candidate_id": auth.data["candidate_id"],
            "sha256": "a" * 64, "byte_length": 123, "gaps": {"pending_commands": 2}}
    with patch("apps.contests.services.integrity_finalize.verify_candidate"):
        assert call(resident, body).status_code == 200
        assert call(resident, body).status_code == 200
    resident.refresh_from_db()
    grant.refresh_from_db()
    assert resident.session_state == resident.data_state == "archived"
    assert resident.metrics["finalization"]["gaps"]["missing_final_markers"] == 1
    assert resident.metrics["finalization"]["gaps"]["pending_commands"] == 2
    assert grant.completed_at is None
    assert IntegrityBatchAdmission.objects.filter(pk=admission.pk).exists()


def test_storage_failure_leaves_candidate_retryable_and_truthful(resident):
    due(resident)
    auth = call(resident, {"phase": "authorize", "revision": 1})
    assert auth.status_code == 200
    body = {"phase": "commit", "revision": 1, "candidate_id": auth.data["candidate_id"],
            "sha256": "a" * 64, "byte_length": 123, "gaps": {}}
    with patch("apps.contests.services.integrity_finalize.verify_candidate", side_effect=OSError("offline")):
        assert call(resident, body).status_code == 503
    resident.refresh_from_db()
    assert resident.data_state == "open"
    assert not resident.archive_manifest_key
    with patch("apps.contests.services.integrity_finalize.verify_candidate"):
        assert call(resident, body).status_code == 200


def test_outage_handoff_compare_clear_does_not_lose_concurrent_failure(resident):
    from apps.contests.services.integrity_availability import record_outage, outage_handoff, acknowledge_outage
    record_outage(resident.pk, started_ms=100)
    first = outage_handoff(resident.pk, ended_ms=200)
    assert first == {"generation": 1, "started_ms": 100, "ended_ms": 200, "reason": "platform_unavailable"}
    assert outage_handoff(resident.pk, ended_ms=300) == first
    record_outage(resident.pk, started_ms=250)
    acknowledge_outage(resident.pk, first["generation"])
    second = outage_handoff(resident.pk, ended_ms=400)
    assert second["generation"] == 2
    assert second["started_ms"] == 100
    acknowledge_outage(resident.pk, 2)
    assert outage_handoff(resident.pk, ended_ms=500) is None


def test_resident_legacy_publish_cannot_bypass_revision_cas(resident):
    command = {"command_id": str(uuid4()), "run_id": str(resident.pk), "kind": "publish_archive_manifest",
               "metadata": {"object_key": f"runs/{resident.pk}/generation-1/manifest.json", "sha256": "a" * 64, "generation": 1}}
    response = APIClient().post(f"/api/v1/internal/integrity/runs/{resident.pk}/commands/",
        {"commands": [command]}, format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token")
    assert response.status_code == 422
    resident.refresh_from_db()
    assert resident.archive_manifest_key == ""


@pytest.mark.parametrize("failure", ["timeout", 503, 507, 401, 422])
def test_gateway_records_only_observed_availability_failure_then_hands_off(resident, failure):
    from apps.contests.infrastructure.integrity_worker_client import build_integrity_worker_client
    client = build_integrity_worker_client()
    body = b'{"batch":{},"late_unverified":false}'
    def fail(url, **kwargs):
        if failure == "timeout":
            raise httpx.ReadTimeout("offline")
        return httpx.Response(failure, request=httpx.Request("POST", url), json={"detail": "rejected"})
    with patch("httpx.post", side_effect=fail):
        try:
            client.post_batch(resident, body)
        except Exception:
            pass
    resident.refresh_from_db()
    if failure in (401, 422):
        assert "service_outage" not in resident.metrics
        return
    assert resident.metrics["service_outage"]["generation"] == 1
    def resumed(url, **kwargs):
        envelope = json.loads(kwargs["content"])
        gap = envelope["service_gap"]
        assert gap["generation"] == 1
        assert gap["ended_ms"] >= gap["started_ms"]
        return httpx.Response(200, request=httpx.Request("POST", url),
            headers={"X-QJudge-Protocol": "resident-v1", "X-QJudge-Gap-Generation": "1"},
            json={"acked_through_seq": 1, "pending_commands": [], "release_evidence_before_ms": 0})
    with patch("httpx.post", side_effect=resumed):
        assert client.post_batch(resident, body).acked_through_seq == 1
    resident.refresh_from_db()
    assert "service_outage" not in resident.metrics


@pytest.mark.django_db(transaction=True)
def test_reconciler_dispatches_signed_finalize_and_persists_gaps_without_clobber(resident):
    from apps.contests.services.exam_schedule import _sync_resident
    from apps.contests.services.integrity_availability import record_outage
    due(resident)
    record_outage(resident.pk)
    calls = []
    def put(url, **kwargs):
        assert not connection.in_atomic_block
        payload = json.loads(kwargs["content"])
        assert payload["service_gap"]["generation"] == 1
        return httpx.Response(200, request=httpx.Request("PUT", url), headers={"X-QJudge-Gap-Generation": "1"},
            json={"protocol": "resident-v1", "run_id": str(resident.pk), "schedule_revision": 1})
    gaps = {"count": 1, "last_ended_ms": 123, "suppressed_connectivity_commands": 2, "affected_participant_count": 1}
    def get(url, **kwargs):
        # Simultaneous candidate metadata must survive background health writes.
        current = type(resident).objects.get(pk=resident.pk)
        current.metrics = {**current.metrics, "finalization": {"candidate_id": "preserve-me"}}
        current.save(update_fields=["metrics"])
        return httpx.Response(200, request=httpx.Request("GET", url),
            json={"healthy": True, "schedule_revision": 1, "service_gaps": gaps})
    def post(url, **kwargs):
        assert not connection.in_atomic_block
        assert url.endswith("/control/finalize")
        assert json.loads(kwargs["content"]) == {"expected_revision": 1}
        assert kwargs["headers"]["X-QJudge-Revision"] == "1"
        calls.append(url)
        return httpx.Response(202, request=httpx.Request("POST", url),
            json={"protocol": "resident-v1", "run_id": str(resident.pk), "schedule_revision": 1, "accepted": True})
    with patch("httpx.put", side_effect=put), patch("httpx.get", side_effect=get), patch("httpx.post", side_effect=post):
        assert _sync_resident(resident.pk, timezone.now())
    resident.refresh_from_db()
    assert calls
    assert resident.metrics["finalization"]["candidate_id"] == "preserve-me"
    assert resident.metrics["service_gaps"] == gaps
    assert "service_outage" not in resident.metrics


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("status,html", [(502, False), (502, True), (503, False), (503, True), (504, True)])
def test_reconciler_health_gateway_outage_is_handed_off_on_recovery(resident, status, html):
    from apps.contests.services.exam_schedule import _sync_resident
    sent = []
    def put(url, **kwargs):
        payload = json.loads(kwargs["content"])
        sent.append(payload)
        return httpx.Response(200, request=httpx.Request("PUT", url),
            headers={"X-QJudge-Gap-Generation": "1"},
            json={"protocol": "resident-v1", "run_id": str(resident.pk), "schedule_revision": 1})
    bad = httpx.Response(status, request=httpx.Request("GET", "http://resident/health"),
        **({"text": "<html>Gateway unavailable</html>"} if html else {"json": {"detail": "unavailable"}}))
    with patch("httpx.put", side_effect=put), patch("httpx.get", return_value=bad):
        with pytest.raises(Exception):
            _sync_resident(resident.pk, timezone.now())
    resident.refresh_from_db()
    assert resident.metrics["service_outage"]["generation"] == 1
    good = httpx.Response(200, request=bad.request, json={"healthy": True, "schedule_revision": 1})
    with patch("httpx.put", side_effect=put), patch("httpx.get", return_value=good):
        assert _sync_resident(resident.pk, timezone.now())
    resident.refresh_from_db()
    assert sent[-1]["service_gap"]["generation"] == 1
    assert "service_outage" not in resident.metrics
    assert resident.metrics["observed_service_gaps"] == [sent[-1]["service_gap"]]


def test_reconciler_valid_unhealthy_503_is_not_a_network_outage(resident):
    from apps.contests.services.exam_schedule import _sync_resident
    gaps = {"count": 0, "last_ended_ms": None, "suppressed_connectivity_commands": 0, "affected_participant_count": 0}
    put = httpx.Response(200, request=httpx.Request("PUT", "http://resident/run"),
        json={"protocol": "resident-v1", "run_id": str(resident.pk), "schedule_revision": 1})
    health = httpx.Response(503, request=httpx.Request("GET", "http://resident/health"), json={
        "healthy": False, "accepting": True, "schedule_revision": 1, "warnings": [],
        "service_gaps": gaps, "maintenance_errors": {"archive": "HTTPStatusError"}})
    with patch("httpx.put", return_value=put), patch("httpx.get", return_value=health):
        with pytest.raises(ValueError, match="resident health unavailable"):
            _sync_resident(resident.pk, timezone.now())
    resident.refresh_from_db()
    assert "service_outage" not in resident.metrics
    assert resident.metrics["service_gaps"] == gaps
    assert resident.health == "unhealthy"


@pytest.mark.django_db(transaction=True)
def test_segment_presigning_uses_immutable_digest_key_outside_row_transaction(resident):
    due(resident)
    auth = call(resident, {"phase": "authorize", "revision": 1})
    body = {"phase": "segment_upload", "revision": 1, "candidate_id": auth.data["candidate_id"],
            "sha256": "b" * 64, "byte_length": 123, "gaps": {}}
    def sign(**kwargs):
        assert not connection.in_atomic_block
        assert kwargs["object_key"] == f"runs/{resident.pk}/resident-segments/{'b' * 64}.journal.gz"
        return "https://storage.example/immutable-segment"
    with patch("apps.contests.services.integrity_finalize.generate_archive_put_url", side_effect=sign):
        response = call(resident, body)
    assert response.status_code == 200
    assert response.data["upload_url"] == "https://storage.example/immutable-segment"


@pytest.mark.parametrize("acknowledged", [False, True])
def test_inflight_connectivity_command_after_observed_gap_is_audited(resident, participant, acknowledged):
    from apps.contests.models import IntegrityBatchAdmission, ExamEvent
    from apps.contests.services.integrity_availability import record_outage, outage_handoff, acknowledge_outage
    from test_internal_commands import record_event_command, bind_run
    batch_id = uuid4()
    IntegrityBatchAdmission.objects.create(run=resident, participant=participant, device_id="device-a",
        attempt_id=participant.integrity_attempt_id, batch_id=batch_id, body_sha256="a" * 64,
        first_seq=1, last_seq=1, first_received_at=timezone.now())
    command = bind_run(record_event_command(participant, event_type="connectivity_timeout"), resident)
    command["evidence"] = {}
    command["metadata"] = {"timing_basis": "server_receipt", "last_received_at_server_ms": 100,
                           "transition_at_server_ms": 60100, "receipt_batch_id": str(batch_id)}
    # Command represents the batch signed before the observer knew of the gap.
    record_outage(resident.pk, started_ms=200)
    if acknowledged:
        outage_handoff(resident.pk, ended_ms=70000)
        acknowledge_outage(resident.pk, 1)
    path = f"/api/v1/internal/integrity/runs/{resident.pk}/commands/"
    for _ in range(2):
        response = APIClient().post(path, {"commands": [command]}, format="json",
            HTTP_AUTHORIZATION="Resident temporary-test-service-token")
        assert response.status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    assert event.metadata["integrity"]["action"] == "audit"
    assert event.metadata["integrity"]["suppressed_reason"] == "platform_gap"
    assert event.metadata["integrity"]["requested_action"] == "pause"
    participant.refresh_from_db()
    assert participant.exam_status == "in_progress"
    assert participant.violation_count == 0
    # Genuine later silence after a healthy receipt is not covered by that gap.
    outage_handoff(resident.pk, ended_ms=70000)
    acknowledge_outage(resident.pk, 1)
    command["command_id"] = str(uuid4())
    command["metadata"].update(last_received_at_server_ms=70000, transition_at_server_ms=130000)
    response = APIClient().post(path, {"commands": [command]}, format="json",
        HTTP_AUTHORIZATION="Resident temporary-test-service-token")
    assert response.status_code == 200
    participant.refresh_from_db()
    assert participant.exam_status == "paused"


@pytest.mark.django_db(transaction=True)
def test_independent_connection_extension_wins_during_candidate_head(resident):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from django.db import close_old_connections
    from apps.contests.services.exam_schedule import update_exam_schedule
    due(resident)
    auth = call(resident, {"phase": "authorize", "revision": 1})
    entered, release = Event(), Event()
    def verify(**_):
        assert not connection.in_atomic_block
        entered.set()
        assert release.wait(10)
    def commit():
        close_old_connections()
        try:
            return call(resident, {"phase": "commit", "revision": 1,
                "candidate_id": auth.data["candidate_id"], "sha256": "a" * 64, "byte_length": 123, "gaps": {}}).status_code
        finally:
            close_old_connections()
    with patch("apps.contests.services.integrity_finalize.verify_candidate", side_effect=verify), ThreadPoolExecutor(1) as pool:
        job = pool.submit(commit)
        try:
            assert entered.wait(5)
            update_exam_schedule(resident.contest_id, start_time=resident.contest.start_time,
                end_time=timezone.now() + timedelta(hours=1), actor=resident.contest.owner)
        finally:
            release.set()
        assert job.result(timeout=10) == 409
    resident.refresh_from_db()
    assert resident.session_state == "active"
    assert resident.archive_manifest_key == ""


def test_missing_upload_grant_and_absent_receipts_are_explicit_deadline_gaps(resident, participant):
    import hashlib
    from apps.contests.services.integrity_finalize import finalize_control
    due(resident)
    auth = call(resident, {"phase": "authorize", "revision": 1})
    with patch("apps.contests.services.integrity_finalize.verify_candidate"):
        result = finalize_control(resident.pk, {"phase": "commit", "revision": 1, "candidate_id": auth.data["candidate_id"],
            "sha256": "a" * 64, "byte_length": 123, "gaps": {}},
            digest=hashlib.sha256(b"temporary-test-service-token").hexdigest())
    assert result["archived"] is True
    resident.refresh_from_db()
    assert resident.metrics["finalization"]["gaps"]["participants_without_receipts"] == 1
    assert resident.metrics["finalization"]["gaps"]["participants_without_upload_grant"] == 1


def test_evidence_demand_without_manifest_is_a_deadline_gap(resident, participant):
    from apps.contests.models import ExamEvent, IntegrityBatchAdmission
    from test_internal_commands import record_event_command, bind_run
    batch_id = uuid4()
    IntegrityBatchAdmission.objects.create(run=resident, participant=participant, device_id="device-a",
        attempt_id=participant.integrity_attempt_id, batch_id=batch_id, body_sha256="a" * 64,
        first_seq=1, last_seq=1, first_received_at=timezone.now())
    command = bind_run(record_event_command(participant), resident)
    command["metadata"]["receipt_batch_id"] = str(batch_id)
    assert APIClient().post(f"/api/v1/internal/integrity/runs/{resident.pk}/commands/", {"commands": [command]},
        format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token").status_code == 200
    assert ExamEvent.objects.filter(integrity_run=resident).exists()
    due(resident)
    auth = call(resident, {"phase": "authorize", "revision": 1})
    with patch("apps.contests.services.integrity_finalize.verify_candidate"):
        result = call(resident, {"phase": "commit", "revision": 1, "candidate_id": auth.data["candidate_id"],
            "sha256": "a" * 64, "byte_length": 123, "gaps": {}})
    assert result.status_code == 200
    resident.refresh_from_db()
    assert resident.metrics["finalization"]["gaps"]["pending_evidence_demands"] >= 1


def test_registered_absentee_is_not_counted_as_missing_monitoring(resident, participant):
    participant.exam_status = "not_started"
    participant.started_at = None
    participant.save()
    due(resident)
    auth = call(resident, {"phase": "authorize", "revision": 1})
    with patch("apps.contests.services.integrity_finalize.verify_candidate"):
        result = call(resident, {"phase": "commit", "revision": 1, "candidate_id": auth.data["candidate_id"],
            "sha256": "a" * 64, "byte_length": 123, "gaps": {}})
    assert result.status_code == 200
    resident.refresh_from_db()
    assert resident.metrics["finalization"]["gaps"]["participants_without_receipts"] == 0
    assert resident.metrics["finalization"]["gaps"]["participants_without_upload_grant"] == 0


def test_observed_gap_history_capacity_keeps_unacknowledged_marker(resident, monkeypatch):
    from apps.contests.services import integrity_availability as availability
    monkeypatch.setattr(availability, "MAX_OBSERVED_GAPS", 1)
    availability.record_outage(resident.pk, started_ms=100)
    availability.outage_handoff(resident.pk, ended_ms=200)
    availability.acknowledge_outage(resident.pk, 1)
    availability.record_outage(resident.pk, started_ms=300)
    availability.outage_handoff(resident.pk, ended_ms=400)
    with pytest.raises(ValueError):
        availability.acknowledge_outage(resident.pk, 2)
    resident.refresh_from_db()
    assert len(resident.metrics["observed_service_gaps"]) == 1
    assert resident.metrics["service_outage"]["generation"] == 2


@pytest.mark.parametrize("wrong", ["size", "checksum", None])
def test_candidate_head_verifies_exact_size_and_checksum(resident, wrong):
    import base64
    from apps.contests.services.integrity_finalize import verify_candidate
    metadata = {"ContentLength": 123, "ChecksumSHA256": base64.b64encode(bytes.fromhex("a" * 64)).decode()}
    if wrong == "size":
        metadata["ContentLength"] = 124
    if wrong == "checksum":
        metadata["ChecksumSHA256"] = "mismatch"
    with patch("apps.contests.services.integrity_finalize.get_s3_client") as get:
        get.return_value.generate_presigned_url.return_value = "https://storage.example/candidate"
        response = httpx.Response(200, request=httpx.Request("HEAD", "https://storage.example/candidate"),
            headers={"Content-Length": str(metadata["ContentLength"]), "x-amz-checksum-sha256": metadata["ChecksumSHA256"]})
        with patch("httpx.head", return_value=response):
            if wrong:
                with pytest.raises(OSError):
                    verify_candidate(object_key="scope", sha256="a" * 64, byte_length=123)
            else:
                verify_candidate(object_key="scope", sha256="a" * 64, byte_length=123)


def test_candidate_verification_uses_bounded_http_without_sdk_retry_sleep(resident):
    from apps.contests.services.integrity_finalize import verify_candidate
    with patch("apps.contests.services.integrity_finalize.get_s3_client") as get:
        get.return_value.generate_presigned_url.return_value = "https://storage.example/candidate"
        def timeout(url, **kwargs):
            assert kwargs["timeout"].connect <= 1
            assert kwargs["timeout"].read <= 2
            raise httpx.ReadTimeout("object HEAD stalled")
        with patch("httpx.head", side_effect=timeout), pytest.raises(httpx.ReadTimeout):
            verify_candidate(object_key="scope", sha256="a" * 64, byte_length=123)
