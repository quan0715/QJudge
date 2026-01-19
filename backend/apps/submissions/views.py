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
from .tasks import judge_submission, judge_contest_submission
from .access_policy import SubmissionAccessError, SubmissionAccessPolicy
from .services import SubmissionService


class SubmissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and creating submissions.
    """
    http_method_names = ["get", "post", "head", "options"]
    queryset = Submission.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [
        DjangoFilterBackend,
        filters.OrderingFilter
    ]
    filterset_fields = [
        'problem', 'contest', 'lab', 'status', 'language', 'source_type', 'user'
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
        queryset = super().get_queryset()

        if self.action != "list":
            return queryset.optimized_for_detail()

        contest_id = self.kwargs.get("contest_pk") or self.request.query_params.get("contest")
        lab_id = self.request.query_params.get("lab")
        include_all = self.request.query_params.get("include_all", "false").lower() == "true"
        created_after = self.request.query_params.get("created_after")
        source_type = self.request.query_params.get("source_type")
        if contest_id:
            source_type = "contest"
        elif not source_type:
            source_type = "practice"

        return queryset.visible_to(
            user=self.request.user,
            source_type=source_type,
            contest_id=contest_id,
            lab_id=lab_id,
            include_all=include_all,
            created_after=created_after,
            date_range_days=self.DEFAULT_DATE_RANGE_DAYS,
        )
    
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
        is_contest_admin = (
            instance.contest
            and SubmissionAccessPolicy.is_privileged(user, instance.contest)
        )
        
        if not (is_owner or is_admin or is_contest_owner or is_problem_owner or is_contest_admin):
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
        lab = serializer.validated_data.get('lab')

        try:
            result = SubmissionService.create_submission(
                user=user,
                data=serializer.validated_data,
                contest_id=contest.id if contest else None,
                lab_id=lab.id if lab else None,
            )
        except SubmissionAccessError as exc:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(exc.message) from exc

        submission = result.submission
        serializer.instance = submission
        
        # Log activity for contest submissions
        if result.should_judge and result.source_type == 'contest' and contest:
            from apps.contests.views import ContestActivityViewSet
            problem = serializer.validated_data.get('problem')
            ContestActivityViewSet.log_activity(
                contest,
                user,
                'submit_code',
                f"Submitted code for problem: {problem.title if problem else 'Unknown'}"
            )
        
        # Trigger async judging task after transaction commits
        # Use high_priority queue for contest submissions
        from django.db import transaction
        if result.should_judge:
            if result.source_type == 'contest':
                transaction.on_commit(lambda: judge_contest_submission.delay(submission.id))
            else:
                transaction.on_commit(lambda: judge_submission.delay(submission.id))
