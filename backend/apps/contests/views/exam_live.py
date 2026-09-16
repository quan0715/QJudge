"""LiveKit exam monitoring endpoints."""

from __future__ import annotations

from collections.abc import Mapping

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Contest, ContestParticipant
from ..permissions import can_manage_contest
from ..services.livekit_service import (
    LiveMonitoringError,
    ensure_live_room,
    live_config_payload,
    mint_live_token,
    resolve_live_scope,
)
from ..services.live_monitoring_presence import (
    current_live_run,
    empty_live_snapshot,
    get_live_snapshot,
)


class ExamLiveMixin:
    """Expose the QJudge-owned LiveKit token and target contracts."""

    def _live_contest(self, contest_pk):
        return get_object_or_404(Contest, id=contest_pk)

    @action(detail=False, methods=["get"], url_path="live/config")
    def live_config(self, request, contest_pk=None):
        contest = self._live_contest(contest_pk)
        is_participant = ContestParticipant.objects.filter(
            contest=contest, user=request.user
        ).exists()
        if not is_participant and not can_manage_contest(request.user, contest):
            return Response(
                {"error": "You are not allowed to use live monitoring."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(live_config_payload())

    @action(detail=False, methods=["post"], url_path="live/token")
    def live_token(self, request, contest_pk=None):
        contest = self._live_contest(contest_pk)
        try:
            payload = request.data if isinstance(request.data, Mapping) else {}
            scope = resolve_live_scope(request, contest, payload.get("role"))
            ensure_live_room(scope)
            token_payload = mint_live_token(scope)
        except LiveMonitoringError as exc:
            return Response(
                {"error": exc.public_message},
                status=exc.status_code,
            )
        response = Response(token_payload, status=status.HTTP_200_OK)
        response["Cache-Control"] = "no-store"
        return response

    @action(detail=False, methods=["get"], url_path="live/targets")
    def live_targets(self, request, contest_pk=None):
        contest = self._live_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {"error": "You are not allowed to use live monitoring."},
                status=status.HTTP_403_FORBIDDEN,
            )
        run = current_live_run(contest)
        if run is None:
            return Response(
                {"error": "The exam live monitoring session is not available for this scope."},
                status=status.HTTP_409_CONFLICT,
            )
        snapshot = get_live_snapshot(contest, run)
        return Response({
            "observed_at": snapshot["observed_at"],
            "stale": snapshot["stale"],
            "targets": snapshot["targets"],
        })
