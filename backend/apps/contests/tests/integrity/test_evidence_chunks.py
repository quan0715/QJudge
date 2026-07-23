import base64
import hashlib
import json
from datetime import timedelta
from io import BytesIO
from unittest.mock import Mock
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.integrity.registry import build_registry_snapshot
from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvidenceChunk,
    ExamEvent,
    ExamIntegrityRun,
    ExamStatus,
)
from apps.contests.services import (
    integrity_evidence as integrity_evidence_service,
)
from apps.contests.services.integrity_evidence import (
    IntegrityEvidenceRejected,
    IntegrityEvidenceStorageError,
    build_evidence_delivery,
    create_evidence_manifest,
    evidence_retain_windows,
    evidence_statuses_for_events,
    purge_integrity_data,
)
from apps.users.models import User


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def participant(db):
    teacher = User.objects.create_user(
        username="evidence-teacher",
        email="evidence-teacher@example.com",
        password="password",
        role="teacher",
    )
    student = User.objects.create_user(
        username="evidence-student",
        email="evidence-student@example.com",
        password="password",
        role="student",
    )
    now = timezone.now()
    contest = Contest.objects.create(
        name="Incident evidence",
        owner=teacher,
        status="published",
        contest_type="paper_exam",
        cheat_detection_enabled=True,
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )
    return ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=now,
    )


@pytest.fixture
def another_participant(participant):
    user = User.objects.create_user(
        username="evidence-other-student",
        email="evidence-other-student@example.com",
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
def integrity_run(participant):
    registry = build_registry_snapshot()
    return ExamIntegrityRun.objects.create(
        contest=participant.contest,
        created_by=participant.contest.owner,
        compute_state=ExamIntegrityRun.ComputeState.RUNNING,
        policy_snapshot={
            "version": 1,
            "evidence": {
                "minimum_local_buffer_ms": 60_000,
                "local_cap_bytes_per_source": 100_000_000,
            },
            "device_policy": {
                "desktop": {
                    "enabled": True,
                    "sources": {
                        "screen_share": {"enabled": True},
                        "webcam": {"enabled": True},
                    },
                },
                "tablet": {
                    "enabled": True,
                    "sources": {
                        "screen_share": {"enabled": False},
                        "webcam": {"enabled": True},
                    },
                },
            },
        },
        registry_snapshot=registry,
        registry_version=registry["version"],
        worker_image="integrity-worker:test",
        worker_url="http://integrity-worker.test",
    )


@pytest.fixture
def incident_event(integrity_run, participant):
    return ExamEvent.objects.create(
        contest=participant.contest,
        user=participant.user,
        integrity_run=integrity_run,
        integrity_command_id=uuid4(),
        incident_id=uuid4(),
        event_type="exit_fullscreen",
        event_definition_version=integrity_run.registry_version,
        event_schema_version=1,
        client_occurred_at_ms=1_005_000,
        metadata={
            "device_kind": "desktop",
            "integrity": {
                "definition_id": "fullscreen_integrity",
                "phase": "escalated",
            },
        },
    )


@pytest.fixture
def object_store(monkeypatch):
    client = Mock()
    client.generate_presigned_url.side_effect = (
        lambda **kwargs: f"https://r2.example/{kwargs['Params']['Key']}"
    )
    monkeypatch.setattr(
        "apps.contests.services.integrity_evidence.get_s3_client",
        lambda **kwargs: client,
    )
    return client


def _digest(seq):
    return hashlib.sha256(f"chunk-{seq}".encode()).hexdigest()


def descriptor(
    *,
    seq,
    start,
    end,
    source="screen_share",
    recording_session_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    previous_sha256=None,
):
    return {
        "source": source,
        "recording_session_id": recording_session_id,
        "chunk_seq": seq,
        "is_init_chunk": seq == 1,
        "start_at_ms": start,
        "end_at_ms": end,
        "byte_size": 1024 + seq,
        "codec": "vp8",
        "content_type": "video/webm",
        "sha256": _digest(seq),
        "previous_sha256": (
            ""
            if seq == 1
            else previous_sha256
            if previous_sha256 is not None
            else _digest(seq - 1)
        ),
        "local_descriptor_id": f"local-{source}-{seq}",
    }


def manifest_url(event):
    return (
        f"/api/v1/contests/{event.contest_id}"
        "/exam/integrity/evidence/manifest/"
    )


def complete_url(chunk):
    return (
        f"/api/v1/contests/{chunk.contest_id}"
        "/exam/integrity/evidence/complete/"
    )


def unavailable_url(chunk):
    return (
        f"/api/v1/contests/{chunk.contest_id}"
        "/exam/integrity/evidence/unavailable/"
    )


def post_manifest(api_client, event, chunks):
    return api_client.post(
        manifest_url(event),
        {
            "run_id": str(event.integrity_run_id),
            "incident_id": str(event.incident_id),
            "chunks": chunks,
        },
        format="json",
    )


@pytest.mark.django_db
def test_manifest_returns_only_chunks_overlapping_incident_window(
    api_client,
    incident_event,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(seq=1, start=970_000, end=975_000),
            descriptor(seq=2, start=995_000, end=1_000_000),
            descriptor(seq=3, start=1_015_000, end=1_020_000),
            descriptor(seq=4, start=1_030_000, end=1_035_000),
        ],
    )

    assert response.status_code == 200
    assert [item["chunk_seq"] for item in response.json()["uploads"]] == [2, 3]
    assert ExamEvidenceChunk.objects.count() == 2
    params = object_store.generate_presigned_url.call_args_list[0].kwargs["Params"]
    assert params["ContentLength"] == 1026
    assert params["ChecksumSHA256"] == base64.b64encode(
        bytes.fromhex(_digest(2))
    ).decode("ascii")
    assert response.json()["uploads"][0]["required_headers"] == {
        "Content-Type": "video/webm",
        "x-amz-checksum-sha256": params["ChecksumSHA256"],
    }


