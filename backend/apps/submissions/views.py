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
        
        # Admin/Teacher can see everything, but we still want to respect source_type filter if provided
        # to avoid showing contest submissions in the global list by default.
        
        # For detail view (retrieve), do not filter by source_type
        # The retrieve() method has strict permission checks (owner/admin/creator)
        if self.action == 'retrieve':
            return queryset.select_related('user', 'problem', 'contest')
            
        # Filter by source_type (default to practice if not specified)
        source_type = self.request.query_params.get('source_type', 'practice')
        
        if source_type == 'practice':
            # Practice: Show ALL practice submissions (Public)
            # Exclude contest submissions
            return queryset.filter(source_type='practice').select_related('user', 'problem', 'contest')
            
        elif source_type == 'contest':
            # Contest: See all (for scoreboard), but filter by contest if provided
            contest_id = self.request.query_params.get('contest')
            if contest_id:
                queryset = queryset.filter(contest_id=contest_id)
            
            return queryset.filter(source_type='contest').select_related('user', 'problem', 'contest')
            
        # Fallback
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
        is_admin = user.is_staff or getattr(user, 'role', '') in ['admin', 'teacher']
        is_contest_owner = instance.contest and instance.contest.owner == user
        
        if not (is_owner or is_admin or is_contest_owner):
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
            # Use computed_status or status field. status field is 'active'/'inactive'.
            # But 'active' means running. 'inactive' could mean upcoming or ended.
            # We should check if it's actually running.
            # The model has 'status' field: active/inactive.
            # If status is inactive, reject.
            if contest.status != 'active':
                 from rest_framework.exceptions import PermissionDenied
                 raise PermissionDenied("Contest is not active")
                 
            # Validate registration
            from apps.contests.models import ContestParticipant
            try:
                participant = ContestParticipant.objects.get(contest=contest, user=user)
                
                # Check if exam finished
                if participant.has_finished_exam:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You have finished the exam and cannot submit anymore")
                    
            except ContestParticipant.DoesNotExist:
                 # Allow if admin/owner
                 if not (user.is_staff or getattr(user, 'role', '') in ['admin', 'teacher'] or contest.owner == user):
                     from rest_framework.exceptions import PermissionDenied
                     raise PermissionDenied("You are not registered for this contest")
        
        submission = serializer.save(
            user=user,
            source_type=source_type
        )
        
        # Trigger async judging task
        judge_submission.delay(submission.id)
