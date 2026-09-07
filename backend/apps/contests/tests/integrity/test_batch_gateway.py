import base64
import json
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.parse import urlparse
from uuid import uuid4

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

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
from apps.contests.services.anti_cheat_session import active_session_key
from apps.contests.services.integrity_presence import get_last_checkpoint
from apps.users.models import User


@pytest.fixture
def api_client():
    return APIClient(HTTP_X_DEVICE_ID="device-a")


def make_batch(
    *,
    run_id,
    participant_id,
    device_id="device-a",
    first_seq=1,
    last_seq=1,
    event_type="mouse_leave_triggered",
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


def checkpoint(observations):
    participant = ContestParticipant.objects.get(user__username="gateway-student")
    return {
        "upload_scope": {
            "run_id": observations["run_id"],
            "participant_id": participant.pk,
            "device_id": "device-a",
            "attempt_id": str(participant.integrity_attempt_id),
        },
        "observations": observations,
        "evidence": {
            "manifests": [],
            "completions": [],
            "unavailable": [],
        },
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

        path = urlparse(url).path
        assert path in (self.expected_path, self.expected_path.replace("/batches", "/progress"))
        assert headers["Content-Type"] == "application/json"
        timestamp = headers["X-QJudge-Timestamp"]
        run_id = headers["X-QJudge-Run-Id"]
        revision = headers["X-QJudge-Revision"]
        message = f"resident-v1\nPOST\n{path}\n{run_id}\n{revision}\n{timestamp}\n".encode("ascii") + content
        self.private_key.public_key().verify(
            base64.b64decode(headers["X-QJudge-Signature"], validate=True),
            message,
        )
        self.verified_signature = True
        if path.endswith("/progress"):
            return httpx.Response(200, json={
                **json.loads(content),
                "received_seq": self.response_payload["acked_through_seq"],
                "processed_seq": self.response_payload["acked_through_seq"],
                "commands_drained": True,
                "evidence_fence_version": "resident-evidence-fence-v1",
                "release_evidence_before_ms": self.response_payload.get("release_evidence_before_ms", 0),
            }, headers={"X-QJudge-Protocol": "resident-v1"}, request=request)
        self.received_body = content
        return httpx.Response(
            self.response_status,
            json=self.response_payload,
            headers={"X-QJudge-Protocol": "resident-v1"},
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
    contest = participant.contest
    return ExamIntegrityRun.objects.create(
        contest=contest,
        created_by=contest.owner,
        session_state=ExamIntegrityRun.SessionState.ACTIVE,
        policy_snapshot={},
        registry_snapshot={"version": "registry-v1", "definitions": {}},
        registry_version="registry-v1",
        scheduled_start_at=contest.start_time,
        scheduled_end_at=contest.end_time,
        accept_until=contest.end_time,
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
    monkeypatch,
):
    api_client.force_authenticate(participant.user)
    monkeypatch.setattr(
        "apps.contests.views.exam_integrity.build_evidence_delivery",
        Mock(
            return_value=Mock(
                pending_commands=(),
                release_before_ms=1_785_000_000_000,
            )
        ),
    )
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(batch),
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "acked_through_seq": 42,
        "processed_through_seq": 42,
        "upload_status": "pending",
        "evidence_fence_version": "resident-evidence-fence-v1",
        "pending_commands": [],
        "release_evidence_before_ms": 1_785_000_000_000,
        "uploads": [],
        "completions": [],
        "unavailable": [],
    }
    assert worker_server.verified_signature is True
    assert worker_server.received_body == json.dumps(
        {"batch": batch, "late_unverified": False,
         "attempt_id": str(participant.integrity_attempt_id)},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    api_client.force_authenticate(participant.contest.owner)
    overview = api_client.get(
        f"/api/v1/contests/{running_integrity_run.contest_id}/overview-metrics/"
    )
    assert overview.status_code == 200
    assert overview.json()["online_now"] == 1


@pytest.mark.django_db
def test_batch_gateway_does_not_forward_events_after_submission(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    """The Backend owns exam eligibility; the Worker never sees closed attempts."""
    participant.exam_status = ExamStatus.SUBMITTED
    participant.save(update_fields=["exam_status"])
    api_client.force_authenticate(participant.user)

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
        format="json",
    )

    assert response.status_code == 403
    assert worker_server.request_count == 0


@pytest.mark.django_db
@pytest.mark.parametrize("active_status", (ExamStatus.PAUSED, ExamStatus.LOCKED))
def test_batch_gateway_forwards_events_for_active_monitored_statuses(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
    active_status,
    monkeypatch,
):
    participant.exam_status = active_status
    participant.save(update_fields=["exam_status"])
    api_client.force_authenticate(participant.user)
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/batches",
        response={
            "acked_through_seq": 1,
            "pending_commands": [],
            "release_evidence_before_ms": 0,
        },
    )
    monkeypatch.setattr(
        "apps.contests.views.exam_integrity.build_evidence_delivery",
        lambda *_args, **_kwargs: SimpleNamespace(
            pending_commands=(),
            release_before_ms=0,
        ),
    )

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
        format="json",
    )

    assert response.status_code == 200
    assert worker_server.request_count == 2


@pytest.mark.django_db
def test_batch_gateway_enriches_only_after_durable_worker_ack(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
    monkeypatch,
):
    api_client.force_authenticate(participant.user)
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/batches",
        response={
            "acked_through_seq": 1,
            "pending_commands": [
                {
                    "command_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    "incident_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
                    "event_id": "99",
                    "sources": ["webcam"],
                    "start_at_ms": 7_000,
                    "end_at_ms": 8_000,
                },
            ],
            "release_evidence_before_ms": 7_000,
        },
    )
    projection = Mock(
        pending_commands=(
            {
                "command_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "incident_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "event_id": "17",
                "sources": ["screen_share"],
                "start_at_ms": 1_000,
                "end_at_ms": 2_000,
            },
        ),
        release_before_ms=900,
    )
    build_delivery = Mock(return_value=projection)
    monkeypatch.setattr(
        "apps.contests.views.exam_integrity.build_evidence_delivery",
        build_delivery,
    )

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "acked_through_seq": 1,
        "processed_through_seq": 1,
        "upload_status": "pending",
        "evidence_fence_version": "resident-evidence-fence-v1",
        "pending_commands": list(projection.pending_commands),
        "release_evidence_before_ms": 900,
        "uploads": [],
        "completions": [],
        "unavailable": [],
    }
    build_delivery.assert_called_once()
    assert build_delivery.call_args.args[:2] == (
        running_integrity_run,
        participant,
    )