@pytest.mark.django_db
def test_manifest_rejects_source_disabled_by_frozen_policy(
    api_client,
    incident_event,
    participant,
    integrity_run,
    object_store,
):
    policy = dict(integrity_run.policy_snapshot)
    policy["device_policy"] = {
        "desktop": {
            "enabled": True,
            "sources": {
                "screen_share": {"enabled": False},
                "webcam": {"enabled": True},
            },
        },
    }
    integrity_run.policy_snapshot = policy
    integrity_run.save(update_fields=["policy_snapshot"])
    api_client.force_authenticate(participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=1, start=1_000_000, end=1_005_000)],
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_source_disabled"
    assert ExamEvidenceChunk.objects.count() == 0
    object_store.generate_presigned_url.assert_not_called()


@pytest.mark.django_db
def test_manifest_enforces_unique_incident_source_byte_budget_across_requests(
    api_client,
    incident_event,
    participant,
    integrity_run,
    object_store,
):
    policy = dict(integrity_run.policy_snapshot)
    evidence = dict(policy["evidence"])
    evidence["local_cap_bytes_per_source"] = 1_500
    policy["evidence"] = evidence
    integrity_run.policy_snapshot = policy
    integrity_run.save(update_fields=["policy_snapshot"])
    api_client.force_authenticate(participant.user)

    first = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(
                seq=1,
                start=1_000_000,
                end=1_005_000,
                recording_session_id=(
                    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
                ),
            )
        ],
    )
    second = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(
                seq=1,
                start=1_000_000,
                end=1_005_000,
                recording_session_id=(
                    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
                ),
            )
        ],
    )

    assert first.status_code == 200
    assert second.status_code == 400
    assert (
        second.json()["code"]
        == "evidence_incident_source_limit_exceeded"
    )
    assert ExamEvidenceChunk.objects.count() == 1
    assert object_store.generate_presigned_url.call_count == 1


@pytest.mark.django_db
def test_manifest_does_not_expose_another_participants_incident(
    api_client,
    incident_event,
    another_participant,
    object_store,
):
    api_client.force_authenticate(another_participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=1, start=1_000_000, end=1_005_000)],
    )

    assert response.status_code == 404
    assert ExamEvidenceChunk.objects.count() == 0
    object_store.generate_presigned_url.assert_not_called()


@pytest.mark.django_db
def test_manifest_rejects_chunk_chain_mismatch(
    api_client,
    incident_event,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(seq=1, start=995_000, end=1_000_000),
            descriptor(
                seq=2,
                start=1_000_000,
                end=1_005_000,
                previous_sha256="f" * 64,
            ),
        ],
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_chunk_chain_mismatch"
    assert ExamEvidenceChunk.objects.count() == 0
    object_store.generate_presigned_url.assert_not_called()


@pytest.mark.django_db
def test_manifest_rejects_mismatch_with_persisted_chain_neighbor(
    api_client,
    incident_event,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)
    first = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=1, start=995_000, end=1_000_000)],
    )
    assert first.status_code == 200

    response = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(
                seq=2,
                start=1_000_000,
                end=1_005_000,
                previous_sha256="f" * 64,
            )
        ],
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_chunk_chain_mismatch"
    assert ExamEvidenceChunk.objects.count() == 1


@pytest.mark.django_db
def test_manifest_rejects_isolated_or_gapped_non_init_chunk(
    api_client,
    incident_event,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)

    isolated = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=2, start=1_000_000, end=1_005_000)],
    )
    assert isolated.status_code == 400
    assert isolated.json()["code"] == "evidence_chunk_chain_mismatch"

    initial = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=1, start=995_000, end=1_000_000)],
    )
    assert initial.status_code == 200
    gapped = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=3, start=1_005_000, end=1_010_000)],
    )
    assert gapped.status_code == 400
    assert gapped.json()["code"] == "evidence_chunk_chain_mismatch"
    assert ExamEvidenceChunk.objects.count() == 1


@pytest.mark.django_db
def test_manifest_context_predecessor_need_not_recurse_to_session_init(
    api_client,
    incident_event,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(seq=2, start=970_000, end=975_000),
            descriptor(seq=3, start=1_000_000, end=1_005_000),
        ],
    )

    assert response.status_code == 200
    assert [item["chunk_seq"] for item in response.json()["uploads"]] == [3]
    assert list(
        ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)
    ) == [3]


@pytest.mark.django_db
def test_manifest_allows_idempotent_zero_based_init_chunk(
    api_client,
    incident_event,
    participant,
    object_store,
):
    initial = descriptor(seq=0, start=1_000_000, end=1_005_000)
    initial["is_init_chunk"] = True
    initial["previous_sha256"] = ""
    api_client.force_authenticate(participant.user)

    first = post_manifest(api_client, incident_event, [initial])
    second = post_manifest(api_client, incident_event, [initial])

    assert first.status_code == second.status_code == 200
    assert ExamEvidenceChunk.objects.count() == 1


@pytest.mark.django_db
def test_overlapping_incidents_reuse_physical_chunk_and_merge_links(
    api_client,
    incident_event,
    participant,
    integrity_run,
    object_store,
):
    second = ExamEvent.objects.create(
        contest=participant.contest,
        user=participant.user,
        integrity_run=integrity_run,
        integrity_command_id=uuid4(),
        incident_id=uuid4(),
        event_type="exit_fullscreen",
        event_definition_version=integrity_run.registry_version,
        event_schema_version=1,
        client_occurred_at_ms=1_008_000,
        metadata={
            "device_kind": "desktop",
            "integrity": {"definition_id": "fullscreen_integrity"},
        },
    )
    chunk = descriptor(seq=1, start=1_000_000, end=1_005_000)
    api_client.force_authenticate(participant.user)

    first_response = post_manifest(api_client, incident_event, [chunk])
    second_response = post_manifest(api_client, second, [chunk])

    assert first_response.status_code == second_response.status_code == 200
    assert ExamEvidenceChunk.objects.count() == 1
    row = ExamEvidenceChunk.objects.get()
    assert row.incident_id == incident_event.incident_id
    assert row.exam_event_id == incident_event.id
    assert row.metadata["incident_ids"] == [
        str(incident_event.incident_id),
        str(second.incident_id),
    ]
    assert row.metadata["event_ids"] == [incident_event.id, second.id]
    assert (
        first_response.json()["uploads"][0]["object_key"]
        == second_response.json()["uploads"][0]["object_key"]
        == row.object_key
    )


@pytest.fixture
def requested_evidence_chunk(
    api_client,
    incident_event,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)
    response = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=1, start=1_000_000, end=1_005_000)],
    )
    assert response.status_code == 200
    return ExamEvidenceChunk.objects.get()


