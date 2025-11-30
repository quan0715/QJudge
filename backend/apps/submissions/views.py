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
    filterset_fields = ['problem', 'contest', 'status', 'language']
    ordering_fields = ['created_at', 'score', 'exec_time']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """
        Filter submissions based on user role and context.
        
        Rules:
        - /submissions page: Only show public (is_test=False) submissions
        - /problems/:id submissions tab: Show all public submissions + user's test submissions
        - Students can only see their own submissions (unless viewing problem-specific list)
        - Teachers/Admins can see all
        """
        user = self.request.user
        queryset = super().get_queryset()
        
        # Check if filtering by problem (for problem detail page)
        problem_id = self.request.query_params.get('problem')
        
        if problem_id:
            # On problem detail page: show all public submissions + user's own test submissions
            from django.db.models import Q
            queryset = queryset.filter(
                Q(problem_id=problem_id, is_test=False) |  # All public submissions
                Q(problem_id=problem_id, is_test=True, user=user)  # User's test submissions
            )
        elif not user.is_staff and user.role == 'student':
            # On general submissions page: students see only their own submissions
            queryset = queryset.filter(user=user)
            
        return queryset.select_related('user', 'problem', 'contest')
    
    def get_serializer_class(self):
        if self.action == 'create':
            return CreateSubmissionSerializer
        if self.action == 'retrieve':
            return SubmissionDetailSerializer
        return SubmissionListSerializer
    
    def perform_create(self, serializer):
        """
        Create submission and trigger judging task.
        """
        submission = serializer.save(user=self.request.user)
        
        # Trigger async judging task
        judge_submission.delay(submission.id)
