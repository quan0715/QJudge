import base64
import hashlib
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.db import OperationalError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.integrity.registry import build_registry_snapshot
from apps.contests.models import (
    Contest,
    ContestActivity,
    ContestParticipant,
    ExamEvent,
    ExamIntegrityRun,
    ExamStatus,
)


TOKEN = "run-scoped-opaque-token"


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
        compute_state=ExamIntegrityRun.ComputeState.RUNNING,
        registry_version="2026-07-21.2",
        registry_snapshot=build_registry_snapshot(),
        policy_snapshot={
            "version": 1,
            "suspect_after_ms": 15_000,
            "disconnected_after_ms": 60_000,
        },
        worker_image="registry.example/integrity:1",
        token_digest=hashlib.sha256(TOKEN.encode("utf-8")).hexdigest(),
        token_expires_at=timezone.now() + timedelta(hours=1),
        scheduled_start_at=contest.start_time,
        scheduled_end_at=contest.end_time,
    )


class InternalClient:
    def __init__(self, token=TOKEN):
        self.client = APIClient()
        self.token = token

    @staticmethod
    def bootstrap_url(run):
        return f"/api/v1/internal/integrity/runs/{run.id}/bootstrap/"

    @staticmethod
    def commands_url(run):
        return f"/api/v1/internal/integrity/runs/{run.id}/commands/"

    def get_bootstrap(self, run, *, token=None):
        selected_token = self.token if token is None else token
        headers = (
            {}
            if selected_token is False
            else {"HTTP_AUTHORIZATION": f"Bearer {selected_token}"}
        )
        return self.client.get(self.bootstrap_url(run), **headers)

    def post_commands(self, run, commands, *, token=None):
        selected_token = self.token if token is None else token
        headers = (
            {}
            if selected_token is False
            else {"HTTP_AUTHORIZATION": f"Bearer {selected_token}"}
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
        "metadata": {"module": "screen_share"},
    }


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
    command = bind_run(record_event_command(participant), running_integrity_run)

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])

    expected = {
        "accepted_command_ids": [command["command_id"]],
        "archive_uploads": [],
    }
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == expected
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.PAUSED
    assert participant.violation_count == 1


