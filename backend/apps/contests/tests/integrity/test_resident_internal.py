import base64
import hashlib
import json
from datetime import timedelta

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.services.integrity_commands import execute_integrity_command, IntegrityCommandRejected
from test_internal_commands import owner, student, contest, participant, running_integrity_run, record_event_command, bind_run


@pytest.fixture
def resident(running_integrity_run, settings, tmp_path):
    run = running_integrity_run
    run.execution_backend = "resident"
    run.compute_state = "stopped"
    run.session_state = "active"
    run.accept_until = run.scheduled_end_at + timedelta(seconds=300)
    run.token_digest = ""
    run.token_expires_at = None
    run.save()
    token = tmp_path / "service-token"
    token.write_text("temporary-test-service-token")
    settings.INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE = str(token)
    key = Ed25519PrivateKey.generate()
    key_file = tmp_path / "signing-key"
    key_file.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = str(key_file)
    return run


def test_resident_callbacks_authenticate_without_legacy_run_token(resident, participant):
    client = APIClient()
    command = bind_run(record_event_command(participant), resident)
    response = client.post(f"/api/v1/internal/integrity/runs/{resident.id}/commands/", {"commands": [command]}, format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token")
    assert response.status_code == 200
    assert response.data["accepted_command_ids"] == [command["command_id"]]


@pytest.mark.parametrize("disposition", ["unknown", "late", "prior_attempt", "trusted"])
def test_resident_commands_require_trusted_current_attempt_receipt(resident, participant, disposition):
    from uuid import uuid4
    from apps.contests.models import IntegrityBatchAdmission, ExamEvent
    command = bind_run(record_event_command(participant), resident)
    batch_id = uuid4()
    command["metadata"]["receipt_batch_id"] = str(batch_id)
    if disposition != "unknown":
        IntegrityBatchAdmission.objects.create(run=resident, participant=participant,
            batch_id=batch_id, attempt_id=uuid4() if disposition == "prior_attempt" else participant.integrity_attempt_id,
            device_id=command["device_id"], body_sha256="a" * 64,
            first_seq=1, last_seq=1, first_received_at=timezone.now(), late_unverified=disposition == "late")
    response = APIClient().post(f"/api/v1/internal/integrity/runs/{resident.id}/commands/",
        {"commands": [command]}, format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token")
    assert response.status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    if disposition == "trusted":
        assert event.metadata["integrity"]["action"] == "pause"
    else:
        assert event.metadata["integrity"]["action"] == "audit"
        assert event.metadata["integrity"]["late_unverified"] is True
        participant.refresh_from_db()
        assert participant.exam_status == "in_progress"
        assert participant.violation_count == 0


def test_late_beyond_fence_keeps_genuine_policy_time_and_auditable_evidence_gap(resident, participant):
    from apps.contests.services.anticheat_config import build_integrity_policy_snapshot
    resident.policy_snapshot = build_integrity_policy_snapshot(resident.contest)
    resident.save()
    from uuid import uuid4
    from apps.contests.models import IntegrityBatchAdmission, ExamEvent
    from apps.contests.services.integrity_evidence import build_evidence_delivery, evidence_status_for_event
    command = bind_run(record_event_command(participant), resident)
    receipt = uuid4()
    command["metadata"].update(receipt_batch_id=str(receipt), evidence_gap={
        "reason": "late_beyond_fence", "before_client_ms": command["client_occurred_at_ms"] + 60000,
        "version": "resident-evidence-fence-v1"})
    IntegrityBatchAdmission.objects.create(run=resident, participant=participant, batch_id=receipt,
        attempt_id=participant.integrity_attempt_id, device_id=command["device_id"], body_sha256="a" * 64,
        first_seq=1, last_seq=1, first_received_at=timezone.now())
    client = APIClient()
    path = f"/api/v1/internal/integrity/runs/{resident.id}/commands/"
    for _ in range(2):
        assert client.post(path, {"commands": [command]}, format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token").status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    assert event.client_occurred_at_ms == command["client_occurred_at_ms"]
    assert event.metadata["integrity"]["action"] == "pause"
    assert event.metadata["integrity"]["evidence_gap"]["reason"] == "late_beyond_fence"
    assert not build_evidence_delivery(resident, participant, 9999999999999).pending_commands
    assert evidence_status_for_event(event)["evidence_status"] == "unavailable"


def test_locked_command_scope_rejects_changed_owner_closed_run_and_rotated_credential(resident, participant, settings, tmp_path):
    command = bind_run(record_event_command(participant), resident)
    digest = hashlib.sha256(b"temporary-test-service-token").hexdigest()
    for field, value in (("execution_backend", "legacy"), ("session_state", "closed")):
        original = getattr(resident, field)
        setattr(resident, field, value)
        resident.save()
        with pytest.raises(IntegrityCommandRejected, match="invalid_integrity_run_scope"):
            execute_integrity_command(resident.id, command, authenticated_token_digest="", authenticated_service_digest=digest)
        setattr(resident, field, original)
        resident.save()
    (tmp_path / "service-token").write_text("rotated-test-token")
    with pytest.raises(IntegrityCommandRejected, match="invalid_integrity_run_scope"):
        execute_integrity_command(resident.id, command, authenticated_token_digest="", authenticated_service_digest=digest)


def test_empty_digest_cannot_bypass_resident_authentication(resident, participant):
    with pytest.raises(IntegrityCommandRejected, match="invalid_integrity_run_scope"):
        execute_integrity_command(resident.id, bind_run(record_event_command(participant), resident), authenticated_token_digest="")


def test_signed_descriptors_only_list_current_processable_resident_runs(resident, settings):
    client = APIClient()
    path = "/api/v1/internal/integrity/resident/descriptors/"
    assert client.get(path).status_code == 401
    response = client.get(path, HTTP_AUTHORIZATION="Resident temporary-test-service-token")
    assert response.status_code == 200
    envelope = response.data["descriptors"][0]
    descriptor = json.loads(envelope["body"])
    assert descriptor["protocol"] == "resident-v1"
    assert descriptor["bootstrap"]["run_id"] == str(resident.id)
    assert descriptor["schedule_revision"] == 1
    headers = envelope["headers"]
    public_key = serialization.load_pem_private_key(open(settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE, "rb").read(), password=None).public_key()
    message = f"resident-v1\nPUT\n/v1/runs/{resident.id}\n{resident.id}\n1\n{headers['X-QJudge-Timestamp']}\n".encode() + envelope["body"].encode()
    public_key.verify(base64.b64decode(headers["X-QJudge-Signature"]), message)
    resident.session_state = "closed"
    resident.save()
    assert client.get(path, HTTP_AUTHORIZATION="Resident temporary-test-service-token").data["descriptors"] == []


def test_resident_callback_cannot_use_service_identity_for_legacy_run(resident, participant):
    resident.execution_backend = "legacy"
    resident.save()
    response = APIClient().post(f"/api/v1/internal/integrity/runs/{resident.id}/commands/",
        {"commands": [bind_run(record_event_command(participant), resident)]}, format="json",
        HTTP_AUTHORIZATION="Resident temporary-test-service-token")
    assert response.status_code == 403


def test_repeated_descriptor_generation_has_stable_schedule_and_snapshots(resident, participant):
    from apps.contests.services.integrity_commands import build_resident_descriptor
    first = build_resident_descriptor(resident)
    participant.exam_status = "submitted"
    participant.save()
    second = build_resident_descriptor(resident)
    assert first["bootstrap"]["participants"] != second["bootstrap"]["participants"]
    assert first["schedule_revision"] == second["schedule_revision"] == 1
    assert first["scheduled_end_ms"] == second["scheduled_end_ms"]
    assert first["bootstrap"]["policy_snapshot"] == second["bootstrap"]["policy_snapshot"]


def test_resident_callback_rejects_cross_run_and_cross_contest_participant(resident, participant, owner, student):
    from apps.contests.models import Contest, ContestParticipant
    other = Contest.objects.create(name="Other scope", owner=owner, start_time=timezone.now(), end_time=timezone.now() + timedelta(hours=1))
    foreign = ContestParticipant.objects.create(contest=other, user=student, exam_status="in_progress")
    client = APIClient()
    path = f"/api/v1/internal/integrity/runs/{resident.id}/commands/"
    command = bind_run(record_event_command(foreign), resident)
    assert client.post(path, {"commands": [command]}, format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token").status_code == 422
    command = bind_run(record_event_command(participant), resident)
    command["run_id"] = str(other.id)
    assert client.post(path, {"commands": [command]}, format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token").status_code == 422


def test_resident_service_archive_callback_retains_exact_object_scope(resident, mocker):
    from uuid import uuid4
    mocker.patch("apps.contests.services.integrity_commands.generate_archive_put_url", return_value="https://storage.example/test-upload")
    path = f"/api/v1/internal/integrity/runs/{resident.id}/commands/"
    command = {"command_id": str(uuid4()), "run_id": str(resident.id), "kind": "create_archive_upload",
        "metadata": {"object_key": f"runs/{resident.id}/generation-1/segments/00000001.journal.gz",
                     "sha256": "a" * 64, "byte_length": 1234, "content_type": "application/gzip", "generation": 1}}
    client = APIClient()
    result = client.post(path, {"commands": [command]}, format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token")
    assert result.status_code == 200
    assert result.data["archive_uploads"][0]["object_key"] == command["metadata"]["object_key"]
    command["metadata"]["object_key"] = f"runs/{uuid4()}/generation-1/segments/00000001.journal.gz"
    assert client.post(path, {"commands": [command]}, format="json", HTTP_AUTHORIZATION="Resident temporary-test-service-token").status_code == 422
