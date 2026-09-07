import base64
import hashlib
import json
from datetime import timedelta
from io import BytesIO
from unittest.mock import Mock
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError
from django.core.cache import cache
from django.db import connection
from django.test import RequestFactory
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
from apps.contests.integrity_serializers import EvidenceChunkDescriptorSerializer
from apps.contests.services.anti_cheat_session import (
    active_session_key,
    get_active_session,
    set_active_session,
)
from apps.contests.services import (
    integrity_evidence as integrity_evidence_service,
)
from apps.contests.services.integrity_evidence import (
    IntegrityEvidenceRejected,
    IntegrityEvidenceStorageError,
    build_evidence_delivery,
    create_evidence_manifest,
    evidence_chunks_for_event,
    evidence_retain_windows,
    evidence_statuses_for_events,
    purge_integrity_data,
)
from apps.users.models import User
from apps.contests.tests.integrity.test_batch_gateway import worker_server, make_batch
from apps.contests.tests.integrity.test_upload_grants import resident_http


MAX_EVIDENCE_CHUNK_SEQ = 2_147_483_647
MAX_EVIDENCE_TIMESTAMP_MS = 9_007_199_254_740_991


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
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=now,
    )
    cache.delete(active_session_key(contest.id, student.id))
    yield participant
    cache.delete(active_session_key(contest.id, student.id))


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
    return f"/api/v1/contests/{event.contest_id}" "/exam/integrity/checkpoints/"


def complete_url(chunk):
    return f"/api/v1/contests/{chunk.contest_id}" "/exam/integrity/checkpoints/"


def unavailable_url(chunk):
    return f"/api/v1/contests/{chunk.contest_id}" "/exam/integrity/checkpoints/"


def unavailable_projection_payload(event, *, source="screen_share"):
    return {
        "evidence": {
            "manifests": [],
            "completions": [],
            "unavailable": [
                {
                    "run_id": str(event.integrity_run_id),
                    "incident_id": str(event.incident_id),
                    "event_id": event.id,
                    "source": source,
                    "reason": "local evidence was unavailable",
                }
            ],
        },
    }


def post_manifest(api_client, event, chunks):
    return api_client.post(
        manifest_url(event),
        {
            "evidence": {
                "manifests": [
                    {
                        "run_id": str(event.integrity_run_id),
                        "incident_id": str(event.incident_id),
                        "chunks": chunks,
                    }
                ],
                "completions": [],
                "unavailable": [],
            },
        },
        format="json",
    )


def bind_active_device(participant, device_kind):
    cache.set(
        active_session_key(
            participant.contest_id,
            participant.user_id,
        ),
        {
            "contest_id": participant.contest_id,
            "participant_id": participant.id,
            "user_id": participant.user_id,
            "device_id": "bound-device",
            "device_kind": device_kind,
        },
        timeout=300,
    )


@pytest.fixture
def resident_evidence(incident_event, participant, api_client, object_store, resident_http):
    from apps.contests.models import IntegrityBatchAdmission
    run = incident_event.integrity_run
    run.execution_backend, run.session_state = "resident", "active"
    run.accept_until = participant.contest.end_time + timedelta(seconds=300)
    run.save()
    bind_active_device(participant, "desktop")
    admission = IntegrityBatchAdmission.objects.create(run=run, participant=participant,
        batch_id=uuid4(), attempt_id=participant.integrity_attempt_id, device_id="bound-device",
        body_sha256="a" * 64, first_seq=1, last_seq=1, first_received_at=timezone.now())
    incident_event.metadata["receipt_batch_id"] = str(admission.batch_id)
    incident_event.metadata["integrity"]["device_id"] = "bound-device"
    incident_event.save()
    scope = {"run_id": run.pk, "participant_id": participant.pk,
        "device_id": "bound-device", "attempt_id": participant.integrity_attempt_id}
    api_client.force_authenticate(participant.user)
    response = api_client.post(manifest_url(incident_event), {"upload_scope": scope,
        "evidence": {"manifests": [{"run_id": run.pk, "incident_id": incident_event.incident_id,
            "chunks": [descriptor(seq=2, start=995_000, end=1_000_000)]}]}},
        format="json", HTTP_X_DEVICE_ID="bound-device")
    assert response.status_code == 200, response.data
    chunk = ExamEvidenceChunk.objects.get()
    object_store.head_object.return_value = {"ContentLength": chunk.byte_size,
        "ChecksumSHA256": base64.b64encode(bytes.fromhex(chunk.sha256)).decode()}
    return run, scope, chunk


def trusted_evidence_scope(run, participant, event):
    from apps.contests.models import IntegrityBatchAdmission
    bind_active_device(participant, "desktop")
    receipt = IntegrityBatchAdmission.objects.create(run=run, participant=participant,
        batch_id=uuid4(), attempt_id=participant.integrity_attempt_id, device_id="bound-device",
        body_sha256="b" * 64, first_seq=1, last_seq=1, first_received_at=timezone.now())
    event.metadata["receipt_batch_id"] = str(receipt.batch_id)
    event.metadata["integrity"]["device_id"] = "bound-device"
    event.save()
    return {"run_id": run.pk, "participant_id": participant.pk,
        "device_id": "bound-device", "attempt_id": participant.integrity_attempt_id}


@pytest.mark.django_db
def test_active_release_is_capped_by_own_unresolved_retain_only(resident_evidence, participant, incident_event, api_client, resident_http):
    run, scope, _ = resident_evidence
    resident_http.update(received_seq=1, processed_seq=1, commands_drained=True, release=2000000)
    response = api_client.post(manifest_url(incident_event), {"upload_scope": scope}, format="json", HTTP_X_DEVICE_ID="bound-device")
    assert response.status_code == 200
    expected = build_evidence_delivery(run, participant, 9999999999, upload_scope=scope)
    assert response.data["release_evidence_before_ms"] == min(c["start_at_ms"] for c in expected.pending_commands)
    foreign = {**scope, "attempt_id": uuid4()}
    assert not build_evidence_delivery(run, participant, 9999999999, upload_scope=foreign).pending_commands


