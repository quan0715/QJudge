import base64
import hashlib
import uuid
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.db import OperationalError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.integrity.registry import REGISTRY_VERSION, build_registry_snapshot
from apps.contests.models import (
    Contest,
    ContestActivity,
    ContestParticipant,
    ExamEvent,
    ExamIntegrityRun,
    ExamStatus,
)


TOKEN = "resident-service-token-for-tests"
RECEIPT_BATCH_ID = uuid.UUID("9f7f1f2e-0000-4000-8000-00000000ba01")


@pytest.fixture(autouse=True)
def resident_service_credential(tmp_path, settings):
    """Internal callbacks authenticate as the resident service, not per-Run."""
    token_file = tmp_path / "resident-service-token"
    token_file.write_text(TOKEN)
    settings.INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE = str(token_file)
    return token_file


@pytest.fixture
def due_schedule(running_integrity_run, participant):
    end = timezone.now() - timedelta(seconds=1)
    Contest.objects.filter(pk=participant.contest_id).update(end_time=end)
    participant.contest.end_time = end
    running_integrity_run.scheduled_end_at = end
    running_integrity_run.save(update_fields=["scheduled_end_at"])


@pytest.mark.django_db
def test_retired_end_command_is_rejected_after_extension(internal_client, running_integrity_run, participant):
    from apps.contests.services.exam_schedule import update_exam_schedule
    command = bind_run(auto_submit_command(participant), running_integrity_run)
    update_exam_schedule(participant.contest_id, start_time=participant.contest.start_time,
                         end_time=participant.contest.end_time + timedelta(minutes=20), actor=participant.contest.owner)
    response = internal_client.post_commands(running_integrity_run, [command])
    assert response.status_code == 422, response.json()
    assert response.json()["code"] == "unsupported_command_kind"
    assert "accepted_command_ids" not in response.json()
    participant.refresh_from_db()
    assert participant.exam_status == "in_progress"
    assert not ExamEvent.objects.filter(integrity_command_id=command["command_id"]).exists()


@pytest.mark.django_db
def test_retired_early_end_command_is_rejected(internal_client, running_integrity_run, participant):
    command = bind_run(auto_submit_command(participant), running_integrity_run)
    response = internal_client.post_commands(running_integrity_run, [command])
    assert response.status_code == 422
    assert response.json()["code"] == "unsupported_command_kind"
    participant.refresh_from_db()
    assert participant.exam_status == "in_progress"


@pytest.mark.django_db
def test_retired_run_local_auto_submit_is_rejected_even_when_exam_is_due(
    internal_client,
    running_integrity_run,
    participant,
    due_schedule,
    mocker,
):
    """Only the backend's own due-exam sweep owns schedule submission."""
    finalizer = mocker.patch(
        "apps.contests.services.integrity_commands.finalize_submission",
    )
    command = bind_run(auto_submit_command(participant), running_integrity_run)

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])

    assert first.status_code == second.status_code == 422
    assert first.json() == second.json()
    assert first.json()["code"] == "unsupported_command_kind"
    assert "accepted_command_ids" not in first.json()
    finalizer.assert_not_called()
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.IN_PROGRESS
    assert not ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).exists()
    assert not ContestActivity.objects.filter(
        contest=participant.contest,
        user=participant.user,
        action_type="auto_submit",
    ).exists()


@pytest.mark.django_db
def test_backend_due_exam_sweep_still_auto_submits(participant, due_schedule):
    """Removing Run-local deadlines must not remove auto-submission itself."""
    from apps.contests.services.exam_schedule import finalize_due_exam

    assert finalize_due_exam(participant.contest_id, now=timezone.now()) == 1

    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.SUBMITTED
    assert participant.submit_reason == "Auto-submitted: scheduled exam end"


