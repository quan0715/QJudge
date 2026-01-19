"""
Views for problems app.
"""
from django.db.models import Case, ExpressionWrapper, F, FloatField, Value, When
from rest_framework import viewsets, permissions, filters, status, serializers
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as django_filters
from rest_framework.exceptions import PermissionDenied

from .models import (
    Problem,
    Tag,
    ProblemDiscussion,
    ProblemDiscussionComment,
    DiscussionLike,
    CommentLike,
)
from .serializers import (
    ProblemListSerializer,
    ProblemDetailSerializer,
    ProblemAdminSerializer,
    TagSerializer,
    TestRunSerializer,
    ProblemDiscussionSerializer,
    ProblemDiscussionCommentSerializer,
)


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
        fields = ['difficulty', 'is_visible']


class IsAdminOrTeacherOrReadOnly(permissions.BasePermission):
    """
    Custom permission to allow admins and teachers to edit,
    others can only read visible problems.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated and (
            request.user.is_staff or request.user.role in ['admin', 'teacher']
        )
    
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            # Check visibility for non-admin/teacher
            if not obj.is_visible:
                return request.user.is_authenticated and (
                    request.user.is_staff or request.user.role in ['admin', 'teacher']
                )
            return True
            
        # Write permissions (PUT, PATCH, DELETE)
        if not request.user.is_authenticated:
            return False
            
        # Admin can edit everything
        if request.user.is_staff or request.user.role == 'admin':
            return True
            
        # Teacher can only edit their own problems
        if request.user.role == 'teacher':
            return obj.created_by == request.user
            
        return False


class ProblemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing problems.
    """
    queryset = Problem.objects.all()
    permission_classes = [IsAdminOrTeacherOrReadOnly]
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
            scope=self.request.query_params.get("scope"),
            action=self.action,
        )

    def get_object(self):
        """
        Support looking up problems by 'P001' format.
        """
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs.get(lookup_url_kwarg)
        
        if lookup_value and isinstance(lookup_value, str) and lookup_value.upper().startswith('P'):
            try:
                # Strip 'P' and convert to int
                clean_id = int(lookup_value[1:])
                self.kwargs[lookup_url_kwarg] = clean_id
            except ValueError:
                pass
                
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
        """Set created_by to current user."""
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def test_run(self, request, id=None):
        """
        Execute code with sample + custom inputs without creating a submission.
        Returns execution results immediately.
        """
        from apps.problems.models import TestCase
        from apps.submissions.tasks import MockTestCase, USE_REAL_JUDGE

        problem = self.get_object()
        serializer = TestRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        language = serializer.validated_data['language']
        source_code = serializer.validated_data['code']
        use_samples = serializer.validated_data.get('use_samples', True)
        custom_test_cases = serializer.validated_data.get('custom_test_cases') or []

        # Build test case list: samples first, then custom
        test_cases = []
        if use_samples:
            test_cases.extend(list(problem.test_cases.filter(is_sample=True)))

        custom_cases = [
            MockTestCase({'input': case['input'], 'output': ''}, idx + 1)
            for idx, case in enumerate(custom_test_cases)
        ]
        test_cases.extend(custom_cases)

        # Prepare judge (real or mock)
        judge = None
        if USE_REAL_JUDGE:
            try:
                from apps.judge.judge_factory import get_judge
                judge = get_judge(language)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - safety net
                return Response(
                    {'error': f'Judge system error: {str(exc)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        results = []
        max_exec_time = 0
        max_memory_usage = 0
        final_status = 'AC'

        for tc in test_cases:
            try:
                if judge:
                    expected_output = getattr(tc, 'output_data', '') or ''
                    exec_result = judge.execute(
                        code=source_code,
                        input_data=tc.input_data,
                        expected_output=expected_output,
                        time_limit=problem.time_limit,
                        memory_limit=problem.memory_limit,
                    )
                    raw_status = exec_result.get('status', 'SE')
                    exec_time = exec_result.get('time', 0)
                    memory = exec_result.get('memory', 0)
                    output = exec_result.get('output', '')
                    error_msg = exec_result.get('error', '')
                else:
                    # Mock judging fallback
                    import random
                    code_lower = source_code.lower()
                    if "compile_error" in code_lower:
                        raw_status = 'CE'
                        error_msg = "Compilation error"
                    elif "runtime_error" in code_lower:
                        raw_status = 'RE'
                        error_msg = "Runtime error"
                    elif "timeout" in code_lower:
                        raw_status = 'TLE'
                        error_msg = "Time limit exceeded"
                    else:
                        raw_status = 'AC'
                        error_msg = ""
                    exec_time = random.randint(10, 100)
                    memory = random.randint(1024, 10240)
                    output = "Mock output"
            except Exception as exc:  # pragma: no cover - safety net
                raw_status = 'SE'
                exec_time = 0
                memory = 0
                output = ''
                error_msg = str(exc)

            is_sample = isinstance(tc, TestCase)
            source = 'sample' if is_sample else 'custom'
            expected_output = getattr(tc, 'output_data', None) if is_sample else None
            visible_input = tc.input_data if is_sample else getattr(tc, 'input_data', '')
            visible_expected = expected_output if is_sample else None

            # Decide verdict: custom cases without ground truth become 'info'
            if is_sample:
                verdict = raw_status
            else:
                verdict = raw_status if raw_status in ['CE', 'RE', 'TLE', 'MLE', 'SE'] else 'info'

            max_exec_time = max(max_exec_time, exec_time)
            max_memory_usage = max(max_memory_usage, memory)
            if verdict not in ['AC', 'info'] and final_status == 'AC':
                final_status = verdict
            if verdict == 'info' and final_status == 'AC' and raw_status in ['CE', 'RE', 'TLE', 'MLE', 'SE']:
                # For custom cases, propagate hard failures (e.g., compile error)
                final_status = raw_status

            results.append({
                'case_id': getattr(tc, 'id', None),
                'source': source,
                'status': verdict,
                'exec_time': exec_time,
                'memory_usage': memory,
                'output': output,
                'error_message': error_msg,
                'input': visible_input,
                'expected_output': visible_expected,
                'is_hidden': getattr(tc, 'is_hidden', False) if is_sample else False,
            })

        return Response({
            'status': final_status,
            'exec_time': max_exec_time,
            'memory_usage': max_memory_usage,
            'results': results,
        })
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrTeacherOrReadOnly])
    def import_yaml(self, request, id=None):
        """
        Update existing problem from YAML data.
        Uses merge strategy: only updates provided fields.
        Nested arrays (translations, test_cases, language_configs) are fully replaced.
        """
        problem = self.get_object()
        
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
            serializer.save()
            
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
            from apps.contests.models import Contest, ContestParticipant, ContestProblem
            from django.shortcuts import get_object_or_404
            from rest_framework.exceptions import PermissionDenied
            
            # Get the problem directly (bypass is_practice_visible filter)
            problem = get_object_or_404(Problem, id=id)
            
            # Verify the problem is part of this contest
            if not ContestProblem.objects.filter(contest_id=contest_id, problem=problem).exists():
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