def resident_operation(event, chunk, operation):
    if operation == "manifest":
        return {"manifests": [{"run_id": event.integrity_run_id, "incident_id": event.incident_id,
            "chunks": [descriptor(seq=3, start=1_000_000, end=1_005_000)]}]}
    if operation == "completion":
        return {"completions": [{"chunk_id": chunk.pk}]}
    if operation == "unavailable":
        return {"unavailable": [{"chunk_id": chunk.pk, "reason": "local_gap"}]}
    return {"unavailable": [{"run_id": event.integrity_run_id, "incident_id": event.incident_id,
        "event_id": event.pk, "source": "webcam", "reason": "local_gap"}]}


@pytest.mark.django_db(transaction=True)
def test_completion_revalidates_after_unlocked_storage_head(resident_evidence, participant,
        incident_event, object_store):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from django.db import close_old_connections, connection
    from apps.contests.models import IntegrityUploadGrant
    from apps.contests.services.exam_submission import finalize_submission
    run, scope, chunk = resident_evidence
    finalize_submission(participant, submit_reason="manual")
    entered, release = Event(), Event()
    head_result = object_store.head_object.return_value
    def head(**kwargs):
        assert not connection.in_atomic_block
        entered.set()
        assert release.wait(5)
        return head_result
    object_store.head_object.side_effect = head
    def request():
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(participant.user)
            return client.post(manifest_url(incident_event), {"upload_scope": scope,
                "evidence": resident_operation(incident_event, chunk, "completion")},
                format="json", HTTP_X_DEVICE_ID=scope["device_id"])
        finally:
            close_old_connections()
    with ThreadPoolExecutor(1) as pool:
        future = pool.submit(request)
        try:
            assert entered.wait(3)
            IntegrityUploadGrant.objects.filter(participant=participant).update(revoked_at=timezone.now())
        finally:
            release.set()
        assert future.result(timeout=5).status_code == 403
    chunk.refresh_from_db()
    assert chunk.status == "requested"


@pytest.mark.django_db
@pytest.mark.parametrize("operation", ["manifest", "completion", "unavailable", "projection"])
def test_resident_evidence_same_owner_allowed(resident_evidence, incident_event, api_client, operation):
    run, scope, chunk = resident_evidence
    assert chunk.metadata["integrity_upload_scope"] == {
        "device_id": scope["device_id"], "attempt_id": str(scope["attempt_id"])}
    response = api_client.post(manifest_url(incident_event), {"upload_scope": scope,
        "evidence": resident_operation(incident_event, chunk, operation)},
        format="json", HTTP_X_DEVICE_ID=scope["device_id"])
    assert response.status_code == 200, response.data


@pytest.mark.django_db
def test_resident_unowned_historical_evidence_fails_closed(resident_evidence, incident_event, api_client):
    run, scope, chunk = resident_evidence
    incident_event.metadata.pop("receipt_batch_id")
    incident_event.save()
    response = api_client.post(manifest_url(incident_event), {"upload_scope": scope,
        "evidence": resident_operation(incident_event, chunk, "unavailable")},
        format="json", HTTP_X_DEVICE_ID=scope["device_id"])
    assert response.status_code == 403
    chunk.refresh_from_db()
    assert chunk.status == "requested"


@pytest.mark.django_db
@pytest.mark.parametrize("wrong_scope", ["device", "attempt"])
@pytest.mark.parametrize("operation", ["manifest", "completion", "unavailable", "projection"])
def test_resident_evidence_cannot_cross_device_or_attempt(resident_evidence, incident_event,
        participant, api_client, object_store, wrong_scope, operation):
    run, scope, chunk = resident_evidence
    if wrong_scope == "device":
        session = get_active_session(participant.contest_id, participant.user_id)
        session["device_id"] = "device-b"
        cache.set(active_session_key(participant.contest_id, participant.user_id), session, 300)
        scope = {**scope, "device_id": "device-b"}
    else:
        participant.integrity_attempt_id = uuid4()
        participant.save(update_fields=["integrity_attempt_id"])
        scope = {**scope, "attempt_id": participant.integrity_attempt_id}
    original_metadata = dict(incident_event.metadata)
    response = api_client.post(manifest_url(incident_event), {"upload_scope": scope,
        "evidence": resident_operation(incident_event, chunk, operation)},
        format="json", HTTP_X_DEVICE_ID=scope["device_id"])
    assert response.status_code == 403, response.data
    chunk.refresh_from_db()
    incident_event.refresh_from_db()
    assert chunk.status == "requested"
    assert ExamEvidenceChunk.objects.count() == 1
    assert incident_event.metadata == original_metadata


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("invalidation", ["revoke", "shorten", "reset", "complete"])
@pytest.mark.parametrize("operation", ["manifest", "completion", "unavailable", "projection"])
def test_evidence_rechecks_scope_after_admission_barrier(resident_evidence, incident_event,
        participant, api_client, object_store, monkeypatch, invalidation, operation):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    import httpx
    from django.db import close_old_connections
    from apps.contests.models import IntegrityUploadGrant
    from apps.contests.services.exam_submission import finalize_submission
    from apps.contests.services.exam_schedule import update_exam_schedule
    from apps.contests.services.participant_state import admin_update_participant
    run, scope, chunk = resident_evidence
    finalize_submission(participant, submit_reason="manual")
    admitted, release = Event(), Event()
    original_post = httpx.post
    def block_after_admission(url, **kwargs):
        if url.endswith("/batches"):
            admitted.set()
            assert release.wait(5)
        return original_post(url, **kwargs)
    monkeypatch.setattr(httpx, "post", block_after_admission)
    def request():
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(participant.user)
            return client.post(manifest_url(incident_event), {"upload_scope": scope,
                "observations": make_batch(run_id=run.pk, participant_id=participant.pk,
                    device_id=scope["device_id"], first_seq=2, last_seq=2),
                "evidence": resident_operation(incident_event, chunk, operation)},
                format="json", HTTP_X_DEVICE_ID=scope["device_id"])
        finally:
            close_old_connections()
    with ThreadPoolExecutor(1) as pool:
        future = pool.submit(request)
        try:
            assert admitted.wait(3)
            if invalidation == "shorten":
                update_exam_schedule(participant.contest_id, start_time=participant.contest.start_time,
                    end_time=timezone.now() - timedelta(seconds=301), actor=participant.contest.owner)
            elif invalidation == "reset":
                admin_update_participant(participant, exam_status="not_started",
                    activity_user=participant.contest.owner, activity_details="reset")
            else:
                IntegrityUploadGrant.objects.filter(participant=participant).update(**{
                    "revoked_at" if invalidation == "revoke" else "completed_at": timezone.now()})
        finally:
            release.set()
        response = future.result(timeout=5)
    assert response.status_code == 403, response.data
    chunk.refresh_from_db()
    assert chunk.status == "requested"
    assert ExamEvidenceChunk.objects.count() == 1