@pytest.mark.django_db
def test_complete_verifies_object_checksum_without_proxying_media(
    api_client,
    requested_evidence_chunk,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)
    object_store.head_object.return_value = {
        "ContentLength": requested_evidence_chunk.byte_size,
        "ChecksumSHA256": base64.b64encode(
            bytes.fromhex(requested_evidence_chunk.sha256),
        ).decode("ascii"),
    }

    response = api_client.post(
        complete_url(requested_evidence_chunk),
        {"chunk_id": str(requested_evidence_chunk.id)},
        format="json",
    )

    assert response.status_code == 200
    object_store.head_object.assert_called_once_with(
        Bucket="anticheat-raw",
        Key=requested_evidence_chunk.object_key,
        ChecksumMode="ENABLED",
    )
    object_store.get_object.assert_not_called()
    requested_evidence_chunk.refresh_from_db()
    assert requested_evidence_chunk.status == ExamEvidenceChunk.Status.VERIFIED
    assert requested_evidence_chunk.verified_at is not None


@pytest.mark.django_db
def test_complete_rejects_checksum_mismatch_and_marks_failed(
    api_client,
    requested_evidence_chunk,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)
    object_store.head_object.return_value = {
        "ContentLength": requested_evidence_chunk.byte_size,
        "ChecksumSHA256": base64.b64encode(b"x" * 32).decode("ascii"),
    }

    response = api_client.post(
        complete_url(requested_evidence_chunk),
        {"chunk_id": str(requested_evidence_chunk.id)},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_checksum_mismatch"
    requested_evidence_chunk.refresh_from_db()
    assert requested_evidence_chunk.status == ExamEvidenceChunk.Status.FAILED
    object_store.get_object.assert_not_called()


@pytest.mark.django_db
def test_unavailable_marks_projected_chunk_with_bounded_reason(
    api_client,
    requested_evidence_chunk,
    participant,
):
    api_client.force_authenticate(participant.user)

    response = api_client.post(
        unavailable_url(requested_evidence_chunk),
        {
            "chunk_id": str(requested_evidence_chunk.id),
            "reason": "local OPFS entry was evicted",
        },
        format="json",
    )

    assert response.status_code == 200
    requested_evidence_chunk.refresh_from_db()
    assert requested_evidence_chunk.status == ExamEvidenceChunk.Status.UNAVAILABLE
    assert (
        requested_evidence_chunk.metadata["unavailable_reason"]
        == "local OPFS entry was evicted"
    )


@pytest.mark.django_db
def test_retain_windows_merge_overlap_and_split_at_sixty_seconds(
    integrity_run,
    participant,
    incident_event,
):
    registry = dict(integrity_run.registry_snapshot)
    definitions = dict(registry["definitions"])
    definition = dict(definitions["fullscreen_integrity"])
    definition["evidence"] = {
        "mode": "incident_window",
        "sources": ["screen_share"],
        "before_ms": 70_000,
        "after_ms": 70_000,
        "max_segment_ms": 60_000,
    }
    definitions["fullscreen_integrity"] = definition
    registry["definitions"] = definitions
    integrity_run.registry_snapshot = registry
    integrity_run.save(update_fields=["registry_snapshot"])
    second = ExamEvent.objects.create(
        contest=participant.contest,
        user=participant.user,
        integrity_run=integrity_run,
        integrity_command_id=uuid4(),
        incident_id=uuid4(),
        event_type="exit_fullscreen",
        event_definition_version=integrity_run.registry_version,
        event_schema_version=1,
        client_occurred_at_ms=1_065_000,
        metadata={
            "device_kind": "desktop",
            "integrity": {"definition_id": "fullscreen_integrity"},
        },
    )

    windows = evidence_retain_windows(integrity_run, participant, after_ms=0)

    by_incident = {}
    for window in windows:
        by_incident.setdefault(window.incident_id, []).append(window)
        assert window.end_at_ms - window.start_at_ms <= 60_000
    assert set(by_incident) == {incident_event.incident_id, second.incident_id}
    first_windows = by_incident[incident_event.incident_id]
    assert first_windows[0].start_at_ms == 935_000
    assert first_windows[-1].end_at_ms == 1_135_000
    assert all(
        left.end_at_ms == right.start_at_ms
        for left, right in zip(first_windows, first_windows[1:])
    )


@pytest.mark.django_db
def test_delivery_rebuilds_incomplete_commands_and_release_watermark(
    integrity_run,
    participant,
    incident_event,
):
    first = build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    )
    second = build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    )

    assert first == second
    assert len(first.pending_commands) == 1
    assert first.pending_commands[0]["incident_id"] == str(
        incident_event.incident_id
    )
    assert first.release_before_ms == 995_000