@pytest.mark.django_db
def test_explicit_registry_submit_action_still_finalizes_once(
    internal_client, running_integrity_run, participant,
):
    """Retire only the scheduler command, not a frozen registry's submit action."""
    running_integrity_run.registry_snapshot["definitions"]["listener_integrity"]["action"] = "submit"
    running_integrity_run.save(update_fields=["registry_snapshot"])
    admit_receipt_batch(running_integrity_run, participant)
    command = bind_run(record_event_command(
        participant, event_type="listener_tampered", action="submit",
    ), running_integrity_run)

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"accepted_command_ids": [command["command_id"]]}
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.SUBMITTED
    assert participant.submit_reason == "Auto-submitted: listener_tampered"
    assert ContestActivity.objects.filter(
        contest=participant.contest, user=participant.user, action_type="auto_submit",
    ).count() == 1


@pytest.fixture
def owner(db, django_user_model):
    return django_user_model.objects.create_user(
        username="integrity-command-owner",
        email="integrity-command-owner@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def student(db, django_user_model):
    return django_user_model.objects.create_user(
        username="integrity-command-student",
        email="integrity-command-student@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def contest(owner):
    now = timezone.now()
    return Contest.objects.create(
        name="Integrity command contest",
        owner=owner,
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        status="published",
        contest_type="paper_exam",
        cheat_detection_enabled=True,
    )


@pytest.fixture
def participant(contest, student):
    return ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=timezone.now(),
    )


@pytest.fixture
def submitted_participant(contest, django_user_model):
    user = django_user_model.objects.create_user(
        username="submitted-integrity-command-student",
        email="submitted-integrity-command-student@example.com",
        password="pass",
        role="student",
    )
    return ContestParticipant.objects.create(
        contest=contest,
        user=user,
        exam_status=ExamStatus.SUBMITTED,
        started_at=timezone.now() - timedelta(minutes=20),
        left_at=timezone.now() - timedelta(minutes=1),
        violation_count=4,
        submit_reason="Submitted exam",
    )


@pytest.fixture
def running_integrity_run(contest, owner):
    return ExamIntegrityRun.objects.create(
        contest=contest,
        created_by=owner,
        session_state=ExamIntegrityRun.SessionState.ACTIVE,
        registry_version=REGISTRY_VERSION,
        registry_snapshot=build_registry_snapshot(),
        policy_snapshot={
            "version": 1,
            "suspect_after_ms": 15_000,
            "disconnected_after_ms": 60_000,
        },
        scheduled_start_at=contest.start_time,
        scheduled_end_at=contest.end_time,
        accept_until=contest.end_time,
    )


class InternalClient:
    def __init__(self, token=TOKEN):
        self.client = APIClient()
        self.token = token

    @staticmethod
    def commands_url(run):
        return f"/api/v1/internal/integrity/runs/{run.id}/commands/"

    def post_commands(self, run, commands, *, token=None):
        selected_token = self.token if token is None else token
        headers = (
            {}
            if selected_token is False
            else {"HTTP_AUTHORIZATION": f"Resident {selected_token}"}
        )
        return self.client.post(
            self.commands_url(run),
            {"commands": commands},
            format="json",
            **headers,
        )


@pytest.fixture
def internal_client():
    return InternalClient()


def record_event_command(
    participant,
    *,
    command_id="55555555-5555-5555-5555-555555555555",
    delayed_delivery=False,
    action="pause",
    event_type="exit_fullscreen",
):
    return {
        "command_id": command_id,
        "run_id": None,
        "kind": "record_event",
        "participant_id": participant.id,
        "device_id": "device-a",
        "incident_id": "66666666-6666-6666-6666-666666666666",
        "event_type": event_type,
        "action": action,
        "client_occurred_at_ms": 1_785_000_000_000,
        "received_at_server_ms": 1_785_000_001_000,
        "delayed_delivery": delayed_delivery,
        "evidence": {
            "sources": ["screen_share"],
            "before_ms": 10_000,
            "after_ms": 10_000,
        },
        "metadata": {"module": "screen_share", "receipt_batch_id": str(RECEIPT_BATCH_ID)},
    }


def admit_receipt_batch(run, participant, *, device_id="device-a", batch_id=None):
    """Record the gateway admission a trusted resident command refers back to.

    Without it the command is late/unverified and is downgraded to audit, which
    is the contract: a decision may not act on a receipt the backend never saw.
    """
    from apps.contests.models import IntegrityBatchAdmission

    return IntegrityBatchAdmission.objects.create(
        run=run,
        participant=participant,
        batch_id=batch_id or RECEIPT_BATCH_ID,
        attempt_id=participant.integrity_attempt_id,
        device_id=device_id,
        body_sha256="b" * 64,
        first_seq=1,
        last_seq=1,
        first_received_at=timezone.now(),
        late_unverified=False,
    )


def auto_submit_command(
    participant,
    *,
    command_id="77777777-7777-7777-7777-777777777777",
):
    scheduled_end_ms = int(participant.contest.end_time.timestamp() * 1000)
    return {
        "command_id": command_id,
        "run_id": None,
        "kind": "auto_submit",
        "participant_id": participant.id,
        "device_id": "scheduler",
        "incident_id": None,
        "event_type": "scheduled_end",
        "action": "submit",
        "client_occurred_at_ms": scheduled_end_ms,
        "received_at_server_ms": scheduled_end_ms,
        "delayed_delivery": False,
        "evidence": {},
        "metadata": {"scheduled_end_ms": scheduled_end_ms},
    }


def bind_run(command, run):
    return {**command, "run_id": str(run.id)}


@pytest.mark.django_db
def test_record_event_command_is_idempotent_and_uses_strict_worker_envelope(
    internal_client,
    running_integrity_run,
    participant,
):
    admit_receipt_batch(running_integrity_run, participant)
    command = bind_run(record_event_command(participant), running_integrity_run)

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])

    expected = {
        "accepted_command_ids": [command["command_id"]],
    }
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == expected
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    assert event.metadata == {
        "module": "screen_share",
        "receipt_batch_id": str(RECEIPT_BATCH_ID),
        "integrity": {
            "action": "pause",
            "definition_id": "fullscreen_integrity",
            "device_id": "device-a",
            "evidence": {
                "sources": ["screen_share"],
                "before_ms": 10_000,
                "after_ms": 10_000,
            },
            "phase": "escalated",
            "requested_action": "pause",
            "late_unverified": False,
            "command_fingerprint": event.metadata["integrity"]["command_fingerprint"],
        },
    }
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.PAUSED
    assert participant.violation_count == 1


