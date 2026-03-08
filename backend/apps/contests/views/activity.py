"""ContestActivityViewSet — read-only activity log."""
from rest_framework import viewsets, permissions
from django.shortcuts import get_object_or_404

from ..models import Contest, ContestActivity
from ..serializers import ContestActivitySerializer
from ..permissions import can_manage_contest


class ContestActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing contest activities.
    Only accessible by admins and teachers.
    """
    serializer_class = ContestActivitySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None  # Return all activities without pagination (admin-only API)

    def get_queryset(self):
        contest_pk = self.kwargs.get('contest_pk')
        user = self.request.user
        contest = get_object_or_404(Contest, pk=contest_pk)

        if not can_manage_contest(user, contest):
            return ContestActivity.objects.none()

        return ContestActivity.objects.filter(contest=contest).order_by('-created_at')

    @staticmethod
    def log_activity(contest, user, action_type, details=""):
        """
        Helper to log a contest activity.
        """
        try:
            ContestActivity.objects.create(
                contest=contest,
                user=user,
                action_type=action_type,
                details=details
            )
        except Exception as e:
            print(f"Failed to log activity: {e}")
