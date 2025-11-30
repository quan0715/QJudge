"""
Views for submissions app.
"""
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Submission
from .serializers import (
    SubmissionListSerializer,
    SubmissionDetailSerializer,
    CreateSubmissionSerializer,
)
from .tasks import judge_submission


class SubmissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and creating submissions.
    """
    queryset = Submission.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [
        DjangoFilterBackend,
        filters.OrderingFilter
    ]
    filterset_fields = ['problem', 'contest', 'status', 'language', 'source_type']
    ordering_fields = ['created_at', 'score', 'exec_time']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """
        Filter submissions based on user role and context.
        
        Rules:
        1. Practice Submissions (source_type='practice'):
           - Users can ONLY see their own submissions.
           - Admins/Teachers can see all.
           
        2. Contest Submissions (source_type='contest'):
           - Users can see ALL submissions (Scoreboard view).
           - But detail view (code) is restricted (handled in retrieve).
        """
        user = self.request.user
        queryset = super().get_queryset()
        
        # Admin/Teacher can see everything
        if user.is_staff or user.role in ['admin', 'teacher']:
            return queryset.select_related('user', 'problem', 'contest')
            
        # For detail view (retrieve), do not filter by source_type
        # The retrieve() method has strict permission checks (owner/admin/creator)
        if self.action == 'retrieve':
            return queryset.select_related('user', 'problem', 'contest')
            
        # Filter by source_type (default to practice if not specified)
        source_type = self.request.query_params.get('source_type', 'practice')
        
        if source_type == 'practice':
            # Practice: Only own submissions
            return queryset.filter(source_type='practice', user=user).select_related('user', 'problem', 'contest')
            
        elif source_type == 'contest':
            # Contest: See all (for scoreboard), but filter by contest if provided
            # Logic: If querying contest submissions, we generally allow seeing the list
            # to build the scoreboard.
            return queryset.filter(source_type='contest').select_related('user', 'problem', 'contest')
            
        # Fallback (shouldn't happen with correct usage, but safe default)
        return queryset.filter(user=user)
    
    def get_serializer_class(self):
        if self.action == 'create':
            return CreateSubmissionSerializer
        if self.action == 'retrieve':
            return SubmissionDetailSerializer
        return SubmissionListSerializer
    
    def retrieve(self, request, *args, **kwargs):
        """
        Get submission details.
        Strict permission check: Only owner or admin can see code.
        """
        instance = self.get_object()
        user = request.user
        
        # Check permissions
        is_owner = instance.user == user
        is_admin = user.is_staff or user.role in ['admin', 'teacher']
        is_contest_creator = instance.contest and instance.contest.creator == user
        
        if not (is_owner or is_admin or is_contest_creator):
            return Response(
                {'detail': 'You do not have permission to view this submission details.'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    
    def perform_create(self, serializer):
        """
        Create submission and trigger judging task.
        """
        user = self.request.user
        contest = serializer.validated_data.get('contest')
        
        # Determine source_type
        source_type = 'practice'
        if contest:
            source_type = 'contest'
            
            # Validate contest status
            if contest.status == 'upcoming':
                 from rest_framework.exceptions import PermissionDenied
                 raise PermissionDenied("Contest has not started yet")
                 
            if contest.is_ended:
                 from rest_framework.exceptions import PermissionDenied
                 raise PermissionDenied("Contest has ended")
                 
            # Validate registration
            from apps.contests.models import ContestParticipant
            if not ContestParticipant.objects.filter(contest=contest, user=user).exists():
                 # Allow if admin/creator
                 if not (user.is_staff or user.role in ['admin', 'teacher'] or contest.creator == user):
                     from rest_framework.exceptions import PermissionDenied
                     raise PermissionDenied("You are not registered for this contest")
        
        submission = serializer.save(
            user=user,
            source_type=source_type
        )
        
        # Trigger async judging task
        judge_submission.delay(submission.id)
