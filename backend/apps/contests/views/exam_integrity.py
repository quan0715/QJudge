"""Signed, validation-only gateway for Browser-to-Worker integrity batches."""

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
    ExamIntegrityBatchSerializer,
    canonical_integrity_batch_bytes,
)
from ..models import Contest, ContestParticipant, ExamIntegrityRun
from ..services.anti_cheat_session import get_active_session


class ExamIntegrityMixin:
    @action(
        detail=False,
        methods=["post"],
        url_path="integrity/batches",
        permission_classes=[permissions.IsAuthenticated],
        throttle_classes=[ExamEventsThrottle],
    )
    def integrity_batches(self, request, contest_pk=None):
        return self._proxy_integrity_batch(request, contest_pk)

    def _proxy_integrity_batch(self, request, contest_pk):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not getattr(request.user, "is_student", False):
            raise PermissionDenied("Only contest participants may submit batches.")
        participant = ContestParticipant.objects.filter(
            contest=contest,
            user=request.user,
        ).first()
        if participant is None:
            raise PermissionDenied("Only contest participants may submit batches.")

        run = (
            ExamIntegrityRun.objects.filter(contest=contest)
            .exclude(compute_state=ExamIntegrityRun.ComputeState.DESTROYED)
            .first()
        )
        if (
            run is None
            or run.compute_state != ExamIntegrityRun.ComputeState.RUNNING
            or not run.worker_url
        ):
            return Response(
                {"detail": "Integrity Worker unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        active_session = get_active_session(contest.id, participant.user_id)
        active_device_id = (
            active_session.get("device_id")
            if (
                isinstance(active_session, dict)
                and active_session.get("participant_id") == participant.id
                and active_session.get("user_id") == participant.user_id
            )
            else None
        )
        serializer = ExamIntegrityBatchSerializer(
            data=request.data,
            context={
                "run": run,
                "participant": participant,
                "active_device_id": active_device_id,
            },
        )
        serializer.is_valid(raise_exception=True)
        body = canonical_integrity_batch_bytes(serializer.validated_data)
        if len(body) > MAX_INTEGRITY_BATCH_BYTES:
            raise serializers.ValidationError(
                {"detail": "Encoded batch must not exceed 1 MiB."}
            )

        try:
            ack = build_integrity_worker_client().post_batch(run, body)
        except IntegrityWorkerRejected as error:
            return Response(error.payload, status=error.status_code)
        except IntegrityWorkerUnavailable:
            return Response(
                {"detail": "Integrity Worker unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except IntegrityWorkerProtocolError:
            return Response(
                {"detail": "Integrity Worker response was invalid."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(ack.as_dict(), status=status.HTTP_200_OK)