@pytest.mark.django_db
def test_record_event_replay_rejects_every_changed_command_semantic(
    internal_client,
    running_integrity_run,
    participant,
):
    admit_receipt_batch(running_integrity_run, participant)
    command = bind_run(record_event_command(participant), running_integrity_run)
    assert internal_client.post_commands(
        running_integrity_run,
        [command],
    ).status_code == 200

    changed_commands = [
        {**command, "action": "audit"},
        {
            **command,
            "incident_id": "88888888-8888-8888-8888-888888888888",
        },
        {
            **command,
            "client_occurred_at_ms": command["client_occurred_at_ms"] + 1,
        },
        {
            **command,
            "received_at_server_ms": command["received_at_server_ms"] + 1,
        },
        {
            **command,
            "worker_processed_at_ms": command["received_at_server_ms"] + 2,
        },
        {**command, "device_id": "device-b"},
        {**command, "evidence": {**command["evidence"], "before_ms": 9_999}},
        {**command, "metadata": {"module": "webcam"}},
    ]

    for changed in changed_commands:
        response = internal_client.post_commands(
            running_integrity_run,
            [changed],
        )
        assert response.status_code == 422
        assert response.json() == {
            "code": "command_id_conflict",
            "command_id": command["command_id"],
        }

    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1


@pytest.mark.django_db
def test_replay_without_command_fingerprint_is_rejected(
    internal_client,
    running_integrity_run,
    submitted_participant,
):
    command = bind_run(
        record_event_command(submitted_participant),
        running_integrity_run,
    )
    command["worker_processed_at_ms"] = (
        command["received_at_server_ms"] + 1
    )
    assert internal_client.post_commands(
        running_integrity_run,
        [command],
    ).status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    metadata = dict(event.metadata)
    integrity = dict(metadata["integrity"])
    assert integrity["action"] == "audit"
    assert integrity["requested_action"] == command["action"]
    integrity.pop("command_fingerprint")
    metadata["integrity"] = integrity
    event.metadata = metadata
    event.save(update_fields=["metadata"])

    response = internal_client.post_commands(running_integrity_run, [command])

    assert response.status_code == 422
    assert response.json() == {
        "code": "command_id_conflict",
        "command_id": command["command_id"],
    }
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("event_type", "action", "expected_violations"),
    (
        ("listener_tampered", "pause", 1),
        ("clipboard_action", "record", 1),
        ("exit_fullscreen_triggered", "record", 0),
        ("exam_entered", "record", 0),
        ("exam_submit_initiated", "record", 0),
    ),
)
def test_violation_count_distinguishes_direct_actions_from_incident_opening(
    internal_client,
    running_integrity_run,
    participant,
    event_type,
    action,
    expected_violations,
):
    admit_receipt_batch(running_integrity_run, participant)
    command = bind_run(
        record_event_command(
            participant,
            command_id=str(uuid4()),
            event_type=event_type,
            action=action,
        ),
        running_integrity_run,
    )

    response = internal_client.post_commands(running_integrity_run, [command])

    assert response.status_code == 200
    participant.refresh_from_db()
    assert participant.violation_count == expected_violations
    from apps.contests.services.integrity_event_projection import event_penalized
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    assert event_penalized(event) is bool(expected_violations)


