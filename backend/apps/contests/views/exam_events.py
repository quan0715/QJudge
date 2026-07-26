"""Read-only manager event journal and semantic feed."""

from collections import defaultdict

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.contests.models import Contest, ContestActivity, ExamEvent
from apps.contests.permissions import can_manage_contest
from apps.contests.serializers import ExamEventSerializer
from apps.contests.services.integrity_evidence import (
    evidence_statuses_for_events,
)
from apps.contests.services.participant_dashboard import build_event_feed
from apps.core.throttles import ExamEventsThrottle


class ExamEventsMixin:
    @action(
        detail=False,
        methods=["get"],
        url_path="events",
        permission_classes=[permissions.IsAuthenticated],
        throttle_classes=[ExamEventsThrottle],
    )
    def events(self, request, contest_pk=None):
        return self._list_events(request, contest_pk)

    @staticmethod
    def _list_events(request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )
        events = list(
            ExamEvent.objects.filter(contest_id=contest_pk)
            .exclude(event_type="health_snapshot")
            .select_related("user", "integrity_run")
            .order_by("created_at", "id")
        )
        activities = list(
            ContestActivity.objects.filter(contest_id=contest_pk)
            .select_related("user")
            .order_by("created_at", "id")
        )
        evidence_status_by_event = evidence_statuses_for_events(events)
        events_by_user = defaultdict(list)
        activities_by_user = defaultdict(list)
        user_names = {}
        for event in events:
            events_by_user[event.user_id].append(event)
            user_names[event.user_id] = event.user.username
        for activity in activities:
            activities_by_user[activity.user_id].append(activity)
            user_names[activity.user_id] = activity.user.username
        event_feed = []
        for user_id, user_name in user_names.items():
            event_feed.extend(build_event_feed(
                user_id=user_id,
                user_name=user_name,
                exam_events=events_by_user[user_id],
                activities=activities_by_user[user_id],
                evidence_by_event=evidence_status_by_event,
            ))
        event_feed.sort(key=lambda item: item["first_at"], reverse=True)
        return Response(
            {
                "events": ExamEventSerializer(
                    reversed(events),
                    many=True,
                    context={
                        "evidence_status_by_event": evidence_status_by_event,
                    },
                ).data,
                "event_feed": event_feed,
            }
        )
