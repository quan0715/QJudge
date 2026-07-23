"""Read-only manager event feed and the retired student event authority."""

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.contests.models import Contest, ExamEvent
from apps.contests.permissions import can_manage_contest
from apps.contests.serializers import ExamEventSerializer
from apps.core.throttles import ExamEventsThrottle


class ExamEventsMixin:
    @action(
        detail=False,
        methods=["post", "get"],
        url_path="events",
        permission_classes=[permissions.IsAuthenticated],
        throttle_classes=[ExamEventsThrottle],
    )
    def events(self, request, contest_pk=None):
        if request.method == "POST":
            return Response(
                {"code": "integrity_batch_required"},
                status=status.HTTP_410_GONE,
            )
        return self._list_events(request, contest_pk)

    @staticmethod
    def _list_events(request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )
        events = (
            ExamEvent.objects.filter(contest_id=contest_pk)
            .select_related("user")
            .order_by("-created_at")
        )
        return Response(ExamEventSerializer(events, many=True).data)