@pytest.mark.django_db
def test_manifest_uploads_only_chunks_overlapping_incident_window(
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
            descriptor(seq=1, start=960_000, end=965_000),
            descriptor(seq=2, start=995_000, end=1_000_000),
            descriptor(seq=3, start=1_015_000, end=1_020_000),
            descriptor(seq=4, start=1_030_000, end=1_035_000),
        ],
    )

    assert response.status_code == 200
    assert [item["chunk_seq"] for item in response.json()["uploads"]] == [2]
    assert ExamEvidenceChunk.objects.count() == 1
    params = object_store.generate_presigned_url.call_args_list[0].kwargs["Params"]
    assert params["ContentLength"] == 1026
    assert params["ChecksumSHA256"] == base64.b64encode(
        bytes.fromhex(_digest(2))
    ).decode("ascii")
    assert response.json()["uploads"][0]["required_headers"] == {
        "Content-Type": "video/webm",
        "x-amz-checksum-sha256": params["ChecksumSHA256"],
    }


@pytest.mark.django_db(transaction=True)
def test_manifest_serializes_behind_schedule_and_submission(incident_event, participant, object_store):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from django.db import close_old_connections, transaction
    from apps.contests.services.exam_schedule import update_exam_schedule, lock_exam_runs
    from apps.contests.services.exam_submission import finalize_submission
    from apps.contests.services.integrity_evidence import create_evidence_manifest
    run = incident_event.integrity_run
    run.execution_backend, run.session_state, run.compute_state = "resident", "active", "stopped"
    run.accept_until = participant.contest.end_time + timedelta(seconds=300)
    run.save()
    scope = trusted_evidence_scope(run, participant, incident_event)
    entered = Event()
    descriptor_serializer = EvidenceChunkDescriptorSerializer(data=descriptor(seq=2, start=995_000, end=1_000_000))
    descriptor_serializer.is_valid(raise_exception=True)
    def upload():
        close_old_connections()
        try:
            entered.set()
            return create_evidence_manifest(run, participant, incident_event, [descriptor_serializer.validated_data], upload_scope=scope)
        finally:
            close_old_connections()
    with ThreadPoolExecutor(1) as pool:
        with transaction.atomic():
            Contest.objects.select_for_update().get(pk=participant.contest_id)
            pending = pool.submit(upload)
            assert entered.wait(2)
            # Schedule and submission share their real Contest -> Run -> Participant
            # transaction while the evidence request is competing for that scope.
            update_exam_schedule(participant.contest_id, start_time=participant.contest.start_time,
                end_time=participant.contest.end_time + timedelta(minutes=10), actor=participant.contest.owner)
            lock_exam_runs(participant.contest_id)
            current = ContestParticipant.objects.select_for_update().get(pk=participant.pk)
            finalize_submission(current, submit_reason="manual")
        assert len(pending.result(timeout=5)) == 1
    participant.refresh_from_db()
    run.refresh_from_db()
    assert participant.exam_status == "submitted"
    assert run.schedule_revision == 2
    assert ExamEvidenceChunk.objects.filter(integrity_run=run, participant=participant).count() == 1


@pytest.mark.django_db
def test_resident_unavailable_evidence_terminates_without_worker_compute(incident_event, participant):
    from apps.contests.services.integrity_evidence import report_evidence_unavailable_projection, build_evidence_delivery
    run = incident_event.integrity_run
    run.execution_backend, run.session_state, run.compute_state = "resident", "draining", "stopped"
    run.accept_until = participant.contest.end_time + timedelta(seconds=300)
    run.save()
    scope = trusted_evidence_scope(run, participant, incident_event)
    for source in ("screen_share", "webcam"):
        report_evidence_unavailable_projection(run, participant, incident_event, source=source, reason="local_gap", upload_scope=scope)
    assert not build_evidence_delivery(run, participant, now_ms=2_000_000).pending_commands


@pytest.mark.django_db
def test_unverified_late_event_creates_no_new_evidence_demand(incident_event, participant):
    from apps.contests.services.integrity_evidence import build_evidence_delivery
    incident_event.metadata["integrity"]["late_unverified"] = True
    incident_event.save()
    assert not build_evidence_delivery(incident_event.integrity_run, participant, now_ms=2_000_000).pending_commands


@pytest.mark.django_db
def test_final_sequence_waits_for_own_evidence_termination(incident_event, participant, another_participant):
    from apps.contests.models import IntegrityUploadGrant
    from apps.contests.services.exam_submission import finalize_submission
    from apps.contests.services.integrity_upload_grants import save_upload_progress
    from apps.contests.services.integrity_evidence import report_evidence_unavailable_projection
    run = incident_event.integrity_run
    run.execution_backend, run.session_state = "resident", "active"
    run.accept_until = participant.contest.end_time + timedelta(seconds=300)
    run.save()
    scope = trusted_evidence_scope(run, participant, incident_event)
    bind_active_device(participant, "desktop")
    finalize_submission(participant, submit_reason="manual")
    grant = IntegrityUploadGrant.objects.get(participant=participant)
    grant.final_seq = 0
    grant.save()
    progress = {"received_seq": 0, "processed_seq": 0, "commands_drained": True}
    assert save_upload_progress(run, participant, scope, progress) == "pending"
    report_evidence_unavailable_projection(run, participant, incident_event, source="screen_share", reason="local_gap", upload_scope=scope)
    assert save_upload_progress(run, participant, scope, progress) == "pending"
    report_evidence_unavailable_projection(run, participant, incident_event, source="webcam", reason="local_gap", upload_scope=scope)
    ExamEvent.objects.create(contest=participant.contest, user=another_participant.user, integrity_run=run,
        incident_id=uuid4(), event_type="exit_fullscreen", client_occurred_at_ms=1_005_000,
        metadata={"integrity": {"definition_id": "fullscreen_integrity", "phase": "escalated"}})
    assert save_upload_progress(run, participant, scope, progress) == "complete"


