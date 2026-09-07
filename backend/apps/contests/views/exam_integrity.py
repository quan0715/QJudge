"""Single student checkpoint gateway for observations and evidence."""

import time

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.core.throttles import ExamEventsThrottle

from ..infrastructure.integrity_worker_client import (
    IntegrityWorkerProtocolError,
    IntegrityWorkerRejected,
    IntegrityWorkerUnavailable,
    build_integrity_worker_client,
)
from ..integrity_serializers import (
    MAX_INTEGRITY_BATCH_BYTES,
    IntegrityCheckpointSerializer,
    canonical_integrity_batch_bytes,
)
from ..models import (
    Contest,
    ContestParticipant,
    ExamEvidenceChunk,
    ExamEvent,
    ExamIntegrityRun,
    ExamStatus,
)
from ..services.anti_cheat_session import get_active_session, get_device_id
from ..services.integrity_presence import record_checkpoint
from ..services.integrity_evidence import (
    IntegrityEvidenceRejected,
    IntegrityEvidenceStorageError,
    build_evidence_delivery,
    complete_evidence_chunk,
    create_evidence_manifest,
    report_evidence_unavailable,
    report_evidence_unavailable_projection,
)

ACTIVE_INTEGRITY_EXAM_STATUSES = {
    ExamStatus.IN_PROGRESS,
    ExamStatus.PAUSED,
    ExamStatus.LOCKED,
}