@pytest.mark.django_db
def test_late_or_submitted_event_is_audit_only(
    internal_client,
    running_integrity_run,
    submitted_participant,
):
    command = bind_run(
        record_event_command(
            submitted_participant,
            delayed_delivery=True,
            action="audit",
        ),
        running_integrity_run,
    )

    response = internal_client.post_commands(running_integrity_run, [command])

    submitted_participant.refresh_from_db()
    assert response.status_code == 200
    assert submitted_participant.exam_status == ExamStatus.SUBMITTED
    assert submitted_participant.violation_count == 4
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    assert event.delayed_delivery is True
    assert event.integrity_run_id == running_integrity_run.id


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("event_type", "action"),
    (
        ("connectivity_suspect", "record"),
        ("connectivity_timeout", "pause"),
        ("connectivity_restored", "audit"),
    ),
)
def test_submitted_participant_does_not_receive_later_connectivity_transitions(
    internal_client,
    running_integrity_run,
    submitted_participant,
    event_type,
    action,
):
    command = bind_run(
        record_event_command(
            submitted_participant,
            event_type=event_type,
            action=action,
        ),
        running_integrity_run,
    )
    command["evidence"] = {}
    command["metadata"] = {
        "timing_basis": "server_receipt",
        "last_received_at_server_ms": 1_785_000_000_000,
        "transition_at_server_ms": 1_785_000_060_000,
    }

    response = internal_client.post_commands(running_integrity_run, [command])

    assert response.status_code == 200
    assert response.json() == {
        "accepted_command_ids": [command["command_id"]],
    }
    assert not ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).exists()


@pytest.mark.django_db
def test_command_participant_and_run_scope_are_closed_world(
    internal_client,
    running_integrity_run,
    participant,
):
    wrong_run = bind_run(record_event_command(participant), running_integrity_run)
    wrong_run["run_id"] = str(uuid4())
    wrong_participant = bind_run(
        record_event_command(participant, command_id=str(uuid4())),
        running_integrity_run,
    )
    wrong_participant["participant_id"] = participant.id + 10_000

    run_response = internal_client.post_commands(
        running_integrity_run,
        [wrong_run],
    )
    participant_response = internal_client.post_commands(
        running_integrity_run,
        [wrong_participant],
    )

    assert run_response.status_code == participant_response.status_code == 422
    assert run_response.json()["code"] == "command_run_scope_mismatch"
    assert participant_response.json()["code"] == "participant_run_scope_mismatch"
    assert ExamEvent.objects.count() == 0


