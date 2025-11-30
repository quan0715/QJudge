"""
Views for problems app.
"""
from django.db.models import Case, ExpressionWrapper, F, FloatField, Value, When
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Problem
from .serializers import (
    ProblemListSerializer,
    ProblemDetailSerializer,
    ProblemAdminSerializer,
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
        Filter queryset based on user role.
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
        
        # For retrieve (detail view), allow authenticated admin/teacher to see all
        # This allows preview of hidden problems from management page
        if self.action == 'retrieve' and user.is_authenticated:
            if user.is_staff or user.role in ['admin', 'teacher']:
                return queryset
        
        # Normal view filtering (Problem List)
        # By default, only show visible problems
        queryset = queryset.filter(is_visible=True)
            
        return queryset.prefetch_related('translations', 'test_cases')

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
        context['language'] = self.request.query_params.get('lang', 'zh-hant')
        return context
    
    def perform_create(self, serializer):
        """
        Set created_by to current user.
        """
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def submit(self, request, pk=None):
        """
        Shortcut for submitting a solution to this problem.
        Delegates to submission app (to be implemented).
        """
        # This will be implemented when we have the submissions app
        return Response(
            {'message': 'Submission endpoint not implemented yet'},
            status=status.HTTP_501_NOT_IMPLEMENTED
        )
