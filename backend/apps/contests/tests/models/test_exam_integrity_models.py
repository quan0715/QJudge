import uuid

import pytest
from django.db import IntegrityError, models, transaction

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamEvidenceChunk,
    ExamIntegrityRun,
)
from apps.users.models import User


def _integrity_run(contest: Contest, **overrides: object) -> ExamIntegrityRun:
    values = {
        "contest": contest,
        "registry_version": "registry-v1",
        "worker_image": "registry.example/integrity:1",
    }
    values.update(overrides)
    return ExamIntegrityRun.objects.create(**values)


def _evidence_chunk(
    *,
    contest: Contest,
    integrity_run: ExamIntegrityRun,
    participant: ContestParticipant,
    exam_event: ExamEvent,
    recording_session_id: uuid.UUID,
    chunk_seq: int = 0,
) -> ExamEvidenceChunk:
    return ExamEvidenceChunk.objects.create(
        integrity_run=integrity_run,
        contest=contest,
        participant=participant,
        exam_event=exam_event,
        incident_id=uuid.uuid4(),
        source=ExamEvidenceChunk.Source.SCREEN,
        recording_session_id=recording_session_id,
        chunk_seq=chunk_seq,
        start_at_ms=0,
        end_at_ms=1_000,
        object_key="evidence/chunk.webm",
        content_type="video/webm",
        byte_size=42,
        sha256="a" * 64,
    )


def test_integrity_run_metadata_contract():
    assert set(ExamIntegrityRun.ComputeState.values) == {
        "stopped", "starting", "running", "stopping", "destroyed",
    }
    assert set(ExamIntegrityRun.Health.values) == {"healthy", "unhealthy"}
    assert set(ExamIntegrityRun.DataState.values) == {"open", "archived", "purged"}
    assert ExamIntegrityRun._meta.db_table == "exam_integrity_runs"
    assert ExamIntegrityRun._meta.ordering == ["-created_at"]

    id_field = ExamIntegrityRun._meta.get_field("id")
    assert id_field.get_internal_type() == "UUIDField"
    assert id_field.primary_key is True
    assert id_field.default is uuid.uuid4
    assert id_field.editable is False

    contest_field = ExamIntegrityRun._meta.get_field("contest")
    assert contest_field.remote_field.model is Contest
    assert contest_field.remote_field.related_name == "integrity_runs"
    assert contest_field.remote_field.on_delete is models.CASCADE

    created_by_field = ExamIntegrityRun._meta.get_field("created_by")
    assert created_by_field.null is True
    assert created_by_field.blank is True
    assert created_by_field.remote_field.related_name == "created_exam_integrity_runs"
    assert created_by_field.remote_field.on_delete is models.SET_NULL

    for field_name, expected_default in {
        "compute_state": ExamIntegrityRun.ComputeState.STOPPED,
        "health": ExamIntegrityRun.Health.HEALTHY,
        "data_state": ExamIntegrityRun.DataState.OPEN,
        "warnings": list,
        "metrics": dict,
        "last_error": "",
        "last_correlation_id": "",
        "policy_snapshot": dict,
        "registry_snapshot": dict,
        "worker_image_digest": "",
        "worker_version": "",
        "container_id": "",
        "container_name": "",
        "worker_url": "",
        "token_digest": "",
        "archive_generation": 0,
        "archive_manifest_key": "",
        "archive_manifest_sha256": "",
        "received_counts": dict,
        "processed_counts": dict,
        "archived_counts": dict,
    }.items():
        assert ExamIntegrityRun._meta.get_field(field_name).default == expected_default

    for field_name in ("registry_version", "worker_image", "policy_snapshot", "registry_snapshot"):
        field = ExamIntegrityRun._meta.get_field(field_name)
        assert field.null is False
        assert field.blank is False

    for field_name in (
        "token_expires_at",
        "token_revoked_at",
        "last_worker_heartbeat_at",
        "scheduled_start_at",
        "scheduled_end_at",
        "started_at",
        "stopped_at",
        "destroyed_at",
        "purged_at",
        "retention_until",
        "stopped_by",
        "destroyed_by",
        "purged_by",
    ):
        field = ExamIntegrityRun._meta.get_field(field_name)
        assert field.null is True
        assert field.blank is True

    assert ExamIntegrityRun._meta.get_field("created_at").auto_now_add is True
    assert ExamIntegrityRun._meta.get_field("updated_at").auto_now is True

    assert {
        tuple(index.fields) for index in ExamIntegrityRun._meta.indexes
    } == {
        ("contest", "compute_state"),
        ("data_state", "updated_at"),
    }
    constraint = next(
        constraint
        for constraint in ExamIntegrityRun._meta.constraints
        if constraint.name == "uniq_live_integrity_run_per_contest"
    )
    assert constraint.fields == ("contest",)
    assert constraint.condition == ~models.Q(compute_state="destroyed")