@pytest.mark.django_db
def test_command_batch_requires_between_one_and_one_hundred_commands(
    internal_client,
    running_integrity_run,
):
    empty = internal_client.post_commands(running_integrity_run, [])
    too_many = internal_client.post_commands(
        running_integrity_run,
        [
            {
                "command_id": str(uuid4()),
                "run_id": str(running_integrity_run.id),
                "kind": "update_run_checkpoint",
                "metadata": {},
            }
            for _ in range(101)
        ],
    )

    assert empty.status_code == too_many.status_code == 422
    assert empty.json()["code"] == too_many.json()["code"] == (
        "invalid_command_batch_size"
    )


@pytest.mark.django_db
def test_checkpoint_updates_monotonically_and_replay_is_safe(
    internal_client,
    running_integrity_run,
):
    command_id = str(uuid4())
    newer_heartbeat = timezone.now()
    command = {
        "command_id": command_id,
        "run_id": str(running_integrity_run.id),
        "kind": "update_run_checkpoint",
        "metadata": {
            "heartbeat_at_ms": int(newer_heartbeat.timestamp() * 1000),
            "received_counts": {"batches": 8, "records": 20},
            "processed_counts": {"records": 18},
            "archived_counts": {"segments": 2},
            "health": "unhealthy",
            "warnings": ["archive_upload_failed", "journal_capacity_low"],
            "worker_version": "worker-v9",
            "archive_generation": 1,
        },
    }

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])
    stale = {
        **command,
        "command_id": str(uuid4()),
        "metadata": {
            **command["metadata"],
            "heartbeat_at_ms": int(
                (newer_heartbeat - timedelta(minutes=1)).timestamp() * 1000
            ),
            "received_counts": {"batches": 3, "records": 5},
            "processed_counts": {"records": 4},
            "archived_counts": {"segments": 1},
            "worker_version": "worker-old",
            "archive_generation": 0,
        },
    }
    stale_response = internal_client.post_commands(running_integrity_run, [stale])

    assert first.status_code == second.status_code == stale_response.status_code == 200
    running_integrity_run.refresh_from_db()
    assert running_integrity_run.received_counts == {"batches": 8, "records": 20}
    assert running_integrity_run.processed_counts == {"records": 18}
    assert running_integrity_run.archived_counts == {"segments": 2}
    assert running_integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert running_integrity_run.warnings == [
        "archive_upload_failed",
        "journal_capacity_low",
    ]
    assert running_integrity_run.worker_version == "worker-v9"
    assert running_integrity_run.archive_generation == 1
    assert running_integrity_run.last_worker_heartbeat_at >= (
        newer_heartbeat - timedelta(milliseconds=1)
    )


@pytest.mark.django_db
def test_warning_checkpoint_from_current_worker_command_shape_is_accepted(
    internal_client,
    running_integrity_run,
    participant,
):
    command = {
        "command_id": str(uuid4()),
        "run_id": str(running_integrity_run.id),
        "kind": "update_run_checkpoint",
        "participant_id": participant.id,
        "device_id": "device-a",
        "incident_id": None,
        "event_type": "registry_version_mismatch",
        "action": "audit",
        "client_occurred_at_ms": 0,
        "received_at_server_ms": 1_785_000_001_000,
        "delayed_delivery": False,
        "evidence": {},
        "metadata": {
            "code": "registry_version_mismatch",
            "received_registry_version": "old",
            "expected_registry_version": running_integrity_run.registry_version,
        },
    }

    response = internal_client.post_commands(running_integrity_run, [command])

    assert response.status_code == 200
    running_integrity_run.refresh_from_db()
    assert running_integrity_run.warnings == ["registry_version_mismatch"]


@pytest.mark.django_db
def test_retired_archive_upload_command_is_not_accepted(
    internal_client, running_integrity_run, mocker,
):
    presign = mocker.patch("apps.contests.services.integrity_commands.generate_archive_put_url")
    command = {"command_id": str(uuid4()), "run_id": str(running_integrity_run.pk),
        "kind": "create_archive_upload", "metadata": {}}
    response = internal_client.post_commands(running_integrity_run, [command])
    assert response.status_code == 422
    assert response.json()["code"] == "unsupported_command_kind"
    presign.assert_not_called()


