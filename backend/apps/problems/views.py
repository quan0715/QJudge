"""
Views for problems app.
"""
from django.db.models import Case, ExpressionWrapper, F, FloatField, Value, When
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Problem, Tag
from .serializers import (
    ProblemListSerializer,
    ProblemDetailSerializer,
    ProblemAdminSerializer,
    TagSerializer,
    TestRunSerializer,
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
    filterset_fields = ['difficulty', 'is_visible']
    search_fields = ['title', 'translations__title']
    ordering_fields = ['id', 'difficulty', 'submission_count', 'acceptance_rate']
    ordering = ['id']
    lookup_field = 'id'
    
    def get_queryset(self):
        """
        Filter queryset based on user role and tags.
        """
        user = self.request.user
        queryset = super().get_queryset()
        
        # Management view filtering
        if self.request.query_params.get('scope') == 'manage':
            if not user.is_authenticated:
                return queryset.none()
            
            # Admin sees all
            if user.is_staff or user.role == 'admin':
                return queryset
                
            # Teacher sees only their own
            if user.role == 'teacher':
                return queryset.filter(created_by=user)
                
            # Others shouldn't be here, but default to none or own
            return queryset.none()
        
        # For privileged users (admin/teacher), allow access to all problems
        # This covers retrieve, update, partial_update, destroy
        if user.is_authenticated and (user.is_staff or user.role in ['admin', 'teacher']):
            if self.action != 'list':
                return queryset
        
        # Normal view filtering (Problem List for students/public)
        # MVP: Only show problems where is_practice_visible=True
        queryset = queryset.filter(is_practice_visible=True)
        
        # Annotate with user status if authenticated
        if user.is_authenticated:
            from django.db.models import Exists, OuterRef
            from apps.submissions.models import Submission
            
            ac_submissions = Submission.objects.filter(
                problem=OuterRef('pk'),
                user=user,
                status='AC',
                is_test=False
            )
            queryset = queryset.annotate(
                is_solved=Exists(ac_submissions)
            )
            
        # Filter by tags if provided (comma-separated slugs)
        tags_param = self.request.query_params.get('tags')
        if tags_param:
            tag_slugs = [slug.strip() for slug in tags_param.split(',') if slug.strip()]
            if tag_slugs:
                # Filter problems that have ALL the specified tags
                for slug in tag_slugs:
                    queryset = queryset.filter(tags__slug=slug)
            
        return queryset.prefetch_related('translations', 'test_cases', 'tags').distinct()

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
    def test_run(self, request, pk=None):
        """
        Execute code with custom input without creating a submission.
        Returns execution results immediately.
        """
        problem = self.get_object()
        serializer = TestRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        language = serializer.validated_data['language']
        source_code = serializer.validated_data['source_code']
        custom_input = serializer.validated_data['custom_input']
        
        # Try to use real judge, fall back to mock
        try:
            from apps.judge.judge_factory import get_judge
            judge = get_judge(language)
            
            # Execute with custom input
            result = judge.execute(
                code=source_code,
                input_data=custom_input,
                expected_output='',  # Not needed for test run
                time_limit=problem.time_limit,
                memory_limit=problem.memory_limit
            )
            
            return Response({
                'status': result['status'],
                'output': result['output'],
                'error': result['error'],
                'exec_time': result['time'],
                'memory_usage': result['memory']
            })
            
        except Exception as e:
            # Fallback to mock response if judge is not available
            import traceback
            error_detail = str(e)
            if 'Unsupported language' in error_detail:
                return Response(
                    {'error': error_detail},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Return system error
            return Response({
                'status': 'SE',
                'output': '',
                'error': f'Judge system error: {error_detail}',
                'exec_time': 0,
                'memory_usage': 0
            })
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrTeacherOrReadOnly])
    def import_yaml(self, request, pk=None):
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

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def submit(self, request, pk=None):
        """Submit endpoint placeholder."""
        return Response(
            {'message': 'Submission endpoint not implemented yet'},
            status=status.HTTP_501_NOT_IMPLEMENTED
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