@pytest.mark.django_db
def test_closed_resident_evidence_cannot_bypass_upload_scope(api_client, incident_event, participant, object_store):
    api_client.force_authenticate(participant.user)
    response = post_manifest(api_client, incident_event, [descriptor(seq=2, start=995_000, end=1_000_000)])
    assert response.status_code == 200
    chunk = ExamEvidenceChunk.objects.get()
    run = incident_event.integrity_run
    run.execution_backend, run.session_state = "resident", "closed"
    run.save()
    response = api_client.post(manifest_url(incident_event), {"evidence": {"unavailable": [
        {"chunk_id": str(chunk.pk), "reason": "local_gap"}]}}, format="json")
    assert response.status_code == 403
    chunk.refresh_from_db()
    assert chunk.status == "requested"


@pytest.mark.django_db
def test_spoofed_event_device_kind_cannot_suppress_bound_desktop_source(
    integrity_run,
    participant,
    incident_event,
):
    metadata = dict(incident_event.metadata)
    metadata["device_kind"] = "tablet"
    incident_event.metadata = metadata
    incident_event.save(update_fields=["metadata"])
    bind_active_device(participant, "desktop")

    windows = evidence_retain_windows(
        integrity_run,
        participant,
        after_ms=0,
    )

    assert [window.sources for window in windows] == [("screen_share", "webcam")]


@pytest.mark.django_db
@pytest.mark.parametrize("bound_device_kind", [None, "unknown"])
def test_missing_or_unknown_device_binding_cannot_suppress_evidence_source(
    integrity_run,
    participant,
    incident_event,
    bound_device_kind,
):
    metadata = dict(incident_event.metadata)
    metadata["device_kind"] = "tablet"
    incident_event.metadata = metadata
    incident_event.save(update_fields=["metadata"])
    if bound_device_kind is not None:
        bind_active_device(participant, bound_device_kind)

    windows = evidence_retain_windows(
        integrity_run,
        participant,
        after_ms=0,
    )

    assert [window.sources for window in windows] == [("screen_share", "webcam")]


@pytest.mark.django_db
def test_spoofed_tablet_user_agent_cannot_narrow_frozen_source_union(
    integrity_run,
    participant,
    incident_event,
):
    metadata = dict(incident_event.metadata)
    metadata["device_kind"] = "tablet"
    incident_event.metadata = metadata
    incident_event.save(update_fields=["metadata"])
    spoofed_user_agent = (
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 Mobile/15E148"
    )
    request = RequestFactory().post(
        "/exam/start",
        HTTP_USER_AGENT=spoofed_user_agent,
    )
    set_active_session(
        participant.contest,
        participant,
        request,
        "spoofed-tablet-device",
    )
    assert (
        get_active_session(
            participant.contest_id,
            participant.user_id,
        )["ua"]
        == spoofed_user_agent
    )

    windows = evidence_retain_windows(
        integrity_run,
        participant,
        after_ms=0,
    )

    assert [window.sources for window in windows] == [("screen_share", "webcam")]


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
                recording_session_id=("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
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
                recording_session_id=("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
            )
        ],
    )

    assert first.status_code == 200
    assert second.status_code == 400
    assert second.json()["code"] == "evidence_incident_source_limit_exceeded"
    assert ExamEvidenceChunk.objects.count() == 1
    assert object_store.generate_presigned_url.call_count == 1


@pytest.mark.django_db
def test_manifest_counts_only_retained_evidence_against_source_budget(
    api_client,
    incident_event,
    participant,
    integrity_run,
    object_store,
):
    policy = dict(integrity_run.policy_snapshot)
    evidence = dict(policy["evidence"])
    evidence["local_cap_bytes_per_source"] = 1_027
    policy["evidence"] = evidence
    integrity_run.policy_snapshot = policy
    integrity_run.save(update_fields=["policy_snapshot"])
    api_client.force_authenticate(participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(seq=1, start=960_000, end=965_000),
            descriptor(seq=2, start=970_000, end=975_000),
            descriptor(seq=3, start=1_000_000, end=1_005_000),
        ],
    )

    assert response.status_code == 200
    assert [item["chunk_seq"] for item in response.json()["uploads"]] == [3]
    assert list(ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)) == [3]
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
def test_manifest_rejects_mismatched_supplied_immediate_predecessor(
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
            descriptor(
                seq=3,
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
def test_manifest_allows_standalone_segment_after_unavailable_predecessor(
    api_client,
    incident_event,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)
    incident_event.client_occurred_at_ms = 975_000
    incident_event.save(update_fields=["client_occurred_at_ms"])
    first = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=2, start=970_000, end=975_000)],
    )
    assert first.status_code == 200
    predecessor = ExamEvidenceChunk.objects.get(chunk_seq=2)
    predecessor.status = ExamEvidenceChunk.Status.UNAVAILABLE
    predecessor.save(update_fields=["status"])

    incident_event.client_occurred_at_ms = 1_005_000
    incident_event.save(update_fields=["client_occurred_at_ms"])
    response = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=3, start=1_000_000, end=1_005_000)],
    )

    assert response.status_code == 200
    assert [item["chunk_seq"] for item in response.json()["uploads"]] == [3]
    assert sorted(ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)) == [
        2,
        3,
    ]
    assert object_store.generate_presigned_url.call_count == 2


@pytest.mark.django_db
def test_manifest_allows_standalone_non_init_chunks_without_predecessors(
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
    assert isolated.status_code == 200
    assert [item["chunk_seq"] for item in isolated.json()["uploads"]] == [2]

    gapped = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=4, start=1_005_000, end=1_010_000)],
    )
    assert gapped.status_code == 200
    assert [item["chunk_seq"] for item in gapped.json()["uploads"]] == [4]
    assert list(ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)) == [2, 4]


