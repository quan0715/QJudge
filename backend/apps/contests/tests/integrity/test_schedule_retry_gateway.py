"""The gateway refreshes signed schedules without changing admitted batches."""
import base64
from datetime import timedelta
import json
from urllib.parse import urlparse

import httpx
import pytest

from apps.contests.models import IntegrityBatchAdmission
from apps.contests.services.exam_schedule import update_exam_schedule
from apps.contests.tests.integrity.test_batch_gateway import (
    api_client, participant, running_integrity_run, worker_server, make_batch,
)
from apps.contests.tests.integrity.test_upload_grants import resident, send


@pytest.mark.django_db
@pytest.mark.parametrize("failure_endpoint", ["batches", "progress"])
def test_retry_refreshes_signed_revision_and_preserves_admission(
    resident, participant, api_client, worker_server, monkeypatch, failure_endpoint,
):
    api_client.force_authenticate(participant.user)
    batch = make_batch(run_id=resident.pk, participant_id=participant.pk)
    requests = []
    rejection = {"error": {"code": "resident_schedule_sync_pending",
                            "message": "Resident schedule synchronization pending."}}
    original_admission = None

    def post(url, *, content, headers, timeout):
        nonlocal original_admission
        path = urlparse(url).path
        message = (f"resident-v1\nPOST\n{path}\n{resident.pk}\n"
                   f"{headers['X-QJudge-Revision']}\n{headers['X-QJudge-Timestamp']}\n").encode() + content
        worker_server.private_key.public_key().verify(
            base64.b64decode(headers["X-QJudge-Signature"]), message)
        requests.append((path.rsplit("/", 1)[-1], content, headers["X-QJudge-Revision"]))
        if original_admission is None and path.endswith("/" + failure_endpoint):
            original_admission = IntegrityBatchAdmission.objects.get(batch_id=batch["batch_id"])
            # Deterministic race: admission loaded rev 1, then teacher commits
            # extension and resident synchronization wins before this request.
            contest = resident.contest
            updated = update_exam_schedule(contest.pk, start_time=contest.start_time,
                end_time=contest.end_time + timedelta(minutes=5), actor=contest.owner)
            assert updated.schedule_revision == 2
            return httpx.Response(409, json=rejection)
        if path.endswith("/progress"):
            return httpx.Response(200, json={**json.loads(content), "received_seq": 1,
                "processed_seq": 0, "commands_drained": False},
                headers={"X-QJudge-Protocol": "resident-v1"})
        return httpx.Response(200, json={"acked_through_seq": 1,
            "pending_commands": [], "release_evidence_before_ms": 0},
            headers={"X-QJudge-Protocol": "resident-v1"})

    monkeypatch.setattr(httpx, "post", post)
    failed = send(api_client, resident, participant, batch)
    assert failed.status_code == 409
    assert failed.json() == rejection
    assert "acked_through_seq" not in failed.json()
    assert original_admission is not None
    recovered = send(api_client, resident, participant, batch)
    assert recovered.status_code == 200
    assert recovered.json()["acked_through_seq"] == 1
    assert recovered.json()["processed_through_seq"] == 0
    admission = IntegrityBatchAdmission.objects.get(batch_id=batch["batch_id"])
    assert admission.pk == original_admission.pk
    assert admission.first_received_at == original_admission.first_received_at
    assert admission.body_sha256 == original_admission.body_sha256
    assert admission.attempt_id == original_admission.attempt_id
    assert admission.late_unverified == original_admission.late_unverified
    batches = [request for request in requests if request[0] == "batches"]
    assert [request[2] for request in batches] == ["1", "2"]
    assert batches[0][1] == batches[1][1]
    assert json.loads(batches[1][1])["batch"]["records"] == batch["records"]