@pytest.mark.django_db
def test_record_event_replay_rejects_every_changed_command_semantic(
    internal_client,
    running_integrity_run,
    participant,
):
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
def test_submitted_legacy_receipt_exact_retry_uses_requested_action(
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
    legacy_metadata = dict(event.metadata)
    legacy_integrity = dict(legacy_metadata["integrity"])
    assert legacy_integrity["action"] == "audit"
    assert legacy_integrity["requested_action"] == command["action"]
    legacy_integrity.pop("command_fingerprint")
    legacy_metadata["integrity"] = legacy_integrity
    event.metadata = legacy_metadata
    event.save(update_fields=["metadata"])

    response = internal_client.post_commands(running_integrity_run, [command])

    assert response.status_code == 200
    assert response.json() == {
        "accepted_command_ids": [command["command_id"]],
        "archive_uploads": [],
    }
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1


@pytest.mark.django_db
def test_submitted_legacy_receipt_changed_replay_remains_conflict(
    internal_client,
    running_integrity_run,
    submitted_participant,
):
    command = bind_run(
        record_event_command(submitted_participant),
        running_integrity_run,
    )
    assert internal_client.post_commands(
        running_integrity_run,
        [command],
    ).status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    legacy_metadata = dict(event.metadata)
    legacy_integrity = dict(legacy_metadata["integrity"])
    assert legacy_integrity["action"] == "audit"
    assert legacy_integrity["requested_action"] == command["action"]
    legacy_integrity.pop("command_fingerprint")
    legacy_metadata["integrity"] = legacy_integrity
    event.metadata = legacy_metadata
    event.save(update_fields=["metadata"])

    response = internal_client.post_commands(
        running_integrity_run,
        [{**command, "device_id": "changed-device"}],
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
@pytest.mark.parametrize(
    "timestamp_field",
    ("received_at_server_ms", "worker_processed_at_ms"),
)
def test_submitted_legacy_receipt_rejects_removed_timestamp(
    internal_client,
    running_integrity_run,
    submitted_participant,
    timestamp_field,
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
    legacy_metadata = dict(event.metadata)
    legacy_integrity = dict(legacy_metadata["integrity"])
    assert legacy_integrity["action"] == "audit"
    assert legacy_integrity["requested_action"] == command["action"]
    legacy_integrity.pop("command_fingerprint")
    legacy_metadata["integrity"] = legacy_integrity
    event.metadata = legacy_metadata
    event.save(update_fields=["metadata"])

    replay = dict(command)
    replay.pop(timestamp_field)
    response = internal_client.post_commands(
        running_integrity_run,
        [replay],
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
@pytest.mark.parametrize(
    "timestamp_field",
    ("received_at_server_ms", "worker_processed_at_ms"),
)
def test_submitted_legacy_receipt_rejects_changed_timestamp(
    internal_client,
    running_integrity_run,
    submitted_participant,
    timestamp_field,
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
    legacy_metadata = dict(event.metadata)
    legacy_integrity = dict(legacy_metadata["integrity"])
    assert legacy_integrity["action"] == "audit"
    assert legacy_integrity["requested_action"] == command["action"]
    legacy_integrity.pop("command_fingerprint")
    legacy_metadata["integrity"] = legacy_integrity
    event.metadata = legacy_metadata
    event.save(update_fields=["metadata"])

    response = internal_client.post_commands(
        running_integrity_run,
        [{**command, timestamp_field: command[timestamp_field] + 1}],
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
@pytest.mark.parametrize(
    ("event_type", "action", "expected_violations"),
    (
        ("listener_tampered", "pause", 1),
        ("clipboard_action", "record", 1),
        ("exit_fullscreen_triggered", "record", 0),
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
def test_auto_submit_uses_existing_finalizer_once_and_never_stops_run(
    internal_client,
    running_integrity_run,
    participant,
    mocker,
):
    from apps.contests.services import integrity_commands

    original = integrity_commands.finalize_submission
    finalizer = mocker.patch(
        "apps.contests.services.integrity_commands.finalize_submission",
        wraps=original,
    )
    command = bind_run(auto_submit_command(participant), running_integrity_run)

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])

    assert first.status_code == second.status_code == 200
    finalizer.assert_called_once()
    participant.refresh_from_db()
    running_integrity_run.refresh_from_db()
    assert participant.exam_status == ExamStatus.SUBMITTED
    assert participant.submit_reason == "Auto-submitted: scheduled exam end"
    assert running_integrity_run.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
        event_type="scheduled_end",
    ).count() == 1
    assert ContestActivity.objects.filter(
        contest=participant.contest,
        user=participant.user,
        action_type="auto_submit",
    ).count() == 1


@pytest.mark.django_db
def test_new_auto_submit_defaults_omitted_received_timestamp(
    internal_client,
    running_integrity_run,
    participant,
):
    command = bind_run(auto_submit_command(participant), running_integrity_run)
    command.pop("received_at_server_ms")

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])

    assert first.status_code == second.status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    assert int(event.server_received_at.timestamp() * 1000) == (
        command["metadata"]["scheduled_end_ms"]
    )
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1


@pytest.mark.django_db
def test_auto_submit_replay_rejects_changed_timestamps_metadata_and_device(
    internal_client,
    running_integrity_run,
    participant,
):
    command = bind_run(auto_submit_command(participant), running_integrity_run)
    assert internal_client.post_commands(
        running_integrity_run,
        [command],
    ).status_code == 200

    changed_commands = [
        {
            **command,
            "received_at_server_ms": command["received_at_server_ms"] + 1,
        },
        {**command, "device_id": "different-scheduler"},
        {
            **command,
            "metadata": {
                "scheduled_end_ms": command["metadata"]["scheduled_end_ms"] + 1,
            },
        },
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
def test_legacy_auto_submit_receipt_accepts_exact_real_worker_retry(
    internal_client,
    running_integrity_run,
    participant,
):
    command = bind_run(auto_submit_command(participant), running_integrity_run)
    assert "worker_processed_at_ms" not in command
    assert internal_client.post_commands(
        running_integrity_run,
        [command],
    ).status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    assert event.worker_processed_at is not None
    legacy_metadata = dict(event.metadata)
    legacy_integrity = dict(legacy_metadata["integrity"])
    legacy_integrity.pop("command_fingerprint")
    legacy_metadata["integrity"] = legacy_integrity
    event.metadata = legacy_metadata
    event.save(update_fields=["metadata"])

    response = internal_client.post_commands(
        running_integrity_run,
        [command],
    )

    assert response.status_code == 200
    assert response.json() == {
        "accepted_command_ids": [command["command_id"]],
        "archive_uploads": [],
    }
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1


@pytest.mark.django_db
def test_legacy_auto_submit_receipt_rejects_removed_explicit_timestamp(
    internal_client,
    running_integrity_run,
    participant,
):
    command = bind_run(auto_submit_command(participant), running_integrity_run)
    assert internal_client.post_commands(
        running_integrity_run,
        [command],
    ).status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    legacy_metadata = dict(event.metadata)
    legacy_integrity = dict(legacy_metadata["integrity"])
    legacy_integrity.pop("command_fingerprint")
    legacy_metadata["integrity"] = legacy_integrity
    event.metadata = legacy_metadata
    event.save(update_fields=["metadata"])
    exact = internal_client.post_commands(
        running_integrity_run,
        [command],
    )
    assert exact.status_code == 200
    replay = dict(command)
    replay.pop("received_at_server_ms")

    response = internal_client.post_commands(
        running_integrity_run,
        [replay],
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
def test_legacy_auto_submit_receipt_rejects_altered_explicit_timestamp(
    internal_client,
    running_integrity_run,
    participant,
):
    command = bind_run(auto_submit_command(participant), running_integrity_run)
    assert internal_client.post_commands(
        running_integrity_run,
        [command],
    ).status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    legacy_metadata = dict(event.metadata)
    legacy_integrity = dict(legacy_metadata["integrity"])
    legacy_integrity.pop("command_fingerprint")
    legacy_metadata["integrity"] = legacy_integrity
    event.metadata = legacy_metadata
    event.save(update_fields=["metadata"])
    exact = internal_client.post_commands(
        running_integrity_run,
        [command],
    )
    assert exact.status_code == 200

    response = internal_client.post_commands(
        running_integrity_run,
        [
            {
                **command,
                "received_at_server_ms": (
                    command["received_at_server_ms"] + 1
                ),
            }
        ],
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
def test_legacy_auto_submit_receipt_validates_supplied_processed_timestamp(
    internal_client,
    running_integrity_run,
    participant,
):
    command = bind_run(auto_submit_command(participant), running_integrity_run)
    command["worker_processed_at_ms"] = command["received_at_server_ms"] + 1
    assert internal_client.post_commands(
        running_integrity_run,
        [command],
    ).status_code == 200
    event = ExamEvent.objects.get(integrity_command_id=command["command_id"])
    legacy_metadata = dict(event.metadata)
    legacy_integrity = dict(legacy_metadata["integrity"])
    legacy_integrity.pop("command_fingerprint")
    legacy_metadata["integrity"] = legacy_integrity
    event.metadata = legacy_metadata
    event.save(update_fields=["metadata"])

    exact = internal_client.post_commands(
        running_integrity_run,
        [command],
    )
    changed = internal_client.post_commands(
        running_integrity_run,
        [
            {
                **command,
                "worker_processed_at_ms": (
                    command["worker_processed_at_ms"] + 1
                ),
            }
        ],
    )

    assert exact.status_code == 200
    assert changed.status_code == 422
    assert changed.json() == {
        "code": "command_id_conflict",
        "command_id": command["command_id"],
    }
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1


@pytest.mark.django_db
def test_bootstrap_returns_only_frozen_run_scope_with_uuid_contest_id(
    internal_client,
    running_integrity_run,
    participant,
    submitted_participant,
    settings,
    tmp_path,
):
    private_key = Ed25519PrivateKey.generate()
    private_key_path = tmp_path / "backend-ed25519"
    private_key_path.write_bytes(
        private_key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
    )
    settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = str(private_key_path)
    settings.INTEGRITY_ARCHIVE_BUCKET = "integrity-archive"

    response = internal_client.get_bootstrap(running_integrity_run)

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == str(running_integrity_run.id)
    assert payload["contest_id"] == str(running_integrity_run.contest_id)
    assert payload["scheduled_end_ms"] == int(
        running_integrity_run.scheduled_end_at.timestamp() * 1000
    )
    assert payload["participants"] == [
        {"participant_id": participant.id, "status": "active"},
        {"participant_id": submitted_participant.id, "status": "submitted"},
    ]
    assert payload["policy_snapshot"] == running_integrity_run.policy_snapshot
    assert payload["registry_snapshot"] == running_integrity_run.registry_snapshot
    assert payload["archive_policy"]["bucket"] == "integrity-archive"
    assert payload["archive_policy"]["key_prefix"] == (
        f"runs/{running_integrity_run.id}/generation-1/"
    )
    assert payload["archive_policy"]["capacity_warning_bytes"] == 1_073_741_824
    assert payload["archive_policy"]["capacity_reserve_bytes"] == 268_435_456
    assert payload["generation"] == 1
    assert payload["previous_manifest"] is None
    expected_public = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    assert base64.b64decode(
        payload["backend_signing_public_key_b64"],
        validate=True,
    ) == expected_public
    assert "token_digest" not in payload
    assert "cheat_detection_enabled" not in payload


@pytest.mark.django_db
def test_bootstrap_propagates_configured_archive_capacity_thresholds(
    internal_client,
    running_integrity_run,
    settings,
    tmp_path,
):
    private_key = Ed25519PrivateKey.generate()
    private_key_path = tmp_path / "backend-ed25519"
    private_key_path.write_bytes(
        private_key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
    )
    settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = str(private_key_path)
    settings.INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES = 8_388_608
    settings.INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES = 2_097_152

    response = internal_client.get_bootstrap(running_integrity_run)

    assert response.status_code == 200
    assert response.json()["archive_policy"][
        "capacity_warning_bytes"
    ] == 8_388_608
    assert response.json()["archive_policy"][
        "capacity_reserve_bytes"
    ] == 2_097_152


@pytest.mark.django_db
@pytest.mark.parametrize(
    "setting_name",
    (
        "INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES",
        "INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES",
    ),
)
def test_bootstrap_rejects_negative_archive_capacity_thresholds(
    internal_client,
    running_integrity_run,
    settings,
    tmp_path,
    setting_name,
):
    private_key = Ed25519PrivateKey.generate()
    private_key_path = tmp_path / "backend-ed25519"
    private_key_path.write_bytes(
        private_key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
    )
    settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = str(private_key_path)
    setattr(settings, setting_name, -1)

    response = internal_client.get_bootstrap(running_integrity_run)

    assert response.status_code == 409
    assert response.json() == {"code": "invalid_archive_capacity_policy"}


@pytest.mark.django_db
def test_missing_malformed_and_invalid_scoped_tokens_do_not_reveal_run_existence(
    internal_client,
    running_integrity_run,
):
    missing_id = uuid4()
    malformed = internal_client.client.get(
        InternalClient.bootstrap_url(running_integrity_run),
        HTTP_AUTHORIZATION="Basic nope",
    )
    missing = internal_client.get_bootstrap(running_integrity_run, token=False)
    wrong = internal_client.get_bootstrap(running_integrity_run, token="wrong")
    absent = internal_client.client.get(
        f"/api/v1/internal/integrity/runs/{missing_id}/bootstrap/",
        HTTP_AUTHORIZATION="Bearer wrong",
    )

    assert missing.status_code == malformed.status_code == 401
    assert missing.json() == malformed.json() == {
        "code": "invalid_integrity_run_token",
    }
    assert wrong.status_code == absent.status_code == 403
    assert wrong.json() == absent.json() == {
        "code": "invalid_integrity_run_scope",
    }


@pytest.mark.django_db
@pytest.mark.parametrize("invalidity", ["expired", "revoked", "inactive"])
def test_expired_revoked_and_inactive_runs_have_same_scope_failure(
    invalidity,
    internal_client,
    running_integrity_run,
):
    if invalidity == "expired":
        running_integrity_run.token_expires_at = timezone.now() - timedelta(seconds=1)
        fields = ["token_expires_at"]
    elif invalidity == "revoked":
        running_integrity_run.token_revoked_at = timezone.now()
        fields = ["token_revoked_at"]
    else:
        running_integrity_run.compute_state = ExamIntegrityRun.ComputeState.STOPPED
        fields = ["compute_state"]
    running_integrity_run.save(update_fields=fields)

    response = internal_client.get_bootstrap(running_integrity_run)

    assert response.status_code == 403
    assert response.json() == {"code": "invalid_integrity_run_scope"}


@pytest.mark.django_db
def test_token_for_another_run_cannot_access_url_run(
    internal_client,
    running_integrity_run,
    owner,
):
    now = timezone.now()
    other_contest = Contest.objects.create(
        name="Other scoped run",
        owner=owner,
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        status="published",
    )
    other_token = "other-run-token"
    ExamIntegrityRun.objects.create(
        contest=other_contest,
        created_by=owner,
        compute_state=ExamIntegrityRun.ComputeState.RUNNING,
        registry_version="2026-07-21.2",
        registry_snapshot=build_registry_snapshot(),
        policy_snapshot={},
        worker_image="registry.example/integrity:1",
        token_digest=hashlib.sha256(other_token.encode()).hexdigest(),
        token_expires_at=timezone.now() + timedelta(hours=1),
    )

    response = internal_client.get_bootstrap(
        running_integrity_run,
        token=other_token,
    )

    assert response.status_code == 403
    assert response.json() == {"code": "invalid_integrity_run_scope"}


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
def test_archive_upload_uses_deterministic_run_prefix_and_exact_worker_schema(
    internal_client,
    running_integrity_run,
    mocker,
):
    digest = "a" * 64
    object_key = (
        f"runs/{running_integrity_run.id}/generation-1/"
        "segments/00000001.journal.gz"
    )
    command = {
        "command_id": str(uuid4()),
        "run_id": str(running_integrity_run.id),
        "kind": "create_archive_upload",
        "metadata": {
            "object_key": object_key,
            "sha256": digest,
            "byte_length": 1234,
            "content_type": "application/gzip",
            "generation": 1,
        },
    }
    presign = mocker.patch(
        "apps.contests.services.integrity_commands.generate_archive_put_url",
        return_value="https://r2.example/presigned",
    )

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])

    expected_upload = {
        "command_id": command["command_id"],
        "object_key": object_key,
        "upload_url": "https://r2.example/presigned",
        "checksum_sha256": digest,
        "checksum_enforced": True,
    }
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {
        "accepted_command_ids": [command["command_id"]],
        "archive_uploads": [expected_upload],
    }
    assert presign.call_count == 2
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 0


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
def test_manifest_publish_is_monotonic_idempotent_and_archives_stopping_run(
    internal_client,
    running_integrity_run,
):
    running_integrity_run.compute_state = ExamIntegrityRun.ComputeState.STOPPING
    running_integrity_run.archive_generation = 2
    running_integrity_run.archived_counts = {"segments": 2}
    running_integrity_run.save(
        update_fields=["compute_state", "archive_generation", "archived_counts"]
    )
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

    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])

    assert first.status_code == second.status_code == 200
    running_integrity_run.refresh_from_db()
    assert running_integrity_run.archive_generation == 2
    assert running_integrity_run.archive_manifest_key == object_key
    assert running_integrity_run.archive_manifest_sha256 == "b" * 64
    assert running_integrity_run.archived_counts == {"segments": 3, "records": 40}
    assert running_integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED

    stale = {
        **command,
        "command_id": str(uuid4()),
        "metadata": {
            **command["metadata"],
            "generation": 1,
            "object_key": f"runs/{running_integrity_run.id}/generation-1/manifest.json",
        },
    }
    stale_response = internal_client.post_commands(running_integrity_run, [stale])
    assert stale_response.status_code == 422
    assert stale_response.json()["code"] == "stale_archive_generation"


@pytest.mark.django_db
def test_database_failure_returns_503_for_unchanged_worker_retry(
    internal_client,
    running_integrity_run,
    participant,
    mocker,
):
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
def test_bootstrap_auth_query_failure_returns_retryable_503(
    internal_client,
    running_integrity_run,
    mocker,
):
    mocker.patch(
        "apps.contests.views.integrity_internal.authenticate_integrity_run",
        side_effect=OperationalError("database credentials must not leak"),
    )

    response = internal_client.get_bootstrap(running_integrity_run)

    assert response.status_code == 503
    assert response.json() == {"code": "integrity_bootstrap_temporarily_unavailable"}
    assert "database" not in response.content.decode("utf-8").lower()


@pytest.mark.django_db
def test_commands_auth_query_failure_returns_retryable_503(
    internal_client,
    running_integrity_run,
    mocker,
):
    mocker.patch(
        "apps.contests.views.integrity_internal.authenticate_integrity_run",
        side_effect=OperationalError("database credentials must not leak"),
    )

    response = internal_client.post_commands(running_integrity_run, [])

    assert response.status_code == 503
    assert response.json() == {"code": "integrity_command_temporarily_unavailable"}
    assert "database" not in response.content.decode("utf-8").lower()


def test_command_helpers_never_import_worker_database_clients():
    import apps.contests.services.integrity_commands as commands

    source = __import__("inspect").getsource(commands)
    assert "psycopg" not in source
    assert "django.db" in source
    assert UUID(command_id := "55555555-5555-5555-5555-555555555555")
    assert str(UUID(command_id)) == command_id