@pytest.mark.django_db
def test_manifest_does_not_retain_unselected_submitted_predecessor(
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
    assert list(ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)) == [3]
    assert object_store.generate_presigned_url.call_count == 1


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
def test_manifest_rejects_arbitrary_isolated_init_sequence(
    api_client,
    incident_event,
    participant,
    object_store,
):
    arbitrary_init = descriptor(
        seq=8,
        start=1_000_000,
        end=1_005_000,
    )
    arbitrary_init["is_init_chunk"] = True
    arbitrary_init["previous_sha256"] = ""
    api_client.force_authenticate(participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [arbitrary_init],
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_chunk_chain_mismatch"
    assert ExamEvidenceChunk.objects.count() == 0
    object_store.generate_presigned_url.assert_not_called()


@pytest.mark.django_db
def test_manifest_rejects_init_after_lower_persisted_non_init_chunk(
    api_client,
    incident_event,
    participant,
    object_store,
):
    api_client.force_authenticate(participant.user)
    persisted = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(seq=1, start=970_000, end=975_000),
            descriptor(seq=2, start=1_000_000, end=1_005_000),
        ],
    )
    assert persisted.status_code == 200
    assert list(ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)) == [2]
    later_init = descriptor(
        seq=8,
        start=1_005_000,
        end=1_010_000,
    )
    later_init["is_init_chunk"] = True
    later_init["previous_sha256"] = ""

    response = post_manifest(
        api_client,
        incident_event,
        [later_init],
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_chunk_chain_mismatch"
    assert list(ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)) == [2]
    assert object_store.generate_presigned_url.call_count == 1


@pytest.mark.django_db
@pytest.mark.parametrize("init_seq", [0, 1])
def test_manifest_rejects_new_init_after_higher_persisted_non_init_chunk(
    api_client,
    incident_event,
    participant,
    object_store,
    init_seq,
):
    api_client.force_authenticate(participant.user)
    persisted = post_manifest(
        api_client,
        incident_event,
        [
            descriptor(seq=1, start=960_000, end=965_000),
            descriptor(seq=2, start=970_000, end=975_000),
            descriptor(seq=3, start=1_000_000, end=1_005_000),
        ],
    )
    assert persisted.status_code == 200
    assert list(ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)) == [3]
    new_init = descriptor(
        seq=init_seq,
        start=1_005_000,
        end=1_010_000,
    )
    new_init["is_init_chunk"] = True
    new_init["previous_sha256"] = ""

    response = post_manifest(
        api_client,
        incident_event,
        [new_init],
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_chunk_chain_mismatch"
    assert list(ExamEvidenceChunk.objects.values_list("chunk_seq", flat=True)) == [3]
    assert object_store.generate_presigned_url.call_count == 1


@pytest.mark.django_db
def test_manifest_rejects_init_after_lower_submitted_context_chunk(
    api_client,
    incident_event,
    participant,
    object_store,
):
    lower_context = descriptor(
        seq=2,
        start=970_000,
        end=975_000,
    )
    later_init = descriptor(
        seq=8,
        start=1_000_000,
        end=1_005_000,
    )
    later_init["is_init_chunk"] = True
    later_init["previous_sha256"] = ""
    api_client.force_authenticate(participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [lower_context, later_init],
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_chunk_chain_mismatch"
    assert ExamEvidenceChunk.objects.count() == 0
    object_store.generate_presigned_url.assert_not_called()


@pytest.mark.parametrize(
    ("field_name", "oversized_value"),
    [
        ("chunk_seq", MAX_EVIDENCE_CHUNK_SEQ + 1),
        ("start_at_ms", MAX_EVIDENCE_TIMESTAMP_MS + 1),
        ("end_at_ms", MAX_EVIDENCE_TIMESTAMP_MS + 1),
    ],
)
def test_descriptor_rejects_scalars_outside_model_or_wire_range(
    field_name,
    oversized_value,
):
    payload = descriptor(
        seq=1,
        start=1_000_000,
        end=1_005_000,
    )
    payload[field_name] = oversized_value
    if field_name == "start_at_ms":
        payload["end_at_ms"] = oversized_value + 1

    serializer = EvidenceChunkDescriptorSerializer(data=payload)

    assert not serializer.is_valid()
    assert field_name in serializer.errors


def test_descriptor_accepts_exact_model_and_wire_scalar_maxima():
    sequence_payload = descriptor(
        seq=1,
        start=1_000_000,
        end=1_005_000,
    )
    sequence_payload.update(
        {
            "chunk_seq": MAX_EVIDENCE_CHUNK_SEQ,
            "is_init_chunk": False,
            "previous_sha256": "a" * 64,
        }
    )
    timestamp_payload = descriptor(
        seq=1,
        start=MAX_EVIDENCE_TIMESTAMP_MS - 1,
        end=MAX_EVIDENCE_TIMESTAMP_MS,
    )

    sequence_serializer = EvidenceChunkDescriptorSerializer(
        data=sequence_payload,
    )
    timestamp_serializer = EvidenceChunkDescriptorSerializer(
        data=timestamp_payload,
    )

    assert sequence_serializer.is_valid(), sequence_serializer.errors
    assert timestamp_serializer.is_valid(), timestamp_serializer.errors


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
            "integrity": {
                "definition_id": "fullscreen_integrity",
                "phase": "escalated",
            },
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
        {
            "evidence": {
                "manifests": [],
                "completions": [
                    {
                        "chunk_id": str(requested_evidence_chunk.id),
                    }
                ],
                "unavailable": [],
            },
        },
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
        {
            "evidence": {
                "manifests": [],
                "completions": [
                    {
                        "chunk_id": str(requested_evidence_chunk.id),
                    }
                ],
                "unavailable": [],
            },
        },
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
            "evidence": {
                "manifests": [],
                "completions": [],
                "unavailable": [
                    {
                        "chunk_id": str(requested_evidence_chunk.id),
                        "reason": "local OPFS entry was evicted",
                    }
                ],
            },
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
def test_unavailable_projection_without_chunk_terminates_retain_and_marks_manager_status(
    api_client,
    incident_event,
    integrity_run,
    participant,
):
    api_client.force_authenticate(participant.user)

    before = build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    )
    assert len(before.pending_commands) == 1

    response = api_client.post(
        unavailable_url(incident_event),
        unavailable_projection_payload(incident_event),
        format="json",
    )
    duplicate = api_client.post(
        unavailable_url(incident_event),
        unavailable_projection_payload(incident_event),
        format="json",
    )
    webcam = api_client.post(
        unavailable_url(incident_event),
        unavailable_projection_payload(incident_event, source="webcam"),
        format="json",
    )

    assert response.status_code == duplicate.status_code == webcam.status_code == 200
    assert response.json() == duplicate.json()
    assert response.json()["unavailable"][0]["status"] == "unavailable"
    assert ExamEvidenceChunk.objects.count() == 0
    assert not build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    ).pending_commands

    api_client.force_authenticate(participant.contest.owner)
    manager_response = api_client.get(
        f"/api/v1/contests/{participant.contest_id}/exam/events/"
    )
    serialized = next(
        item
        for item in manager_response.json()["events"]
        if item["id"] == incident_event.id
    )
    assert serialized["evidence_status"] == "unavailable"
    assert serialized["evidence_sources"] == {
        "screen_share": {"status": "unavailable", "chunks": 0},
        "webcam": {"status": "unavailable", "chunks": 0},
    }


