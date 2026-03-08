"""ContestAnnouncementViewSet."""
from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404

from ..models import Contest, ContestAnnouncement
from ..serializers import ContestAnnouncementSerializer
from ..permissions import can_manage_contest
from .activity import ContestActivityViewSet


class ContestAnnouncementViewSet(viewsets.ModelViewSet):
    """
    ViewSet for contest announcements.
    """
    serializer_class = ContestAnnouncementSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        return ContestAnnouncement.objects.filter(contest_id=contest_id).order_by('-created_at')

    def _check_owner_permission(self, contest):
        if not can_manage_contest(self.request.user, contest):
            raise PermissionDenied("Only contest owner or admin can manage announcements")

    def perform_create(self, serializer):
        contest_id = self.kwargs.get('contest_pk')
        contest = get_object_or_404(Contest, id=contest_id)
        self._check_owner_permission(contest)
        user = self.request.user
        serializer.save(created_by=user, contest=contest)

        ContestActivityViewSet.log_activity(
            contest,
            user,
            'announce',
            f"Posted announcement: {serializer.validated_data.get('title')}"
        )

    def perform_update(self, serializer):
        self._check_owner_permission(serializer.instance.contest)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_owner_permission(instance.contest)
        instance.delete()
