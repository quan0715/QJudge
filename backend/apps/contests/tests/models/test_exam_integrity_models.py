from django.db import models

from apps.contests.models import ExamEvent, ExamEvidenceChunk, ExamIntegrityRun


def test_integrity_run_state_contract():
    assert set(ExamIntegrityRun.ComputeState.values) == {
        "stopped", "starting", "running", "stopping", "destroyed",
    }
    assert set(ExamIntegrityRun.Health.values) == {"healthy", "unhealthy"}
    assert set(ExamIntegrityRun.DataState.values) == {"open", "archived", "purged"}
    assert ExamIntegrityRun._meta.get_field("policy_snapshot").get_internal_type() == "JSONField"
    assert ExamIntegrityRun._meta.get_field("registry_snapshot").get_internal_type() == "JSONField"
    assert ExamIntegrityRun._meta.get_field("metrics").get_internal_type() == "JSONField"
    assert any(
        constraint.name == "uniq_live_integrity_run_per_contest"
        for constraint in ExamIntegrityRun._meta.constraints
    )


def test_integrity_schema_adds_only_two_new_tables():
    assert ExamIntegrityRun._meta.db_table == "exam_integrity_runs"
    assert ExamEvidenceChunk._meta.db_table == "exam_evidence_chunks"
    assert ExamEvent._meta.get_field("integrity_run").remote_field.model is ExamIntegrityRun
    assert ExamEvent._meta.get_field("integrity_command_id").unique is True
    assert not ExamEvent._meta.get_field("event_type").choices


def test_evidence_chunk_is_video_chunk_not_legacy_frame():
    field_names = {field.name for field in ExamEvidenceChunk._meta.get_fields()}
    assert {
        "source", "recording_session_id", "chunk_seq", "start_at_ms",
        "end_at_ms", "sha256", "previous_sha256", "object_key", "status",
    }.issubset(field_names)
    assert isinstance(
        ExamEvidenceChunk._meta.get_field("metadata"),
        models.JSONField,
    )