@pytest.mark.django_db
def test_triggered_and_restored_inside_grace_do_not_request_evidence(
    integrity_run,
    participant,
):
    incident_id = uuid4()
    for event_type, phase, occurred_at in (
        ("exit_fullscreen_triggered", "triggered", 1_005_000),
        ("fullscreen_restored", "restored", 1_006_000),
    ):
        ExamEvent.objects.create(
            contest=participant.contest,
            user=participant.user,
            integrity_run=integrity_run,
            integrity_command_id=uuid4(),
            incident_id=incident_id,
            event_type=event_type,
            event_definition_version=integrity_run.registry_version,
            event_schema_version=1,
            client_occurred_at_ms=occurred_at,
            metadata={
                "device_kind": "desktop",
                "integrity": {
                    "definition_id": "fullscreen_integrity",
                    "phase": phase,
                },
            },
        )

    delivery = build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    )

    assert delivery.pending_commands == ()


@pytest.mark.django_db
def test_aliased_chunk_outside_incident_window_is_not_projected_or_played(
    incident_event,
    integrity_run,
    participant,
):
    chunk = ExamEvidenceChunk.objects.create(
        integrity_run=integrity_run,
        contest=participant.contest,
        participant=participant,
        exam_event=incident_event,
        incident_id=incident_event.incident_id,
        source=ExamEvidenceChunk.Source.SCREEN,
        recording_session_id=uuid4(),
        chunk_seq=1,
        is_init_chunk=True,
        start_at_ms=900_000,
        end_at_ms=905_000,
        object_key="integrity/far-away.webm",
        content_type="video/webm",
        codec="vp8",
        byte_size=1024,
        sha256="a" * 64,
        previous_sha256="",
        status=ExamEvidenceChunk.Status.VERIFIED,
        metadata={"incident_ids": [str(incident_event.incident_id)]},
    )

    summary = evidence_statuses_for_events([incident_event])[incident_event.id]

    assert summary["evidence_sources"]["screen_share"] == {
        "status": "pending",
        "chunks": 0,
    }
    assert chunk not in evidence_chunks_for_event(incident_event)


@pytest.mark.django_db
def test_forged_raw_unavailable_projection_marker_is_ignored(
    integrity_run,
    incident_event,
    participant,
):
    metadata = dict(incident_event.metadata)
    metadata["integrity_evidence_unavailable_markers"] = [
        {
            "version": 1,
            "run_id": str(integrity_run.id),
            "participant_id": participant.id,
            "incident_id": str(incident_event.incident_id),
            "event_id": incident_event.id,
            "source": "screen_share",
            "start_at_ms": 995_000,
            "end_at_ms": 1_015_000,
            "reason": "forged",
            "signature": "0" * 64,
        },
    ]
    incident_event.metadata = metadata
    incident_event.save(update_fields=["metadata"])

    delivery = build_evidence_delivery(
        integrity_run,
        participant,
        now_ms=1_100_000,
    )

    assert len(delivery.pending_commands) == 1


@pytest.mark.django_db
def test_unavailable_projection_keeps_available_source_visible(
    api_client,
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
            "integrity": {"definition_id": "listener_integrity"},
        },
    )
    window = next(
        item
        for item in evidence_retain_windows(
            integrity_run,
            participant,
            after_ms=0,
        )
        if item.incident_id == event.incident_id
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
        start_at_ms=window.start_at_ms,
        end_at_ms=window.end_at_ms,
        object_key="integrity/mixed-source/no-chunk.webm",
        content_type="video/webm",
        codec="vp8",
        byte_size=1024,
        sha256="a" * 64,
        status=ExamEvidenceChunk.Status.VERIFIED,
    )
    api_client.force_authenticate(participant.user)

    response = api_client.post(
        unavailable_url(event),
        unavailable_projection_payload(event, source="webcam"),
        format="json",
    )

    assert response.status_code == 200
    api_client.force_authenticate(participant.contest.owner)
    manager_response = api_client.get(
        f"/api/v1/contests/{participant.contest_id}/exam/events/"
    )
    serialized = next(
        item for item in manager_response.json()["events"] if item["id"] == event.id
    )
    assert serialized["evidence_status"] == "available"
    assert serialized["evidence_sources"] == {
        "screen_share": {"status": "available", "chunks": 1},
        "webcam": {"status": "unavailable", "chunks": 0},
    }


@pytest.mark.django_db
def test_manager_can_review_verified_integrity_video_chunk(
    api_client,
    integrity_run,
    participant,
    incident_event,
    monkeypatch,
):
    chunk = ExamEvidenceChunk.objects.create(
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
        object_key="integrity/review/chunk.webm",
        content_type="video/webm",
        codec="vp8",
        byte_size=1024,
        sha256="a" * 64,
        status=ExamEvidenceChunk.Status.VERIFIED,
    )
    monkeypatch.setattr(
        "apps.contests.views.exam_evidence.generate_get_url",
        lambda _bucket, key: f"https://r2.example/{key}",
    )
    api_client.force_authenticate(participant.contest.owner)

    response = api_client.get(
        f"/api/v1/contests/{participant.contest_id}/exam/integrity/evidence/review/",
        {"event_id": incident_event.id},
    )

    assert response.status_code == 200
    assert response.json()["items"] == [
        {
            "chunk_id": str(chunk.id),
            "source": "screen_share",
            "status": "verified",
            "start_at_ms": 1_000_000,
            "end_at_ms": 1_005_000,
            "byte_size": 1024,
            "codec": "vp8",
            "content_type": "video/webm",
            "url": "https://r2.example/integrity/review/chunk.webm",
        }
    ]