def _can_view_problem(user, problem: Problem) -> bool:
    if problem.is_practice_visible:
        return True
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or getattr(user, "role", "") in ["admin", "teacher"]:
        return True
    return problem.created_by_id == user.id


def _is_privileged(user, problem: Problem) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or getattr(user, "role", "") in ["admin", "teacher"]:
        return True
    return problem.created_by_id == user.id


class ProblemDiscussionListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_problem(self, request, problem_id: int) -> Problem:
        problem = get_object_or_404(Problem, id=problem_id)
        if not _can_view_problem(request.user, problem):
            raise PermissionDenied("You do not have access to this problem.")
        return problem

    def get(self, request, problem_id: int):
        problem = self.get_problem(request, problem_id)
        discussions = ProblemDiscussion.objects.filter(problem=problem).select_related("user")
        serializer = ProblemDiscussionSerializer(
            discussions, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request, problem_id: int):
        problem = self.get_problem(request, problem_id)
        serializer = ProblemDiscussionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        discussion = serializer.save(problem=problem, user=request.user)
        return Response(
            ProblemDiscussionSerializer(discussion, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ProblemDiscussionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, request, pk: int) -> ProblemDiscussion:
        discussion = get_object_or_404(ProblemDiscussion.objects.select_related("problem", "user"), id=pk)
        if not _can_view_problem(request.user, discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")
        return discussion

    def get(self, request, pk: int):
        discussion = self.get_object(request, pk)
        return Response(
            ProblemDiscussionSerializer(discussion, context={"request": request}).data
        )

    def patch(self, request, pk: int):
        """Edit a discussion - only author can edit."""
        discussion = self.get_object(request, pk)
        # Only author can edit
        if request.user != discussion.user:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = ProblemDiscussionSerializer(
            discussion, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        discussion = self.get_object(request, pk)
        if not (request.user == discussion.user or _is_privileged(request.user, discussion.problem)):
            return Response(status=status.HTTP_403_FORBIDDEN)
        discussion.is_deleted = True
        discussion.save(update_fields=["is_deleted", "updated_at"])
        return Response(
            ProblemDiscussionSerializer(discussion, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class ProblemDiscussionCommentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_discussion(self, request, discussion_id: int) -> ProblemDiscussion:
        discussion = get_object_or_404(
            ProblemDiscussion.objects.select_related("problem", "user"), id=discussion_id
        )
        if not _can_view_problem(request.user, discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")
        return discussion

    def get(self, request, discussion_id: int):
        discussion = self.get_discussion(request, discussion_id)
        comments = discussion.comments.select_related("user", "parent")
        serializer = ProblemDiscussionCommentSerializer(
            comments, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request, discussion_id: int):
        discussion = self.get_discussion(request, discussion_id)
        serializer = ProblemDiscussionCommentSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        parent = serializer.validated_data.get("parent")
        if parent and parent.discussion_id != discussion.id:
            return Response(
                {"detail": "Parent comment does not belong to this discussion."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comment = serializer.save(discussion=discussion, user=request.user)
        return Response(
            ProblemDiscussionCommentSerializer(comment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ProblemDiscussionCommentDetailView(APIView):
    """View for editing and deleting comments."""

    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, request, pk: int) -> ProblemDiscussionComment:
        comment = get_object_or_404(
            ProblemDiscussionComment.objects.select_related("discussion__problem", "user"), id=pk
        )
        if not _can_view_problem(request.user, comment.discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")
        return comment

    def patch(self, request, pk: int):
        """Edit a comment - only author can edit."""
        comment = self.get_object(request, pk)
        # Only author can edit
        if request.user != comment.user:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = ProblemDiscussionCommentSerializer(
            comment, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        comment = self.get_object(request, pk)
        if not (request.user == comment.user or _is_privileged(request.user, comment.discussion.problem)):
            return Response(status=status.HTTP_403_FORBIDDEN)
        comment.is_deleted = True
        comment.save(update_fields=["is_deleted", "updated_at"])
        return Response(
            ProblemDiscussionCommentSerializer(comment, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class DiscussionLikeView(APIView):
    """Toggle like on a discussion."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        discussion = get_object_or_404(
            ProblemDiscussion.objects.select_related("problem"), id=pk
        )
        if not _can_view_problem(request.user, discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")

        # Toggle like
        like, created = DiscussionLike.objects.get_or_create(
            discussion=discussion, user=request.user
        )
        if not created:
            # Already liked, so unlike
            like.delete()
            is_liked = False
        else:
            is_liked = True

        return Response(
            {
                "is_liked": is_liked,
                "like_count": discussion.likes.count(),
            },
            status=status.HTTP_200_OK,
        )


class CommentLikeView(APIView):
    """Toggle like on a comment."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        comment = get_object_or_404(
            ProblemDiscussionComment.objects.select_related("discussion__problem"), id=pk
        )
        if not _can_view_problem(request.user, comment.discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")

        # Toggle like
        like, created = CommentLike.objects.get_or_create(
            comment=comment, user=request.user
        )
        if not created:
            # Already liked, so unlike
            like.delete()
            is_liked = False
        else:
            is_liked = True

        return Response(
            {
                "is_liked": is_liked,
                "like_count": comment.likes.count(),
            },
            status=status.HTTP_200_OK,
        )


# TagViewSet - API endpoints for managing tags
class TagViewSet(viewsets.ModelViewSet):
    """ViewSet for viewing and editing tags."""
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAdminOrTeacherOrReadOnly]
    lookup_field = 'slug'
    
    def get_queryset(self):
        queryset = super().get_queryset()
        # Optional: filter by name search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset
