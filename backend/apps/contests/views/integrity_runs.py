from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.contests.integrity_serializers import (
    IntegrityRunCreateSerializer,
    IntegrityRunSerializer,
)
from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.permissions import can_manage_contest
from apps.contests.services.integrity_runs import (
    IntegrityLifecycleError,
    InvalidRunTransition,
    LiveIntegrityRunExists,
    destroy_run,
    purge_run,
    restart_run,
    start_run,
    stop_run,
)


class IntegrityRunViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def _managed_contest(self) -> Contest:
        contest = get_object_or_404(Contest, pk=self.kwargs["contest_pk"])
        if not can_manage_contest(self.request.user, contest):
            raise PermissionDenied("Contest management permission is required.")
        return contest

    @staticmethod
    def _run(contest: Contest, pk) -> ExamIntegrityRun:
        return get_object_or_404(ExamIntegrityRun, contest=contest, pk=pk)

    @staticmethod
    def _transition_response(operation):
        try:
            run = operation()
        except InvalidRunTransition as exc:
            return Response(
                {
                    "code": "invalid_integrity_run_transition",
                    "detail": str(exc),
                },
                status=status.HTTP_409_CONFLICT,
            )
        except IntegrityLifecycleError:
            return Response(
                {
                    "code": "integrity_lifecycle_external_error",
                    "detail": ("Integrity lifecycle operation could not be confirmed."),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(IntegrityRunSerializer(run).data)

    def list(self, request, contest_pk=None):
        contest = self._managed_contest()
        runs = ExamIntegrityRun.objects.filter(contest=contest)
        return Response(IntegrityRunSerializer(runs, many=True).data)

    def retrieve(self, request, pk=None, contest_pk=None):
        contest = self._managed_contest()
        return Response(IntegrityRunSerializer(self._run(contest, pk)).data)

    def create(self, request, contest_pk=None):
        contest = self._managed_contest()
        serializer = IntegrityRunCreateSerializer(
            data=request.data,
            context={"contest": contest, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        try:
            run = serializer.save()
        except LiveIntegrityRunExists:
            return Response(
                {"code": "live_integrity_run_exists"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            IntegrityRunSerializer(run).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None, contest_pk=None):
        contest = self._managed_contest()
        run = self._run(contest, pk)
        return self._transition_response(lambda: start_run(run.id))

    @action(detail=True, methods=["post"])
    def restart(self, request, pk=None, contest_pk=None):
        contest = self._managed_contest()
        run = self._run(contest, pk)
        return self._transition_response(lambda: restart_run(run.id))

    @action(detail=True, methods=["post"])
    def stop(self, request, pk=None, contest_pk=None):
        contest = self._managed_contest()
        run = self._run(contest, pk)
        return self._transition_response(lambda: stop_run(run.id, actor=request.user))

    @action(detail=True, methods=["post"], url_path="destroy", url_name="destroy")
    def destroy_compute(self, request, pk=None, contest_pk=None):
        contest = self._managed_contest()
        run = self._run(contest, pk)
        return self._transition_response(
            lambda: destroy_run(run.id, actor=request.user)
        )

    @action(detail=True, methods=["post"])
    def purge(self, request, pk=None, contest_pk=None):
        contest = self._managed_contest()
        run = self._run(contest, pk)
        return self._transition_response(lambda: purge_run(run.id, actor=request.user))