def test_r2_presign_signs_base64_sha256_checksum_header(settings, mocker):
    from apps.contests.services.integrity_commands import generate_archive_put_url

    digest = "ab" * 32
    expected_checksum = base64.b64encode(bytes.fromhex(digest)).decode("ascii")
    client = mocker.Mock()
    client.generate_presigned_url.return_value = "https://r2.example/presigned"
    mocker.patch(
        "apps.contests.services.integrity_commands.get_s3_client",
        return_value=client,
    )
    settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS = 300

    result = generate_archive_put_url(
        bucket="integrity-archive",
        object_key="runs/run/generation-1/manifest.json",
        content_type="application/json",
        sha256=digest,
        byte_length=123,
    )

    assert result == "https://r2.example/presigned"
    client.generate_presigned_url.assert_called_once_with(
        ClientMethod="put_object",
        Params={
            "Bucket": "integrity-archive",
            "Key": "runs/run/generation-1/manifest.json",
            "ContentType": "application/json",
            "ContentLength": 123,
            "ChecksumSHA256": expected_checksum,
        },
        ExpiresIn=300,
    )


@pytest.mark.django_db
def test_manifest_publish_command_is_refused_for_resident_archiving(
    internal_client,
    running_integrity_run,
):
    """Archiving commits through the signed /finalize control phases.

    A replayable outbox command cannot carry the revision compare-and-set that
    an extension race requires, so the backend refuses the command outright
    rather than letting a stale manifest land.
    """
    object_key = f"runs/{running_integrity_run.id}/generation-2/manifest.json"
    command = {
        "command_id": str(uuid4()),
        "run_id": str(running_integrity_run.id),
        "kind": "publish_archive_manifest",
        "metadata": {
            "object_key": object_key,
            "sha256": "b" * 64,
            "generation": 2,
            "archived_counts": {"segments": 3, "records": 40},
        },
    }

    response = internal_client.post_commands(running_integrity_run, [command])

    assert response.status_code == 422
    assert response.json()["code"] == "unsupported_command_kind"
    running_integrity_run.refresh_from_db()
    assert running_integrity_run.archive_manifest_key == ""
    assert running_integrity_run.data_state == ExamIntegrityRun.DataState.OPEN


@pytest.mark.django_db
def test_database_failure_returns_503_for_unchanged_worker_retry(
    internal_client,
    running_integrity_run,
    participant,
    mocker,
):
    admit_receipt_batch(running_integrity_run, participant)
    command = bind_run(record_event_command(participant), running_integrity_run)
    mocker.patch(
        "apps.contests.views.integrity_internal.execute_integrity_command",
        side_effect=RuntimeError("database credentials must not leak"),
    )

    response = internal_client.post_commands(running_integrity_run, [command])

    assert response.status_code == 503
    assert response.json() == {"code": "integrity_command_temporarily_unavailable"}
    assert "database" not in response.content.decode("utf-8").lower()


@pytest.mark.django_db
def test_commands_auth_query_failure_returns_retryable_503(
    internal_client,
    running_integrity_run,
    mocker,
):
    mocker.patch(
        "apps.contests.views.integrity_internal.authenticate_resident_service",
        side_effect=OperationalError("database credentials must not leak"),
    )

    response = internal_client.post_commands(running_integrity_run, [])

    assert response.status_code == 503
    assert response.json() == {"code": "integrity_command_temporarily_unavailable"}
    assert "database" not in response.content.decode("utf-8").lower()


@pytest.mark.django_db
def test_commands_reject_a_legacy_bearer_token(internal_client, running_integrity_run):
    """Per-Run bearer tokens are gone; only the resident service identity works."""
    response = internal_client.client.post(
        InternalClient.commands_url(running_integrity_run),
        {"commands": []},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {TOKEN}",
    )

    assert response.status_code == 401
    assert response.json() == {"code": "invalid_integrity_run_token"}


def test_command_helpers_never_import_worker_database_clients():
    import apps.contests.services.integrity_commands as commands

    source = __import__("inspect").getsource(commands)
    assert "psycopg" not in source
    assert "django.db" in source
    assert UUID(command_id := "55555555-5555-5555-5555-555555555555")
    assert str(UUID(command_id)) == command_id