@pytest.mark.django_db
def test_manager_review_lists_chunk_associated_through_bulk_manifest_metadata(
    api_client,
    integrity_run,
    participant,
    incident_event,
    monkeypatch,
):
    related_event = ExamEvent.objects.create(
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
    chunk = ExamEvidenceChunk.objects.create(
        integrity_run=integrity_run,
        contest=participant.contest,
        participant=participant,
        exam_event=incident_event,
        incident_id=incident_event.incident_id,
        source="webcam",
        recording_session_id=uuid4(),
        chunk_seq=1,
        is_init_chunk=True,
        start_at_ms=1_000_000,
        end_at_ms=1_005_000,
        object_key="integrity/review/bulk-associated.webm",
        content_type="video/webm",
        codec="vp8",
        byte_size=2048,
        sha256="b" * 64,
        status=ExamEvidenceChunk.Status.VERIFIED,
        metadata={"incident_ids": [str(related_event.incident_id)]},
    )
    monkeypatch.setattr(
        "apps.contests.views.exam_evidence.generate_get_url",
        lambda _bucket, key: f"https://r2.example/{key}",
    )
    api_client.force_authenticate(participant.contest.owner)

    response = api_client.get(
        f"/api/v1/contests/{participant.contest_id}/exam/integrity/evidence/review/",
        {"event_id": related_event.id},
    )

    assert response.status_code == 200
    assert response.json()["evidence_status"] == "available"
    assert response.json()["items"] == [
        {
            "chunk_id": str(chunk.id),
            "source": "webcam",
            "status": "verified",
            "start_at_ms": 1_000_000,
            "end_at_ms": 1_005_000,
            "byte_size": 2048,
            "codec": "vp8",
            "content_type": "video/webm",
            "url": "https://r2.example/integrity/review/bulk-associated.webm",
        }
    ]


@pytest.mark.django_db
def test_unavailable_projection_rejects_other_participants_incident(
    api_client,
    another_participant,
    incident_event,
):
    api_client.force_authenticate(another_participant.user)

    response = api_client.post(
        unavailable_url(incident_event),
        unavailable_projection_payload(incident_event),
        format="json",
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_unavailable_projection_accepts_every_contest_enabled_source(
    api_client,
    incident_event,
    participant,
):
    api_client.force_authenticate(participant.user)

    response = api_client.post(
        unavailable_url(incident_event),
        unavailable_projection_payload(incident_event, source="webcam"),
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["unavailable"][0]["source"] == "webcam"


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
            "integrity": {
                "definition_id": "fullscreen_integrity",
                "phase": "escalated",
            },
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
    assert first.pending_commands[0]["incident_id"] == str(incident_event.incident_id)
    assert first.release_before_ms == 1_000_000


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
    assert command["sources"] == ["webcam"]


@pytest.mark.django_db
def test_delivery_does_not_rerequest_an_available_source(
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
        object_key="integrity/verified-interval/screen.webm",
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

    command = next(
        item
        for item in delivery.pending_commands
        if item["incident_id"] == str(incident_event.incident_id)
    )
    assert command["sources"] == ["webcam"]


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

    response = api_client.get(f"/api/v1/contests/{participant.contest_id}/exam/events/")

    assert response.status_code == 200
    serialized = next(
        item for item in response.json()["events"] if item["id"] == incident_event.id
    )
    assert serialized["evidence_status"] == "available"
    assert serialized["evidence_sources"] == {
        "screen_share": {"status": "available", "chunks": 1},
        "webcam": {"status": "pending", "chunks": 0},
    }


@pytest.mark.django_db
def test_manager_event_response_exposes_any_verified_interval_as_available(
    api_client,
    incident_event,
    participant,
    requested_evidence_chunk,
):
    requested_evidence_chunk.status = ExamEvidenceChunk.Status.VERIFIED
    requested_evidence_chunk.verified_at = timezone.now()
    requested_evidence_chunk.save(update_fields=["status", "verified_at"])
    api_client.force_authenticate(participant.contest.owner)

    response = api_client.get(f"/api/v1/contests/{participant.contest_id}/exam/events/")

    assert response.status_code == 200
    serialized = next(
        item for item in response.json()["events"] if item["id"] == incident_event.id
    )
    assert serialized["evidence_status"] == "available"
    assert serialized["evidence_sources"] == {
        "screen_share": {"status": "available", "chunks": 1},
        "webcam": {"status": "pending", "chunks": 0},
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
                    "phase": "escalated",
                },
            },
        )
    events = list(
        ExamEvent.objects.filter(contest=participant.contest)
        .select_related("integrity_run")
        .order_by("id")
    )
    loaded_slices = []
    original_summary = integrity_evidence_service._evidence_summary_from_loaded

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

    response = api_client.get(f"/api/v1/contests/{participant.contest_id}/exam/events/")

    assert response.status_code == 200
    serialized = next(
        item for item in response.json()["events"] if item["id"] == incident_event.id
    )
    assert serialized["evidence_status"] == "unavailable"
    assert serialized["evidence_sources"] == {
        "screen_share": {"status": "unavailable", "chunks": 0},
        "webcam": {"status": "unavailable", "chunks": 0},
    }


@pytest.mark.django_db
def test_purge_uses_only_verified_manifest_and_exact_run_chunk_keys(
    integrity_run,
    participant,
    incident_event,
    object_store,
):
    manifest_key = f"runs/{integrity_run.id}/generation-1/manifest.json"
    segment_key = f"runs/{integrity_run.id}/generation-1/segments/00000001.journal.gz"
    manifest = json.dumps(
        {
            "schema_version": 1,
            "run_id": str(integrity_run.id),
            "generation": 1,
            "segments": [{"object_key": segment_key}],
            "previous_manifest": None,
            "previous_manifest_sha256": None,
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
    segment_key = f"runs/{integrity_run.id}/generation-1/segments/00000001.journal.gz"
    manifest = json.dumps(
        {
            "schema_version": 1,
            "run_id": str(integrity_run.id),
            "generation": 1,
            "segments": [{"object_key": segment_key}],
            "previous_manifest": None,
            "previous_manifest_sha256": None,
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


def archive_manifest(
    integrity_run,
    generation,
    *,
    previous_manifest,
    previous_manifest_sha256,
    segment_count=1,
):
    payload = {
        "schema_version": 1,
        "run_id": str(integrity_run.id),
        "generation": generation,
        "segments": [
            {
                "object_key": (
                    f"runs/{integrity_run.id}/generation-{generation}/"
                    f"segments/{index:08d}.journal.gz"
                )
            }
            for index in range(1, segment_count + 1)
        ],
        "previous_manifest": previous_manifest,
        "previous_manifest_sha256": previous_manifest_sha256,
    }
    content = json.dumps(
        payload,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    key = f"runs/{integrity_run.id}/generation-{generation}/manifest.json"
    return key, content, hashlib.sha256(content).hexdigest()


@pytest.mark.django_db
@pytest.mark.parametrize(
    (
        "generation",
        "previous_generation",
        "previous_key_generation",
        "redundant_digest",
    ),
    [
        (2, None, None, None),
        (3, 1, 1, "match"),
        (2, 1, 9, "match"),
        (2, 1, 1, None),
        (2, 1, 1, "mismatch"),
        (1, 1, 1, "match"),
    ],
)
def test_purge_rejects_inexact_archive_manifest_chain_before_delete(
    integrity_run,
    object_store,
    generation,
    previous_generation,
    previous_key_generation,
    redundant_digest,
):
    previous_digest = "a" * 64
    previous_manifest = (
        None
        if previous_generation is None
        else {
            "generation": previous_generation,
            "object_key": (
                f"runs/{integrity_run.id}/"
                f"generation-{previous_key_generation}/manifest.json"
            ),
            "sha256": previous_digest,
        }
    )
    redundant = (
        previous_digest
        if redundant_digest == "match"
        else "b" * 64
        if redundant_digest == "mismatch"
        else None
    )
    key, content, digest = archive_manifest(
        integrity_run,
        generation,
        previous_manifest=previous_manifest,
        previous_manifest_sha256=redundant,
    )
    integrity_run.archive_generation = generation
    integrity_run.archive_manifest_key = key
    integrity_run.archive_manifest_sha256 = digest
    body = BytesIO(content)
    object_store.get_object.return_value = {
        "ContentLength": len(content),
        "Body": body,
    }

    with pytest.raises(IntegrityEvidenceStorageError):
        purge_integrity_data(integrity_run)

    object_store.delete_objects.assert_not_called()
    assert body.closed


@pytest.mark.django_db
def test_generation_one_manifest_requires_explicit_previous_manifest_field(
    integrity_run,
    object_store,
):
    key, content, _ = archive_manifest(
        integrity_run,
        1,
        previous_manifest=None,
        previous_manifest_sha256=None,
    )
    payload = json.loads(content)
    payload.pop("previous_manifest")
    content = json.dumps(
        payload,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    integrity_run.archive_generation = 1
    integrity_run.archive_manifest_key = key
    integrity_run.archive_manifest_sha256 = hashlib.sha256(
        content,
    ).hexdigest()
    body = BytesIO(content)
    object_store.get_object.return_value = {
        "ContentLength": len(content),
        "Body": body,
    }

    with pytest.raises(IntegrityEvidenceStorageError):
        purge_integrity_data(integrity_run)

    object_store.delete_objects.assert_not_called()
    assert body.closed


@pytest.mark.django_db
def test_archive_chain_accepts_exact_generation_and_redundant_digest_links(
    integrity_run,
    object_store,
):
    first_key, first_content, first_digest = archive_manifest(
        integrity_run,
        1,
        previous_manifest=None,
        previous_manifest_sha256=None,
    )
    second_key, second_content, second_digest = archive_manifest(
        integrity_run,
        2,
        previous_manifest={
            "generation": 1,
            "object_key": first_key,
            "sha256": first_digest,
        },
        previous_manifest_sha256=first_digest,
    )
    integrity_run.archive_generation = 2
    integrity_run.archive_manifest_key = second_key
    integrity_run.archive_manifest_sha256 = second_digest
    bodies = {
        first_key: BytesIO(first_content),
        second_key: BytesIO(second_content),
    }
    object_store.get_object.side_effect = lambda **kwargs: {
        "ContentLength": len(
            first_content if kwargs["Key"] == first_key else second_content
        ),
        "Body": bodies[kwargs["Key"]],
    }

    keys = integrity_evidence_service._load_archive_manifest_chain(
        object_store,
        integrity_run,
    )

    assert first_key in keys
    assert second_key in keys
    assert all(body.closed for body in bodies.values())


@pytest.mark.django_db
def test_archive_chain_enforces_generation_budget_before_loading(
    integrity_run,
    object_store,
    monkeypatch,
):
    monkeypatch.setattr(
        integrity_evidence_service,
        "_MAX_ARCHIVE_GENERATIONS",
        1,
    )
    integrity_run.archive_generation = 2
    integrity_run.archive_manifest_key = (
        f"runs/{integrity_run.id}/generation-2/manifest.json"
    )
    integrity_run.archive_manifest_sha256 = "a" * 64

    with pytest.raises(IntegrityEvidenceStorageError):
        integrity_evidence_service._load_archive_manifest_chain(
            object_store,
            integrity_run,
        )

    object_store.get_object.assert_not_called()


@pytest.mark.django_db
def test_archive_chain_enforces_cumulative_key_budget_while_loading(
    integrity_run,
    object_store,
    monkeypatch,
):
    monkeypatch.setattr(
        integrity_evidence_service,
        "_MAX_PURGE_KEYS",
        2,
    )
    key, content, digest = archive_manifest(
        integrity_run,
        1,
        previous_manifest=None,
        previous_manifest_sha256=None,
        segment_count=2,
    )
    integrity_run.archive_generation = 1
    integrity_run.archive_manifest_key = key
    integrity_run.archive_manifest_sha256 = digest
    body = BytesIO(content)
    object_store.get_object.return_value = {
        "ContentLength": len(content),
        "Body": body,
    }

    with pytest.raises(IntegrityEvidenceStorageError):
        integrity_evidence_service._load_archive_manifest_chain(
            object_store,
            integrity_run,
        )

    object_store.delete_objects.assert_not_called()
    assert body.closed
