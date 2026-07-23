import base64
import json
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.core.cache import cache
from django.utils import timezone

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamIntegrityRun,
    ExamStatus,
)
from apps.contests.infrastructure.integrity_worker_client import (
    IntegrityWorkerProtocolError,
    IntegrityWorkerRejected,
    IntegrityWorkerUnavailable,
    build_integrity_worker_client,
)
from apps.contests.services.anti_cheat_session import (
    active_session_key,
    heartbeat_key,
)
from apps.users.models import User


def make_batch(
    *,
    run_id,
    participant_id,
    device_id="device-a",
    first_seq=1,
    last_seq=1,
    event_type="tab_hidden",
):
    return {
        "schema_version": 1,
        "batch_id": str(uuid4()),
        "run_id": str(run_id),
        "participant_id": participant_id,
        "device_id": device_id,
        "registry_version": "registry-v1",
        "first_seq": first_seq,
        "last_seq": last_seq,
        "records": [
            {
                "event_id": str(uuid4()),
                "seq": seq,
                "kind": "event",
                "event_type": event_type,
                "event_schema_version": 1,
                "client_occurred_at_ms": 1_785_000_000_000 + seq,
                "client_recorded_at_ms": 1_785_000_000_100 + seq,
                "monotonic_ms": float(seq),
                "payload": {"seq": seq},
                "evidence_descriptors": [],
            }
            for seq in range(first_seq, last_seq + 1)
        ],
        "client_build": "frontend-test",
    }


class WorkerServer:
    def __init__(self, private_key):
        self.private_key = private_key
        self.expected_path = None
        self.response_payload = None
        self.response_status = 200
        self.verified_signature = False
        self.received_body = None
        self.request_count = 0
        self.disconnected = False
        self.timeout = False

    def expect_signed_post(self, path, *, response, status_code=200):
        self.expected_path = path
        self.response_payload = response
        self.response_status = status_code

    def disconnect(self):
        self.disconnected = True

    def time_out(self):
        self.timeout = True

    def post(self, url, *, content, headers, timeout):
        self.request_count += 1
        request = httpx.Request("POST", url, content=content, headers=headers)
        if self.disconnected:
            raise httpx.ConnectError("worker unavailable", request=request)
        if self.timeout:
            raise httpx.ReadTimeout("worker timed out", request=request)

        assert urlparse(url).path == self.expected_path
        assert headers["Content-Type"] == "application/json"
        timestamp = headers["X-QJudge-Timestamp"]
        run_id = headers["X-QJudge-Run-Id"]
        message = (
            run_id.encode("ascii")
            + b"\n"
            + timestamp.encode("ascii")
            + b"\n"
            + content
        )
        self.private_key.public_key().verify(
            base64.b64decode(headers["X-QJudge-Signature"], validate=True),
            message,
        )
        self.verified_signature = True
        self.received_body = content
        return httpx.Response(
            self.response_status,
            json=self.response_payload,
            request=request,
        )


@pytest.fixture
def participant(db):
    teacher = User.objects.create_user(
        username="gateway-teacher",
        email="gateway-teacher@example.com",
        password="password",
        role="teacher",
    )
    student = User.objects.create_user(
        username="gateway-student",
        email="gateway-student@example.com",
        password="password",
        role="student",
    )
    now = timezone.now()
    contest = Contest.objects.create(
        name="Integrity gateway",
        owner=teacher,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )
    resolved = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=now,
    )
    cache.set(
        active_session_key(contest.id, student.id),
        {
            "contest_id": str(contest.id),
            "participant_id": resolved.id,
            "user_id": student.id,
            "device_id": "device-a",
        },
        timeout=300,
    )
    return resolved


@pytest.fixture
def another_participant(participant):
    user = User.objects.create_user(
        username="gateway-other-student",
        email="gateway-other-student@example.com",
        password="password",
        role="student",
    )
    return ContestParticipant.objects.create(
        contest=participant.contest,
        user=user,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=timezone.now(),
    )


@pytest.fixture
def running_integrity_run(participant):
    return ExamIntegrityRun.objects.create(
        contest=participant.contest,
        created_by=participant.contest.owner,
        compute_state=ExamIntegrityRun.ComputeState.RUNNING,
        policy_snapshot={},
        registry_snapshot={"version": "registry-v1", "definitions": {}},
        registry_version="registry-v1",
        worker_image="integrity-worker:test",
        worker_url="http://integrity-worker.test",
    )