@pytest.mark.django_db
def test_delivery_keeps_multi_source_window_until_every_source_is_terminal(
    integrity_run,
    participant,
):
    event = ExamEvent.objects.create(
        contest=participant.contest,
        user=participant.user,
        integrity_run=integrity_run,
        integrity_command_id=uuid4(),
        incident_id=uuid4(),
        event_type="listener_tampered",
        event_definition_version=integrity_run.registry_version,
        event_schema_version=1,
        client_occurred_at_ms=1_005_000,
        metadata={
            "device_kind": "desktop",
            "integrity": {"definition_id": "listener_integrity"},
        },
    )
    ExamEvidenceChunk.objects.create(
        integrity_run=integrity_run,
        contest=participant.contest,
        participant=participant,
        exam_event=event,
        incident_id=event.incident_id,
        source="screen_share",
        recording_session_id=uuid4(),
        chunk_seq=1,
        is_init_chunk=True,
        start_at_ms=1_000_000,
        end_at_ms=1_005_000,
        object_key="integrity/multi-source/screen.webm",
        content_type="video/webm",
        codec="vp8",
        byte_size=1024,
        sha256="a" * 64,
        status=ExamEvidenceChunk.Status.VERIFIED,
        metadata={
            "incident_ids": [str(event.incident_id)],
            "event_ids": [event.id],
        },
    )

    delivery = build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    )

    command = next(
        item
        for item in delivery.pending_commands
        if item["incident_id"] == str(event.incident_id)
    )
    assert command["sources"] == ["screen_share", "webcam"]


@pytest.mark.django_db
def test_delivery_keeps_window_until_terminal_chunks_cover_full_interval(
    integrity_run,
    participant,
    incident_event,
):
    window = evidence_retain_windows(
        integrity_run,
        participant,
        after_ms=0,
    )[0]
    first_chunk = ExamEvidenceChunk.objects.create(
        integrity_run=integrity_run,
        contest=participant.contest,
        participant=participant,
        exam_event=incident_event,
        incident_id=incident_event.incident_id,
        source="screen_share",
        recording_session_id=uuid4(),
        chunk_seq=1,
        is_init_chunk=True,
        start_at_ms=window.start_at_ms,
        end_at_ms=window.start_at_ms + 5_000,
        object_key="integrity/partial-coverage/screen.webm",
        content_type="video/webm",
        codec="vp8",
        byte_size=1024,
        sha256="a" * 64,
        status=ExamEvidenceChunk.Status.VERIFIED,
        metadata={
            "incident_ids": [str(incident_event.incident_id)],
            "event_ids": [incident_event.id],
        },
    )

    delivery = build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    )

    assert any(
        item["incident_id"] == str(incident_event.incident_id)
        for item in delivery.pending_commands
    )
    ExamEvidenceChunk.objects.create(
        integrity_run=integrity_run,
        contest=participant.contest,
        participant=participant,
        exam_event=incident_event,
        incident_id=incident_event.incident_id,
        source="screen_share",
        recording_session_id=first_chunk.recording_session_id,
        chunk_seq=2,
        is_init_chunk=False,
        start_at_ms=window.start_at_ms + 5_000,
        end_at_ms=window.end_at_ms,
        object_key="integrity/partial-coverage/unavailable.webm",
        content_type="video/webm",
        codec="vp8",
        byte_size=1024,
        sha256="b" * 64,
        previous_sha256=first_chunk.sha256,
        status=ExamEvidenceChunk.Status.UNAVAILABLE,
        metadata={
            "incident_ids": [str(incident_event.incident_id)],
            "event_ids": [incident_event.id],
        },
    )

    completed = build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    )

    assert not any(
        item["incident_id"] == str(incident_event.incident_id)
        for item in completed.pending_commands
    )


@pytest.mark.django_db
def test_manifest_relocks_run_and_rejects_stale_running_instance(
    integrity_run,
    participant,
    incident_event,
):
    payload = descriptor(seq=1, start=995_000, end=1_000_000)
    payload["recording_session_id"] = uuid4()
    ExamIntegrityRun.objects.filter(pk=integrity_run.pk).update(
        compute_state=ExamIntegrityRun.ComputeState.DESTROYED,
        data_state=ExamIntegrityRun.DataState.ARCHIVED,
    )

    with pytest.raises(IntegrityEvidenceRejected) as caught:
        create_evidence_manifest(
            integrity_run,
            participant,
            incident_event,
            [payload],
        )

    assert caught.value.code == "evidence_run_not_accepting_uploads"
    assert ExamEvidenceChunk.objects.count() == 0


