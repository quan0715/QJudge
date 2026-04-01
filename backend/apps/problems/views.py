"""
Views for problems app.
"""
from uuid import UUID

from django.contrib.auth import get_user_model
from rest_framework import viewsets, permissions, filters, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as django_filters
from django.db import transaction
from django.db.models import QuerySet

from .models import (
    Problem,
    Tag,
)
from .serializers import (
    ProblemListSerializer,
    ProblemDetailSerializer,
    ProblemAdminSerializer,
    OrphanProblemSerializer,
    ResolveOrphanProblemSerializer,
    TagSerializer,
    TestRunSerializer,
)
from .test_run_service import ProblemTestRunService, TestRunSetupError
from apps.contests.services.question_edit_lock import ensure_contest_question_editable
from apps.question_bank.question_assets import write_coding_content_to_asset, sync_asset_to_problem
from apps.question_bank.bank_workflows import upsert_problem_into_bank
from apps.question_bank.models import QuestionBank

User = get_user_model()


class ProblemFilter(django_filters.FilterSet):
    """
    Custom filter for Problem list view.
    Supports multiple difficulty values and tag filtering with OR logic.
    """
    difficulty = django_filters.MultipleChoiceFilter(
        choices=Problem.DIFFICULTY_CHOICES,
        conjoined=False  # OR logic: match any of the selected difficulties
    )
    tags = django_filters.CharFilter(method='filter_tags')

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
        model = Problem
        fields = ['difficulty']


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
    queryset = Problem.objects.all()
    permission_classes = [IsProblemManager]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter
    ]
    filterset_class = ProblemFilter
    search_fields = ['title', 'translations__title']
    ordering_fields = ['id', 'difficulty', 'submission_count', 'acceptance_rate']
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

    def _get_locking_contests(self, problem: Problem) -> QuerySet:
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

    def _ensure_problem_editable_under_contest_lock(self, problem: Problem, action: str) -> None:
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

    def _iter_unresolved_orphan_problems(self):
        queryset = (
            Problem.objects.filter(question_asset__isnull=True, created_by__isnull=True)
            .select_related("created_by", "question_asset")
            .order_by("created_at", "id")
        )
        yield from queryset

    @action(detail=False, methods=['get'], permission_classes=[IsAdminOnly], url_path='orphan-queue')
    def orphan_queue(self, request):
        serializer = OrphanProblemSerializer(
            list(self._iter_unresolved_orphan_problems()),
            many=True,
        )
        return Response(serializer.data)

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

        qs = Problem.objects.filter(
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

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOnly], url_path='resolve-orphan')
    def resolve_orphan(self, request, id=None):
        problem = Problem.objects.filter(id=id).select_related(
            "created_by",
            "question_asset",
        ).first()
        if problem is None:
            return Response({'error': 'Problem not found'}, status=status.HTTP_404_NOT_FOUND)

        payload = ResolveOrphanProblemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        owner = User.objects.filter(id=payload.validated_data['owner_id']).first()
        if owner is None:
            return Response({'error': 'Owner not found'}, status=status.HTTP_404_NOT_FOUND)

        if not (owner.is_staff or getattr(owner, 'role', None) in ['admin', 'teacher']):
            return Response({'error': 'Owner must be a teacher or admin'}, status=status.HTTP_400_BAD_REQUEST)

        bank_uuid = payload.validated_data.get('question_bank_uuid')
        bank = None
        bank_question_id = None
        if bank_uuid:
            bank = QuestionBank.objects.filter(
                uuid=bank_uuid,
                owner=owner,
                is_archived=False,
                category=QuestionBank.Category.CODING,
            ).first()
            if bank is None:
                return Response({'error': 'Target bank not found'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            problem.created_by = owner
            problem.save(update_fields=['created_by', 'updated_at'])

            # Build asset content from Problem's current state
            translation = problem.translations.filter(
                language__in=["zh-TW", "zh-hant", "zh-Hant"]
            ).first() or problem.translations.first()
            prompt = translation.description if translation else ""
            translations_list = list(
                problem.translations.values(
                    "language", "title", "description",
                    "input_description", "output_description", "hint",
                )
            )
            question_asset, question_version = write_coding_content_to_asset(
                owner=owner,
                title=problem.title,
                prompt=prompt,
                difficulty=problem.difficulty,
                translations=translations_list,
                time_limit=problem.time_limit,
                memory_limit=problem.memory_limit,
                test_cases=list(problem.test_cases.values(
                    "input_data", "output_data", "is_sample",
                    "score", "weight_percent", "order", "is_hidden",
                )),
                language_configs=list(problem.language_configs.values(
                    "language", "template_code", "is_enabled", "order",
                )),
                forbidden_keywords=problem.forbidden_keywords or [],
                required_keywords=problem.required_keywords or [],
                legacy_problem_id=str(problem.id),
                existing_asset=problem.question_asset,
                actor=owner,
            )
            sync_asset_to_problem(question_asset=question_asset, problem=problem)

            if bank is not None:
                bank_question = upsert_problem_into_bank(problem=problem, bank=bank, created_by=owner)
                bank_question_id = str(bank_question.id)

        return Response(
            {
                'problem': OrphanProblemSerializer(problem).data,
                'question_asset_id': str(question_asset.id),
                'question_version_id': str(question_version.id),
                'bank_question_id': bank_question_id,
            },
            status=status.HTTP_200_OK,
        )
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def test_run(self, request, id=None):
        """
        Execute code with sample + custom inputs without creating a submission.
        Returns execution results immediately.
        """
        problem = self.get_object()
        serializer = TestRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = ProblemTestRunService.run(
                problem=problem,
                language=serializer.validated_data["language"],
                source_code=serializer.validated_data["code"],
                use_samples=serializer.validated_data.get("use_samples", True),
                custom_test_cases=serializer.validated_data.get("custom_test_cases") or [],
            )
        except TestRunSetupError as exc:
            error_text = str(exc)
            error_status = (
                status.HTTP_400_BAD_REQUEST
                if not error_text.startswith("Judge system error:")
                else status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            return Response({"error": error_text}, status=error_status)

        return Response(result)
    
    @action(detail=True, methods=['post'], permission_classes=[IsProblemManager])
    def import_yaml(self, request, id=None):
        """
        Update existing problem from YAML data.
        Uses merge strategy: only updates provided fields.
        Nested arrays (translations, test_cases, language_configs) are fully replaced.
        """
        problem = self.get_object()
        self._ensure_problem_editable_under_contest_lock(
            problem,
            action="problem.import_yaml",
        )
        
        # Parse YAML from request
        yaml_content = request.data.get('yaml_content', '')
        if not yaml_content:
            return Response(
                {'error': 'yaml_content is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            import yaml
            data = yaml.safe_load(yaml_content)
        except yaml.YAMLError as e:
            return Response(
                {'error': f'Invalid YAML: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Use ProblemAdminSerializer for validation and updating
        serializer = ProblemAdminSerializer(
            problem,
            data=data,
            partial=True,  # Allow partial updates
            context={'request': request}
        )
        
        try:
            serializer.is_valid(raise_exception=True)
            problem = serializer.save()

            return Response({
                'message': 'Problem updated successfully from YAML',
                'problem_id': problem.id
            })
        except serializers.ValidationError as e:
            return Response(
                {'error': 'Validation failed', 'details': e.detail},
                status=status.HTTP_400_BAD_REQUEST
            )

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
        from .models import Problem
        
        contest_id = request.query_params.get('contest')
        limit = int(request.query_params.get('limit', 100))
        
        # For contest statistics, check if user is a participant and get problem directly
        if contest_id:
            from apps.contests.models import ContestParticipant
            from apps.question_bank.models import ContestQuestionBinding
            from django.shortcuts import get_object_or_404
            from rest_framework.exceptions import PermissionDenied

            # Get the problem directly through the management/contest surface.
            problem = get_object_or_404(Problem, id=id)

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
            # For practice, use denormalized fields from Problem model
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
