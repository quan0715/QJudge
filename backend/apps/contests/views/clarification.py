"""ClarificationViewSet."""
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import Contest, Clarification
from ..serializers import (
    ClarificationSerializer,
    ClarificationCreateSerializer,
    ClarificationReplySerializer,
)
from ..permissions import IsContestOwnerOrAdmin, can_manage_contest
from .activity import ContestActivityViewSet


class ClarificationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Clarifications (Q&A).
    """
    serializer_class = ClarificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return ClarificationCreateSerializer
        return ClarificationSerializer

    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        user = self.request.user

        # Base queryset
        queryset = Clarification.objects.filter(contest_id=contest_id).select_related('author', 'problem')

        # Managers (platform_admin / owner / co_owner) see all
        contest = get_object_or_404(Contest, id=contest_id)
        if can_manage_contest(user, contest):
            return queryset

        # Participants see their own + public ones
        return queryset.filter(
            Q(author=user) | Q(is_public=True)
        )

    def perform_create(self, serializer):
        contest_id = self.kwargs.get('contest_pk')
        contest = get_object_or_404(Contest, id=contest_id)
        serializer.save(author=self.request.user, contest=contest, status='pending', is_public=True)

    def perform_update(self, serializer):
        instance = serializer.instance
        if not can_manage_contest(self.request.user, instance.contest) and instance.author != self.request.user:
            raise PermissionDenied("You can only edit your own clarifications")
        serializer.save()

    def perform_destroy(self, instance):
        if not can_manage_contest(self.request.user, instance.contest) and instance.author != self.request.user:
            raise PermissionDenied("You can only delete your own clarifications")
        instance.delete()

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin])
    def reply(self, request, pk=None, contest_pk=None):
        """
        Reply to a clarification.
        """
        clarification = self.get_object()
        serializer = ClarificationReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        clarification.answer = serializer.validated_data['answer']
        clarification.is_public = serializer.validated_data['is_public']
        clarification.status = 'answered'
        clarification.answered_at = timezone.now()
        clarification.save()

        # Log activity
        ContestActivityViewSet.log_activity(
            clarification.contest,
            request.user,
            'reply_question',
            f"Replied to question #{clarification.id}"
        )

        return Response(ClarificationSerializer(clarification).data)