@pytest.mark.django_db
def test_manager_event_response_includes_chunk_evidence_status(
    api_client,
    incident_event,
    participant,
    requested_evidence_chunk,
):
    window = evidence_retain_windows(
        requested_evidence_chunk.integrity_run,
        participant,
        after_ms=0,
    )[0]
    requested_evidence_chunk.start_at_ms = window.start_at_ms
    requested_evidence_chunk.end_at_ms = window.end_at_ms
    requested_evidence_chunk.status = ExamEvidenceChunk.Status.VERIFIED
    requested_evidence_chunk.verified_at = timezone.now()
    requested_evidence_chunk.save(
        update_fields=[
            "start_at_ms",
            "end_at_ms",
            "status",
            "verified_at",
        ]
    )
    api_client.force_authenticate(participant.contest.owner)

    response = api_client.get(
        f"/api/v1/contests/{participant.contest_id}/exam/events/"
    )

    assert response.status_code == 200
    serialized = next(
        item for item in response.json() if item["id"] == incident_event.id
    )
    assert serialized["evidence_status"] == "complete"
    assert serialized["evidence_sources"] == {
        "screen_share": {"status": "complete", "chunks": 1},
    }


@pytest.mark.django_db
def test_manager_event_response_does_not_complete_partial_interval(
    api_client,
    incident_event,
    participant,
    requested_evidence_chunk,
):
    requested_evidence_chunk.status = ExamEvidenceChunk.Status.VERIFIED
    requested_evidence_chunk.verified_at = timezone.now()
    requested_evidence_chunk.save(update_fields=["status", "verified_at"])
    api_client.force_authenticate(participant.contest.owner)

    response = api_client.get(
        f"/api/v1/contests/{participant.contest_id}/exam/events/"
    )

    assert response.status_code == 200
    serialized = next(
        item for item in response.json() if item["id"] == incident_event.id
    )
    assert serialized["evidence_status"] == "partial"
    assert serialized["evidence_sources"] == {
        "screen_share": {"status": "partial", "chunks": 1},
    }


@pytest.mark.django_db
def test_bulk_manager_evidence_status_uses_bounded_queries(
    incident_event,
    integrity_run,
    participant,
    monkeypatch,
):
    for offset in range(1, 11):
        ExamEvent.objects.create(
            contest=participant.contest,
            user=participant.user,
            integrity_run=integrity_run,
            integrity_command_id=uuid4(),
            incident_id=uuid4(),
            event_type="exit_fullscreen",
            event_definition_version=integrity_run.registry_version,
            event_schema_version=1,
            client_occurred_at_ms=1_005_000 + offset * 1_000,
            metadata={
                "device_kind": "desktop",
                "integrity": {
                    "definition_id": "fullscreen_integrity",
                },
            },
        )
    events = list(
        ExamEvent.objects.filter(contest=participant.contest)
        .select_related("integrity_run")
        .order_by("id")
    )
    loaded_slices = []
    original_summary = (
        integrity_evidence_service._evidence_summary_from_loaded
    )

    def record_loaded_slice(run, windows, chunks):
        loaded_slices.append((len(windows), len(chunks)))
        return original_summary(run, windows, chunks)

    monkeypatch.setattr(
        integrity_evidence_service,
        "_evidence_summary_from_loaded",
        record_loaded_slice,
    )

    with CaptureQueriesContext(connection) as captured:
        summaries = evidence_statuses_for_events(events)

    assert len(summaries) == len(events)
    assert len(captured) == 2
    assert loaded_slices == [(1, 0)] * len(events)


@pytest.mark.django_db
def test_manager_event_response_marks_purged_evidence_unavailable(
    api_client,
    incident_event,
    participant,
    requested_evidence_chunk,
    integrity_run,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.PURGED
    integrity_run.purged_by = participant.contest.owner
    integrity_run.purged_at = timezone.now()
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "purged_by",
            "purged_at",
        ]
    )
    api_client.force_authenticate(participant.contest.owner)

    response = api_client.get(
        f"/api/v1/contests/{participant.contest_id}/exam/events/"
    )

    assert response.status_code == 200
    serialized = next(
        item for item in response.json() if item["id"] == incident_event.id
    )
    assert serialized["evidence_status"] == "unavailable"
    assert serialized["evidence_sources"] == {
        "screen_share": {"status": "unavailable", "chunks": 0},
    }