class ExamIntegrityMixin:
    @staticmethod
    def _checkpoint_evidence_error(error):
        if isinstance(error, IntegrityEvidenceRejected):
            return Response(
                {"code": error.code},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"code": "evidence_storage_unavailable"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="integrity/checkpoints",
        permission_classes=[permissions.IsAuthenticated],
        throttle_classes=[ExamEventsThrottle],
    )
    def integrity_checkpoints(self, request, contest_pk=None):
        serializer = IntegrityCheckpointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contest = get_object_or_404(Contest, id=contest_pk)
        if not getattr(request.user, "is_student", False):
            raise PermissionDenied("Only contest participants may submit checkpoints.")
        participant = ContestParticipant.objects.filter(
            contest=contest,
            user=request.user,
        ).first()
        if participant is None:
            raise PermissionDenied("Only contest participants may submit checkpoints.")

        upload_scope = serializer.validated_data.get("upload_scope")
        if not upload_scope:
            raise PermissionDenied("Integrity checkpoints require the trusted upload scope.")
        return self._resident_checkpoint(request, contest, participant, serializer.validated_data)

    def _resident_checkpoint(self, request, contest, participant, data):
        from ..services.integrity_upload_grants import admit_checkpoint, save_upload_progress
        scope = data["upload_scope"]
        run, participant, body = admit_checkpoint(contest, participant, scope, data.get("observations"),
            request_device=get_device_id(request), final_seq=data.get("final_seq"), has_evidence=any(data["evidence"].values()))
        # Evidence-only operations receive the same scope authorization as events.
        evidence = data["evidence"]
        for manifest in evidence.get("manifests", ()):
            if manifest["run_id"] != run.pk:
                raise PermissionDenied("Evidence Run scope mismatch.")
        for operation in (*evidence.get("completions", ()), *evidence.get("unavailable", ())):
            if "chunk_id" in operation:
                if not ExamEvidenceChunk.objects.filter(pk=operation["chunk_id"], integrity_run=run,
                        participant=participant).exists():
                    raise PermissionDenied("Evidence chunk scope mismatch.")
            elif operation.get("run_id") != run.pk:
                raise PermissionDenied("Evidence Run scope mismatch.")
        try:
            client = build_integrity_worker_client()
            if body is not None:
                if len(body) > MAX_INTEGRITY_BATCH_BYTES:
                    raise serializers.ValidationError("Encoded batch must not exceed 1 MiB.")
                client.post_batch(run, body)
                if participant.exam_status in ACTIVE_INTEGRITY_EXAM_STATUSES:
                    record_checkpoint(contest.pk, participant.user_id)
            evidence_response = self._apply_checkpoint_evidence(contest, participant, evidence, upload_scope=scope)
            if isinstance(evidence_response, Response):
                return evidence_response
            progress = client.student_progress(run, participant_id=participant.pk, device_id=scope["device_id"], attempt_id=scope["attempt_id"])
        except IntegrityWorkerRejected as error:
            return Response(error.payload, status=error.status_code)
        except IntegrityWorkerUnavailable:
            return Response({"detail": "Integrity resident unavailable."}, status=503)
        except IntegrityWorkerProtocolError:
            return Response({"detail": "Integrity resident response was invalid."}, status=502)
        delivery = build_evidence_delivery(run, participant, now_ms=int(time.time() * 1000), upload_scope=scope)
        state = save_upload_progress(run, participant, scope, progress)
        release = min(delivery.release_before_ms, progress.get("release_evidence_before_ms", 0))
        return Response({**evidence_response, "acked_through_seq": progress["received_seq"],
            "processed_through_seq": progress["processed_seq"],
            "pending_commands": list(delivery.pending_commands),
            "release_evidence_before_ms": release, "upload_status": state,
            **({"evidence_fence_version": progress["evidence_fence_version"]} if "evidence_fence_version" in progress else {})})

    def _apply_checkpoint_evidence(self, contest, participant, evidence, *, upload_scope=None):
        uploads = []
        completions = []
        unavailable = []
        for manifest in evidence.get("manifests", ()):
            run = get_object_or_404(
                ExamIntegrityRun.objects.exclude(
                    data_state=ExamIntegrityRun.DataState.PURGED,
                ),
                pk=manifest["run_id"],
                contest=contest,
            )
            event = (
                ExamEvent.objects.filter(
                    integrity_run=run,
                    contest=contest,
                    user=participant.user,
                    incident_id=manifest["incident_id"],
                )
                .order_by("id")
                .first()
            )
            if event is None:
                raise Http404
            try:
                uploads.extend(
                    create_evidence_manifest(
                        run,
                        participant,
                        event,
                        list(manifest["chunks"]),
                        upload_scope=upload_scope,
                    )
                )
            except (
                IntegrityEvidenceRejected,
                IntegrityEvidenceStorageError,
            ) as error:
                return self._checkpoint_evidence_error(error)

        for completion in evidence.get("completions", ()):
            chunk = get_object_or_404(
                ExamEvidenceChunk,
                pk=completion["chunk_id"],
                contest=contest,
                participant=participant,
            )
            try:
                chunk = complete_evidence_chunk(chunk, upload_scope=upload_scope)
            except (
                IntegrityEvidenceRejected,
                IntegrityEvidenceStorageError,
            ) as error:
                return self._checkpoint_evidence_error(error)
            completions.append(
                {"chunk_id": str(chunk.id), "status": chunk.status}
            )

        for report in evidence.get("unavailable", ()):
            if "chunk_id" in report:
                chunk = get_object_or_404(
                    ExamEvidenceChunk,
                    pk=report["chunk_id"],
                    contest=contest,
                    participant=participant,
                )
                try:
                    chunk = report_evidence_unavailable(
                        chunk,
                        reason=report["reason"],
                        upload_scope=upload_scope,
                    )
                except IntegrityEvidenceRejected as error:
                    return self._checkpoint_evidence_error(error)
                unavailable.append(
                    {"chunk_id": str(chunk.id), "status": chunk.status}
                )
                continue

            run = get_object_or_404(
                ExamIntegrityRun.objects.exclude(
                    data_state=ExamIntegrityRun.DataState.PURGED,
                ),
                pk=report["run_id"],
                contest=contest,
            )
            event = get_object_or_404(
                ExamEvent,
                pk=report["event_id"],
                integrity_run=run,
                contest=contest,
                user=participant.user,
                incident_id=report["incident_id"],
            )
            try:
                markers = report_evidence_unavailable_projection(
                    run,
                    participant,
                    event,
                    source=report["source"],
                    reason=report["reason"],
                    upload_scope=upload_scope,
                )
            except IntegrityEvidenceRejected as error:
                return self._checkpoint_evidence_error(error)
            unavailable.append(
                {
                    "run_id": str(run.id),
                    "incident_id": str(event.incident_id),
                    "event_id": event.id,
                    "source": report["source"],
                    "status": "unavailable",
                    "covered_windows": [
                        {
                            "start_at_ms": marker["start_at_ms"],
                            "end_at_ms": marker["end_at_ms"],
                        }
                        for marker in markers
                    ],
                }
            )

        return {
            "uploads": uploads,
            "completions": completions,
            "unavailable": unavailable,
        }