@pytest.fixture
def worker_server(tmp_path, settings, monkeypatch):
    private_key = Ed25519PrivateKey.generate()
    key_path = Path(tmp_path) / "worker-signing-key"
    key_path.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = str(key_path)
    server = WorkerServer(private_key)
    monkeypatch.setattr(httpx, "post", server.post)
    return server


@pytest.mark.django_db
def test_batch_gateway_signs_exact_body_and_returns_worker_ack(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    api_client.force_authenticate(participant.user)
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/batches",
        response={
            "acked_through_seq": 42,
            "pending_commands": [],
            "release_evidence_before_ms": 1_785_000_000_000,
        },
    )
    batch = make_batch(
        run_id=running_integrity_run.id,
        participant_id=participant.id,
        first_seq=40,
        last_seq=42,
        event_type="future_detector_signal",
    )

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        batch,
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "acked_through_seq": 42,
        "pending_commands": [],
        "release_evidence_before_ms": 1_785_000_000_000,
    }
    assert worker_server.verified_signature is True
    assert worker_server.received_body == json.dumps(
        batch,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


@pytest.mark.django_db
def test_worker_stop_signs_exact_empty_body_and_validates_manifest(
    running_integrity_run,
    worker_server,
):
    manifest = {
        "archived": True,
        "manifest_key": (
            f"runs/{running_integrity_run.id}/generation-1/manifest.json"
        ),
        "manifest_sha256": "ab" * 32,
    }
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/control/stop",
        response=manifest,
    )

    result = build_integrity_worker_client().request_stop(running_integrity_run)

    assert result == manifest
    assert worker_server.verified_signature is True
    assert worker_server.received_body == b""


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    (
        {
            "archived": True,
            "manifest_key": "manifest.json",
            "manifest_sha256": "a" * 64,
            "extra": True,
        },
        {
            "archived": False,
            "manifest_key": "manifest.json",
            "manifest_sha256": "a" * 64,
        },
        {
            "archived": True,
            "manifest_key": " ",
            "manifest_sha256": "a" * 64,
        },
        {
            "archived": True,
            "manifest_key": "manifest.json",
            "manifest_sha256": "not-a-sha256",
        },
    ),
)
def test_worker_stop_rejects_non_exact_success_envelopes(
    running_integrity_run,
    worker_server,
    payload,
):
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/control/stop",
        response=payload,
    )

    with pytest.raises(IntegrityWorkerProtocolError):
        build_integrity_worker_client().request_stop(running_integrity_run)


@pytest.mark.django_db
@pytest.mark.parametrize("worker_status", (502, 503, 504))
def test_worker_stop_maps_retryable_failures_to_unavailable(
    running_integrity_run,
    worker_server,
    worker_status,
):
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/control/stop",
        response={"detail": "temporarily unavailable"},
        status_code=worker_status,
    )

    with pytest.raises(IntegrityWorkerUnavailable):
        build_integrity_worker_client().request_stop(running_integrity_run)


@pytest.mark.django_db
@pytest.mark.parametrize("worker_status", (409, 422, 507))
def test_worker_stop_preserves_valid_worker_rejections(
    running_integrity_run,
    worker_server,
    worker_status,
):
    payload = {"detail": "stop rejected"}
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/control/stop",
        response=payload,
        status_code=worker_status,
    )

    with pytest.raises(IntegrityWorkerRejected) as caught:
        build_integrity_worker_client().request_stop(running_integrity_run)

    assert caught.value.status_code == worker_status
    assert caught.value.payload == payload


@pytest.mark.django_db
def test_batch_gateway_never_acks_or_mutates_state_when_worker_is_unavailable(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    api_client.force_authenticate(participant.user)
    worker_server.disconnect()
    heartbeat_cache_key = heartbeat_key(
        running_integrity_run.contest_id,
        participant.user_id,
    )
    cache.set(heartbeat_cache_key, "unchanged", timeout=300)

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
            first_seq=1,
            last_seq=3,
        ),
        format="json",
    )

    assert response.status_code == 503
    assert "acked_through_seq" not in response.json()
    assert worker_server.request_count == 1
    assert ExamEvent.objects.count() == 0
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.IN_PROGRESS
    assert participant.violation_count == 0
    assert cache.get(heartbeat_cache_key) == "unchanged"


@pytest.mark.django_db
def test_batch_gateway_rejects_user_run_or_device_mismatch(
    api_client,
    running_integrity_run,
    another_participant,
    worker_server,
):
    api_client.force_authenticate(another_participant.user)

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        make_batch(
            run_id=running_integrity_run.id,
            participant_id=another_participant.id + 1,
            device_id="borrowed-device",
        ),
        format="json",
    )

    assert response.status_code == 403
    assert worker_server.request_count == 0


