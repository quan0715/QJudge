"""
Views for submissions app.
"""
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone

from .models import Submission
from .serializers import (
    SubmissionListSerializer,
    SubmissionDetailSerializer,
    CreateSubmissionSerializer,
)
from .tasks import judge_submission, judge_contest_submission


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
    filterset_fields = [
        'problem', 'contest', 'status', 'language', 'source_type', 'user'
    ]
    ordering_fields = ['created_at', 'score', 'exec_time']
    ordering = ['-created_at']
    
    # Date range filtering (default: last 3 months)
    DEFAULT_DATE_RANGE_DAYS = 90
    
    def filter_queryset(self, queryset):
        """
        Override to disable filtering for non-list actions.
        This ensures retrieve/update/delete can access any submission by ID.
        """
        if self.action != 'list':
            return queryset
        return super().filter_queryset(queryset)
    
    def get_queryset(self):
        """
        Optimized queryset with proper select_related and only() for list view.
        
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
        
        # For non-list actions (retrieve, create, update, destroy), 
        # return queryset without any filters
        if self.action != 'list':
            return queryset.select_related('user', 'problem', 'contest')
        
        # === LIST VIEW ONLY ===
        # The following optimizations and filters only apply to list action
        
        # Only load necessary fields for list view
        queryset = queryset.only(
            'id',
            'user_id',
            'problem_id',
            'contest_id',
            'source_type',
            'language',
            'status',
            'score',
            'exec_time',
            'memory_usage',
            'created_at',
            # Related fields
            'user__id',
            'user__username',
            'problem__id',
            'problem__title',
            'contest__id',
            'contest__anonymous_mode_enabled',
        ).select_related('user', 'problem', 'contest')
        
        # For anonymous mode, annotate nickname to avoid N+1 queries
        contest_id = self.request.query_params.get('contest')
        if contest_id:
            from django.db.models import Subquery, OuterRef
            from apps.contests.models import ContestParticipant
            
            # Annotate nickname from ContestParticipant
            nickname_subquery = ContestParticipant.objects.filter(
                contest_id=contest_id,
                user_id=OuterRef('user_id')
            ).values('nickname')[:1]
            
            queryset = queryset.annotate(
                _contest_nickname=Subquery(nickname_subquery)
            )
        
        # Apply date range filter (performance optimization)
        # By default, only show submissions from the last 3 months
        # This significantly reduces query time for large datasets
        include_all = self.request.query_params.get('include_all', 'false').lower() == 'true'
        created_after = self.request.query_params.get('created_after')
        
        if not include_all:
            if created_after:
                # Custom date range
                queryset = queryset.filter(created_at__gte=created_after)
            else:
                # Default: last 3 months
                from datetime import timedelta
                cutoff_date = timezone.now() - timedelta(days=self.DEFAULT_DATE_RANGE_DAYS)
                queryset = queryset.filter(created_at__gte=cutoff_date)
        
        # Filter by source_type (default to practice if not specified)
        source_type = self.request.query_params.get('source_type', 'practice')
        
        if source_type == 'practice':
            # Practice: Show ALL practice submissions (Public)
            # Exclude contest submissions and test submissions
            queryset = queryset.filter(source_type='practice', is_test=False)
            
        elif source_type == 'contest':
            # Contest: See all (for scoreboard), but filter by contest if provided
            contest_id = self.request.query_params.get('contest')
            if contest_id:
                queryset = queryset.filter(contest_id=contest_id)
            
            queryset = queryset.filter(source_type='contest')
        else:
            # Fallback
            queryset = queryset.filter(user=user)
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'create':
            return CreateSubmissionSerializer
        if self.action == 'retrieve':
            return SubmissionDetailSerializer
        return SubmissionListSerializer
    
    def retrieve(self, request, *args, **kwargs):
        """
        Get submission details.
        Strict permission check: Only owner, admin, problem owner, or contest owner can view.
        """
        instance = self.get_object()
        user = request.user
        
        # Check permissions
        is_owner = instance.user == user
        is_admin = user.is_staff or getattr(user, 'role', '') in ['admin', 'teacher']
        is_contest_owner = instance.contest and instance.contest.owner == user
        is_problem_owner = instance.problem.created_by == user
        
        if not (is_owner or is_admin or is_contest_owner or is_problem_owner):
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
            
            # Check if user is privileged (admin/owner/contest admin)
            # Privileged users can submit at any time regardless of contest status
            is_privileged = (
                user.is_staff or 
                getattr(user, 'role', '') in ['admin', 'teacher'] or 
                contest.owner == user or
                contest.admins.filter(pk=user.pk).exists()
            )
            
            # Validate contest status - only for non-privileged users
            # Admin/Owner can submit even when contest is inactive
            if not is_privileged and contest.status != 'active':
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Contest is not active")
                 
            # Validate registration - only for non-privileged users
            from apps.contests.models import ContestParticipant, ExamStatus
            
            if not is_privileged:
                try:
                    participant = ContestParticipant.objects.get(contest=contest, user=user)
                    
                    # Check if exam finished
                    if participant.has_finished_exam:
                        from rest_framework.exceptions import PermissionDenied
                        raise PermissionDenied("You have finished the exam and cannot submit anymore")
                    
                    # Check if exam is paused - must resume before submitting
                    if participant.exam_status == ExamStatus.PAUSED:
                        from rest_framework.exceptions import PermissionDenied
                        raise PermissionDenied("Your exam is paused. Please resume the exam before submitting.")
                    
                    # Check if exam is locked
                    if participant.exam_status == ExamStatus.LOCKED:
                        from rest_framework.exceptions import PermissionDenied
                        raise PermissionDenied("You have been locked out of this exam and cannot submit.")
                        
                except ContestParticipant.DoesNotExist:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You are not registered for this contest")
            # Privileged users (admin/owner) can submit without registration
        
        # === Keyword Restriction Validation ===
        problem = serializer.validated_data.get('problem')
        code = serializer.validated_data.get('code', '')
        
        forbidden_keywords = problem.forbidden_keywords or []
        required_keywords = problem.required_keywords or []
        
        has_violation = False
        violation_message = ""
        
        # Check forbidden keywords
        for keyword in forbidden_keywords:
            if keyword in code:
                has_violation = True
                violation_message = f"程式碼包含禁用關鍵字: {keyword}"
                break
        
        # Check required keywords (if no forbidden violation)
        if not has_violation:
            for keyword in required_keywords:
                if keyword not in code:
                    has_violation = True
                    violation_message = f"程式碼缺少必須關鍵字: {keyword}"
                    break
        
        if has_violation:
            # Create submission with KR status, skip judging
            submission = serializer.save(
                user=user,
                source_type=source_type,
                status='KR',
                score=0,
                error_message=violation_message
            )
            return  # Don't trigger judge task
        
        # Normal flow: save and judge
        submission = serializer.save(
            user=user,
            source_type=source_type
        )
        
        # Trigger async judging task after transaction commits
        # Use high_priority queue for contest submissions
        from django.db import transaction
        if source_type == 'contest':
            transaction.on_commit(lambda: judge_contest_submission.delay(submission.id))
        else:
            transaction.on_commit(lambda: judge_submission.delay(submission.id))