@pytest.mark.django_db
def test_batch_gateway_does_not_project_evidence_without_worker_ack(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
    monkeypatch,
):
    api_client.force_authenticate(participant.user)
    worker_server.disconnect()
    build_delivery = Mock()
    monkeypatch.setattr(
        "apps.contests.views.exam_integrity.build_evidence_delivery",
        build_delivery,
    )

    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
        format="json",
    )

    assert response.status_code == 503
    build_delivery.assert_not_called()


@pytest.mark.django_db
def test_batch_gateway_never_acks_or_mutates_state_when_worker_is_unavailable(
    api_client,
    running_integrity_run,
    participant,
    worker_server,
):
    api_client.force_authenticate(participant.user)
    worker_server.disconnect()
    response = api_client.post(
        (
            f"/api/v1/contests/{running_integrity_run.contest_id}"
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
            first_seq=1,
            last_seq=3,
        )),
        format="json",
    )

    assert response.status_code == 503
    assert "acked_through_seq" not in response.json()
    assert worker_server.request_count == 1
    assert ExamEvent.objects.count() == 0
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.IN_PROGRESS
    assert participant.violation_count == 0
    assert get_last_checkpoint(
        running_integrity_run.contest_id,
        participant.user_id,
    ) is None


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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=another_participant.id + 1,
            device_id="borrowed-device",
        )),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(batch),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(batch),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(batch),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(batch),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(batch),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
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
            "/exam/integrity/checkpoints/"
        ),
        checkpoint(make_batch(
            run_id=running_integrity_run.id,
            participant_id=participant.id,
        )),
        format="json",
    )

    assert response.status_code == 401
    assert worker_server.request_count == 0
