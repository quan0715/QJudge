"""
Views for problems app.
"""
import logging
from uuid import UUID

from rest_framework import viewsets, permissions, filters, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as django_filters
from django.db.models import QuerySet

from .models import (
    CodingProblem,
    Tag,
)
from .serializers import (
    ProblemListSerializer,
    ProblemDetailSerializer,
    ProblemAdminSerializer,
    OrphanProblemSerializer,
    TagSerializer,
    TestRunSerializer,
)
from .test_run_service import ProblemTestRunService, TestRunSetupError
from apps.contests.services.question_edit_lock import ensure_contest_question_editable

logger = logging.getLogger(__name__)


class ProblemFilter(django_filters.FilterSet):
    """
    Custom filter for CodingProblem list view.
    Supports multiple difficulty values and tag filtering with OR logic.
    """
    difficulty = django_filters.MultipleChoiceFilter(
        choices=[('easy', 'easy'), ('medium', 'medium'), ('hard', 'hard')],
        method='filter_difficulty',
        conjoined=False,
    )
    tags = django_filters.CharFilter(method='filter_tags')

    def filter_difficulty(self, queryset, name, value):
        """Filter by difficulty from QuestionAsset payload (OR logic)."""
        if not value:
            return queryset
        return queryset.filter(question_asset__payload__difficulty__in=value)

    def filter_tags(self, queryset, name, value):
        """
        Filter problems by tag slugs (comma-separated).
        Uses OR logic: returns problems that have ANY of the specified tags.
        """
        if not value:
            return queryset
        slugs = [s.strip() for s in value.split(',') if s.strip()]
        if not slugs:
            return queryset
        return queryset.filter(tags__slug__in=slugs).distinct()

    class Meta:
        model = CodingProblem
        fields = []


class IsAdminOnly(permissions.BasePermission):
    """Only allow admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_staff or request.user.role == 'admin'
        )


class IsAdminOrTeacherOrTagReadOnly(permissions.BasePermission):
    """Permission for Tag: admin/teacher can write, others read-only. No object-level owner check."""
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated and (
            request.user.is_staff or request.user.role in ['admin', 'teacher']
        )


class IsProblemManager(permissions.BasePermission):
    """Problems app is now a pure management/transition surface."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_staff or request.user.role in ['admin', 'teacher']
        )

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff or request.user.role == 'admin':
            return True
        if request.user.role == 'teacher':
            return obj.created_by == request.user
        return False


class ProblemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing problems.
    """
    queryset = CodingProblem.objects.all()
    permission_classes = [IsProblemManager]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter
    ]
    filterset_class = ProblemFilter
    search_fields = ['question_asset__title']
    ordering_fields = ['id', 'submission_count', 'acceptance_rate']
    ordering = ['id']
    lookup_field = 'id'
    
    def get_queryset(self):
        """
        Filter queryset based on user role.
        Tag filtering is handled by ProblemFilter for OR logic support.
        """
        return super().get_queryset().visible_to(
            user=self.request.user,
            scope="manage",
            action=self.action,
        )

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs.get(lookup_url_kwarg)
        try:
            UUID(str(lookup_value))
        except (TypeError, ValueError):
            raise serializers.ValidationError({"id": "Must be a valid UUID."})
        return super().get_object()

    def get_serializer_class(self):
        """
        Return appropriate serializer based on action and user role.
        """
        if self.action == 'list':
            return ProblemListSerializer
        
        user = self.request.user
        if user.is_authenticated and (
            user.is_staff or user.role in ['admin', 'teacher']
        ):
            return ProblemAdminSerializer
            
        return ProblemDetailSerializer
    
    def get_serializer_context(self):
        """
        Add language to serializer context.
        """
        context = super().get_serializer_context()
        context['language'] = self.request.query_params.get('lang', 'zh-TW')
        return context
    
    def perform_create(self, serializer):
        """Set created_by to current user.
        Asset creation is handled inside ProblemService.create_problem_adapter.
        """
        serializer.save(created_by=self.request.user)

    def _get_locking_contests(self, problem: CodingProblem) -> QuerySet:
        from apps.contests.models import Contest
        from apps.question_bank.models import ContestQuestionBinding

        contest_ids = set(
            ContestQuestionBinding.objects.filter(
                coding_problem=problem
            ).values_list("contest_id", flat=True)
        )

        if not contest_ids:
            return Contest.objects.none()

        return Contest.objects.filter(id__in=contest_ids, question_edit_locked=True)

    def _ensure_problem_editable_under_contest_lock(self, problem: CodingProblem, action: str) -> None:
        locked_contest = self._get_locking_contests(problem).order_by("question_edit_locked_at").first()
        if not locked_contest:
            return
        ensure_contest_question_editable(
            contest=locked_contest,
            actor_id=getattr(self.request.user, "id", None),
            action=action,
        )

    def perform_update(self, serializer):
        self._ensure_problem_editable_under_contest_lock(
            serializer.instance,
            action="problem.update",
        )
        # Asset update is handled inside ProblemService.update_problem_adapter.
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_problem_editable_under_contest_lock(
            instance,
            action="problem.destroy",
        )
        instance.delete()

    @action(detail=False, methods=['get'], permission_classes=[IsProblemManager], url_path='drafts')
    def drafts(self, request):
        """
        List CodingProblems not in any question bank.
        Teachers see their own asset-backed drafts; admins also see unresolved orphans.
        """
        from apps.question_bank.models import QuestionBankMembership
        from django.db.models import Q

        banked_asset_ids = QuestionBankMembership.objects.values_list(
            'question_asset_id', flat=True
        )

        user = request.user
        is_admin = user.is_staff or getattr(user, 'role', '') == 'admin'

        draft_filter = Q(question_asset__isnull=False) & ~Q(question_asset_id__in=banked_asset_ids)
        orphan_filter = Q(question_asset__isnull=True, created_by__isnull=True)

        qs = CodingProblem.objects.filter(
            draft_filter | orphan_filter if is_admin else draft_filter
        ).select_related(
            'created_by',
            'question_asset',
        ).prefetch_related(
            'contest_bindings__contest',
            'contestproblem_set__contest',
        ).order_by('-created_at')

        if not is_admin:
            qs = qs.filter(created_by=user)

        serializer = OrphanProblemSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def test_run(self, request, id=None):
        """
        Execute code against all stored test cases without creating a submission.
        Returns execution results immediately.

        Access mirrors Submission: any authenticated user may invoke test_run as
        long as they hold the problem id. If a `contest_id` is supplied, the
        same SubmissionAccessPolicy used by real submissions is applied so that
        contest-level rules (status, schedule, participant, exam state) gate
        the run.
        """
        from django.shortcuts import get_object_or_404
        from rest_framework.exceptions import PermissionDenied

        from apps.contests.models import Contest
        from apps.submissions.access_policy import (
            SubmissionAccessError,
            SubmissionAccessPolicy,
        )

        try:
            UUID(str(id))
        except (TypeError, ValueError):
            raise serializers.ValidationError({"id": "Must be a valid UUID."})

        serializer = TestRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        problem = get_object_or_404(CodingProblem, id=id)

        contest_id = serializer.validated_data.get("contest_id")
        if contest_id:
            contest = get_object_or_404(Contest, id=contest_id)
            try:
                SubmissionAccessPolicy.enforce_contest_submission(request.user, contest)
            except SubmissionAccessError as exc:
                raise PermissionDenied(exc.message) from exc

        try:
            result = ProblemTestRunService.run(
                problem=problem,
                language=serializer.validated_data["language"],
                source_code=serializer.validated_data["code"],
            )
        except TestRunSetupError as exc:
            error_text = str(exc)
            logger.warning("Test run setup error: %s", error_text)
            if error_text.startswith("Judge system error:"):
                return Response(
                    {"error": "Judge system error"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response({"error": error_text}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)
    
    @action(detail=True, methods=['get'])
    def statistics(self, request, id=None):
        """
        Get problem statistics including status distribution and submission trend.
        
        Query params:
        - contest: Contest ID to filter submissions (optional)
        - limit: Number of recent submissions for trend data (default: 100)
        """
        from django.db.models import Count
        from django.db.models.functions import TruncDate
        from apps.submissions.models import Submission
        from .models import CodingProblem
        
        contest_id = request.query_params.get('contest')
        limit = int(request.query_params.get('limit', 100))
        
        # For contest statistics, check if user is a participant and get problem directly
        if contest_id:
            from apps.contests.models import ContestParticipant
            from apps.question_bank.models import ContestQuestionBinding
            from django.shortcuts import get_object_or_404
            from rest_framework.exceptions import PermissionDenied

            # Get the problem directly through the management/contest surface.
            problem = get_object_or_404(CodingProblem, id=id)

            # Verify the problem is part of this contest
            if not ContestQuestionBinding.objects.filter(
                contest_id=contest_id, coding_problem=problem
            ).exists():
                raise PermissionDenied("This problem is not part of the specified contest.")
            
            # Verify user is a participant of this contest (or admin/teacher)
            user = request.user
            if not (user.is_staff or getattr(user, 'role', None) in ['admin', 'teacher']):
                if not user.is_authenticated:
                    raise PermissionDenied("Authentication required.")
                if not ContestParticipant.objects.filter(contest_id=contest_id, user=user).exists():
                    raise PermissionDenied("You are not a participant of this contest.")
        else:
            # For non-contest statistics, use the filtered queryset
            problem = self.get_object()
        
        # Base queryset
        submissions_qs = Submission.objects.filter(
            problem=problem,
            is_test=False
        )
        
        # Filter by contest if provided
        if contest_id:
            submissions_qs = submissions_qs.filter(contest_id=contest_id)
            # For contest, use actual submission data
            status_counts = dict(
                submissions_qs.values('status')
                .annotate(count=Count('id'))
                .values_list('status', 'count')
            )
            submission_count = sum(status_counts.values())
            accepted_count = status_counts.get('AC', 0)
        else:
            # For practice, use denormalized fields from CodingProblem.
            status_counts = {
                'AC': problem.accepted_count,
                'WA': problem.wa_count,
                'TLE': problem.tle_count,
                'MLE': problem.mle_count,
                'RE': problem.re_count,
                'CE': problem.ce_count,
            }
            submission_count = problem.submission_count
            accepted_count = problem.accepted_count
        
        # Get last N submissions for trend data
        # First get the IDs of the last N submissions
        recent_submission_ids = list(
            submissions_qs
            .order_by('-created_at')
            .values_list('id', flat=True)[:limit]
        )
        
        # Then aggregate by date from those submissions
        # Use local timezone for date truncation to match user expectations
        from django.utils import timezone as tz
        local_tz = tz.get_current_timezone()
        
        trend_qs = Submission.objects.filter(id__in=recent_submission_ids)
        
        trend_data = list(
            trend_qs
            .annotate(date=TruncDate('created_at', tzinfo=local_tz))
            .values('date')
            .annotate(count=Count('id'))
            .order_by('date')
        )
        
        # Format trend data
        formatted_trend = [
            {
                'date': item['date'].isoformat() if item['date'] else None,
                'count': item['count']
            }
            for item in trend_data
        ]
        
        # Calculate AC rate
        ac_rate = round((accepted_count / submission_count * 100), 2) if submission_count > 0 else 0
        
        return Response({
            'submission_count': submission_count,
            'accepted_count': accepted_count,
            'ac_rate': ac_rate,
            'status_counts': status_counts,
            'trend': formatted_trend,
        })


# TagViewSet - API endpoints for managing tags
class TagViewSet(viewsets.ModelViewSet):
    """ViewSet for viewing and editing tags."""
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAdminOrTeacherOrTagReadOnly]
    lookup_field = 'slug'

    def get_permissions(self):
        if self.action == 'destroy':
            return [IsAdminOnly()]
        return [IsAdminOrTeacherOrTagReadOnly()]

    def get_queryset(self):
        queryset = super().get_queryset()
        # Optional: filter by name search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset
