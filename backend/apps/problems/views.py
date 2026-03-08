"""
Views for problems app.
"""
from rest_framework import viewsets, permissions, filters, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as django_filters

from .models import (
    Problem,
    Tag,
)
from .serializers import (
    ProblemListSerializer,
    ProblemDetailSerializer,
    ProblemAdminSerializer,
    TagSerializer,
    TestRunSerializer,
)
from .test_run_service import ProblemTestRunService, TestRunSetupError


class ProblemFilter(django_filters.FilterSet):
    """
    Custom filter for Problem list view.
    Supports multiple difficulty values and tag filtering with OR logic.
    """
    difficulty = django_filters.MultipleChoiceFilter(
        choices=Problem.DIFFICULTY_CHOICES,
        conjoined=False  # OR logic: match any of the selected difficulties
    )
    visibility = django_filters.ChoiceFilter(
        choices=[
            ('public', 'Public'),
            ('private', 'Private'),
            ('hidden', 'Hidden'),
        ]
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
        fields = ['difficulty', 'visibility']


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
            if obj.visibility != 'public':
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
            from apps.contests.models import ContestParticipant, ContestProblem
            from django.shortcuts import get_object_or_404
            from rest_framework.exceptions import PermissionDenied
            
            # Get the problem directly (bypass practice visibility filtering)
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


# TagViewSet - API endpoints for managing tags
class TagViewSet(viewsets.ModelViewSet):
    """ViewSet for viewing and editing tags."""
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAdminOrTeacherOrReadOnly]
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