@pytest.mark.django_db
def test_purge_uses_only_verified_manifest_and_exact_run_chunk_keys(
    integrity_run,
    participant,
    incident_event,
    object_store,
):
    manifest_key = f"runs/{integrity_run.id}/generation-1/manifest.json"
    segment_key = (
        f"runs/{integrity_run.id}/generation-1/segments/00000001.journal.gz"
    )
    manifest = json.dumps(
        {
            "schema_version": 1,
            "run_id": str(integrity_run.id),
            "generation": 1,
            "segments": [{"object_key": segment_key}],
            "previous_manifest": None,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    integrity_run.archive_generation = 1
    integrity_run.archive_manifest_key = manifest_key
    integrity_run.archive_manifest_sha256 = hashlib.sha256(manifest).hexdigest()
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.save(
        update_fields=[
            "archive_generation",
            "archive_manifest_key",
            "archive_manifest_sha256",
            "compute_state",
            "data_state",
        ]
    )
    own_chunk = ExamEvidenceChunk.objects.create(
        integrity_run=integrity_run,
        contest=participant.contest,
        participant=participant,
        exam_event=incident_event,
        incident_id=incident_event.incident_id,
        source="screen_share",
        recording_session_id=uuid4(),
        chunk_seq=1,
        is_init_chunk=True,
        start_at_ms=1_000_000,
        end_at_ms=1_005_000,
        object_key="integrity/exact-run/evidence.webm",
        content_type="video/webm",
        codec="vp8",
        byte_size=1024,
        sha256="a" * 64,
        status=ExamEvidenceChunk.Status.VERIFIED,
    )
    object_store.get_object.return_value = {
        "ContentLength": len(manifest),
        "Body": BytesIO(manifest),
    }
    missing = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "missing"}},
        "HeadObject",
    )
    object_store.head_object.side_effect = missing

    purge_integrity_data(integrity_run)
    purge_integrity_data(integrity_run)

    deleted = {
        item["Key"]
        for call in object_store.delete_objects.call_args_list
        for item in call.kwargs["Delete"]["Objects"]
    }
    assert deleted == {manifest_key, segment_key, own_chunk.object_key}
    assert ExamEvidenceChunk.objects.filter(integrity_run=integrity_run).count() == 0
    assert object_store.get_object.call_count == 1
    integrity_run.refresh_from_db()
    assert integrity_run.metrics["integrity_purge"]["evidence_object_keys"] == [
        own_chunk.object_key,
    ]
    assert integrity_run.archive_manifest_key == manifest_key
    assert integrity_run.archive_manifest_sha256 == hashlib.sha256(manifest).hexdigest()


@pytest.mark.django_db
def test_purge_waits_until_every_presigned_upload_lease_expires(
    requested_evidence_chunk,
    integrity_run,
    object_store,
):
    manifest_key = f"runs/{integrity_run.id}/generation-1/manifest.json"
    segment_key = (
        f"runs/{integrity_run.id}/generation-1/segments/00000001.journal.gz"
    )
    manifest = json.dumps(
        {
            "schema_version": 1,
            "run_id": str(integrity_run.id),
            "generation": 1,
            "segments": [{"object_key": segment_key}],
            "previous_manifest": None,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_generation = 1
    integrity_run.archive_manifest_key = manifest_key
    integrity_run.archive_manifest_sha256 = hashlib.sha256(manifest).hexdigest()
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_generation",
            "archive_manifest_key",
            "archive_manifest_sha256",
        ]
    )
    object_store.get_object.side_effect = lambda **kwargs: {
        "ContentLength": len(manifest),
        "Body": BytesIO(manifest),
    }
    missing = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "missing"}},
        "HeadObject",
    )
    object_store.head_object.side_effect = missing

    with pytest.raises(IntegrityEvidenceStorageError):
        purge_integrity_data(integrity_run)

    object_store.delete_objects.assert_not_called()
    assert ExamEvidenceChunk.objects.filter(
        pk=requested_evidence_chunk.pk,
    ).exists()

    requested_evidence_chunk.refresh_from_db()
    metadata = dict(requested_evidence_chunk.metadata)
    metadata["upload_url_expires_at_ms"] = 0
    requested_evidence_chunk.metadata = metadata
    requested_evidence_chunk.save(update_fields=["metadata"])

    purge_integrity_data(integrity_run)

    assert not ExamEvidenceChunk.objects.filter(
        pk=requested_evidence_chunk.pk,
    ).exists()