def test_evidence_chunk_metadata_contract():
    assert ExamEvidenceChunk._meta.db_table == "exam_evidence_chunks"
    assert set(ExamEvidenceChunk.Source.values) == {"screen_share", "webcam"}
    assert set(ExamEvidenceChunk.Status.values) == {
        "requested", "uploaded", "verified", "failed", "unavailable",
    }

    id_field = ExamEvidenceChunk._meta.get_field("id")
    assert id_field.get_internal_type() == "UUIDField"
    assert id_field.primary_key is True
    assert id_field.default is uuid.uuid4
    assert id_field.editable is False

    required_fields = (
        "integrity_run",
        "contest",
        "participant",
        "exam_event",
        "incident_id",
        "source",
        "recording_session_id",
        "chunk_seq",
        "start_at_ms",
        "end_at_ms",
        "object_key",
        "content_type",
        "byte_size",
        "sha256",
    )
    for field_name in required_fields:
        field = ExamEvidenceChunk._meta.get_field(field_name)
        assert field.null is False
        assert field.blank is False

    for field_name, expected_default in {
        "is_init_chunk": False,
        "codec": "",
        "previous_sha256": "",
        "status": ExamEvidenceChunk.Status.REQUESTED,
        "metadata": dict,
    }.items():
        assert ExamEvidenceChunk._meta.get_field(field_name).default == expected_default

    for field_name in ("uploaded_at", "verified_at"):
        field = ExamEvidenceChunk._meta.get_field(field_name)
        assert field.null is True
        assert field.blank is True
    assert ExamEvidenceChunk._meta.get_field("requested_at").auto_now_add is True
    assert isinstance(ExamEvidenceChunk._meta.get_field("metadata"), models.JSONField)

    assert {
        tuple(index.fields) for index in ExamEvidenceChunk._meta.indexes
    } == {
        ("integrity_run", "incident_id"),
        ("participant", "status"),
    }
    constraint = next(
        constraint
        for constraint in ExamEvidenceChunk._meta.constraints
        if constraint.name == "uniq_integrity_evidence_chunk"
    )
    assert constraint.fields == (
        "integrity_run",
        "participant",
        "source",
        "recording_session_id",
        "chunk_seq",
    )


def test_normalized_exam_event_metadata_contract():
    assert ExamEvent._meta.get_field("event_type").max_length == 64
    assert not ExamEvent._meta.get_field("event_type").choices

    integrity_run_field = ExamEvent._meta.get_field("integrity_run")
    assert integrity_run_field.remote_field.model is ExamIntegrityRun
    assert integrity_run_field.remote_field.related_name == "normalized_events"
    assert integrity_run_field.remote_field.on_delete is models.SET_NULL
    assert integrity_run_field.null is True
    assert integrity_run_field.blank is True

    command_id_field = ExamEvent._meta.get_field("integrity_command_id")
    assert command_id_field.get_internal_type() == "UUIDField"
    assert command_id_field.unique is True
    assert command_id_field.null is True
    assert command_id_field.blank is True

    incident_id_field = ExamEvent._meta.get_field("incident_id")
    assert incident_id_field.get_internal_type() == "UUIDField"
    assert incident_id_field.db_index is True
    assert incident_id_field.null is True
    assert incident_id_field.blank is True

    assert ExamEvent._meta.get_field("event_definition_version").default == ""
    assert ExamEvent._meta.get_field("event_schema_version").default == 1
    assert ExamEvent._meta.get_field("delayed_delivery").default is False
    for field_name in (
        "client_occurred_at_ms",
        "server_received_at",
        "worker_processed_at",
    ):
        field = ExamEvent._meta.get_field(field_name)
        assert field.null is True
        assert field.blank is True


@pytest.mark.django_db
def test_live_integrity_run_constraint_allows_replacement_after_destroying_run():
    contest = Contest.objects.create(name="Integrity constraint contest")
    live_run = _integrity_run(contest)

    with pytest.raises(IntegrityError), transaction.atomic():
        _integrity_run(contest, compute_state=ExamIntegrityRun.ComputeState.RUNNING)

    live_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    live_run.save(update_fields=["compute_state"])
    replacement = _integrity_run(contest)

    assert replacement.contest_id == contest.id
    assert replacement.compute_state == ExamIntegrityRun.ComputeState.STOPPED


@pytest.mark.django_db
def test_evidence_chunk_constraint_rejects_duplicate_stream_chunk():
    user = User.objects.create_user(
        username="integrity-student",
        email="integrity-student@example.com",
        password="testpass123",
        role="student",
    )
    contest = Contest.objects.create(name="Evidence constraint contest")
    participant = ContestParticipant.objects.create(contest=contest, user=user)
    integrity_run = _integrity_run(contest)
    exam_event = ExamEvent.objects.create(
        contest=contest,
        user=user,
        event_type="screen_share_interrupted",
    )
    recording_session_id = uuid.uuid4()
    _evidence_chunk(
        contest=contest,
        integrity_run=integrity_run,
        participant=participant,
        exam_event=exam_event,
        recording_session_id=recording_session_id,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        _evidence_chunk(
            contest=contest,
            integrity_run=integrity_run,
            participant=participant,
            exam_event=exam_event,
            recording_session_id=recording_session_id,
        )