@pytest.mark.django_db
@pytest.mark.parametrize("mismatch", ("run", "participant", "device"))
def test_batch_gateway_rejects_each_identity_dimension_before_proxying(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
    mismatch,
):
    api_client.force_authenticate(participant.user)
    batch = make_batch(
        run_id=running_integrity_run.id,
        participant_id=participant.id,
    )
    if mismatch == "run":
        batch["run_id"] = str(uuid4())
    elif mismatch == "participant":
        batch["participant_id"] = participant.id + 10_000
    else:
        batch["device_id"] = "borrowed-device"

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        batch,
        format="json",
    )

    assert response.status_code == 403
    assert worker_server.request_count == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("status_code", "payload"),
    (
        (409, {"detail": "batch conflict"}),
        (422, {"detail": "invalid event batch"}),
    ),
)
def test_batch_gateway_propagates_valid_worker_rejections(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
    status_code,
    payload,
):
    api_client.force_authenticate(participant.user)
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/batches",
        response=payload,
        status_code=status_code,
    )

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        ),
        format="json",
    )

    assert response.status_code == status_code
    assert response.json() == payload


@pytest.mark.django_db
@pytest.mark.parametrize("worker_status", (502, 503, 504))
def test_batch_gateway_maps_retryable_worker_statuses_to_503_without_ack(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
    worker_status,
):
    api_client.force_authenticate(participant.user)
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/batches",
        response={"detail": "worker unavailable"},
        status_code=worker_status,
    )

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        ),
        format="json",
    )

    assert response.status_code == 503
    assert "acked_through_seq" not in response.json()
    assert worker_server.request_count == 1


@pytest.mark.django_db
def test_batch_gateway_does_not_retry_worker_timeout(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    api_client.force_authenticate(participant.user)
    worker_server.time_out()

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        ),
        format="json",
    )

    assert response.status_code == 503
    assert "acked_through_seq" not in response.json()
    assert worker_server.request_count == 1


@pytest.mark.django_db
def test_batch_gateway_rejects_noncontiguous_sequences_before_proxying(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    api_client.force_authenticate(participant.user)
    batch = make_batch(
        run_id=running_integrity_run.id,
        participant_id=participant.id,
        first_seq=1,
        last_seq=2,
    )
    batch["records"][1]["seq"] = 3
    batch["last_seq"] = 3

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        batch,
        format="json",
    )

    assert response.status_code == 400
    assert worker_server.request_count == 0


@pytest.mark.django_db
def test_batch_gateway_rejects_payload_over_32_kib_before_proxying(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    api_client.force_authenticate(participant.user)
    batch = make_batch(
        run_id=running_integrity_run.id,
        participant_id=participant.id,
    )
    batch["records"][0]["payload"] = {"blob": "x" * (32 * 1024)}

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        batch,
        format="json",
    )

    assert response.status_code == 400
    assert worker_server.request_count == 0


@pytest.mark.django_db
def test_batch_gateway_rejects_encoded_batch_over_one_mib_before_proxying(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    api_client.force_authenticate(participant.user)
    batch = make_batch(
        run_id=running_integrity_run.id,
        participant_id=participant.id,
        first_seq=1,
        last_seq=33,
    )
    for record in batch["records"]:
        record["payload"] = {"blob": "x" * (32 * 1024 - 16)}

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        batch,
        format="json",
    )

    assert response.status_code == 400
    assert worker_server.request_count == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("field", "invalid"),
    (
        ("schema_version", True),
        ("participant_id", "1"),
        ("unsupported", "must-not-be-ignored"),
    ),
)
def test_batch_gateway_rejects_coercion_and_unknown_batch_fields(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
    field,
    invalid,
):
    api_client.force_authenticate(participant.user)
    batch = make_batch(
        run_id=running_integrity_run.id,
        participant_id=participant.id,
    )
    batch[field] = invalid

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        batch,
        format="json",
    )

    assert response.status_code == 400
    assert worker_server.request_count == 0


@pytest.mark.django_db
def test_batch_gateway_maps_invalid_worker_ack_to_502_without_ack(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    api_client.force_authenticate(participant.user)
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/batches",
        response={
            "acked_through_seq": "1",
            "pending_commands": [],
            "release_evidence_before_ms": 0,
        },
    )

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        ),
        format="json",
    )

    assert response.status_code == 502
    assert "acked_through_seq" not in response.json()


@pytest.mark.django_db
def test_batch_gateway_requires_authentication(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/batches/"
        ),
        make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        ),
        format="json",
    )

    assert response.status_code == 401
    assert worker_server.request_count == 0
