"""
Views for contests app.
"""
from django.utils import timezone
from django.db.models import Count
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Contest, ContestParticipant, ContestQuestion, ContestAnnouncement
from .serializers import (
    ContestListSerializer,
    ContestDetailSerializer,
    ContestParticipantSerializer,
    ContestQuestionSerializer,
    ContestAdminSerializer,
    ContestAnnouncementSerializer,
)


class ContestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for contests.
    """
    queryset = Contest.objects.all()
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter
    ]
    filterset_fields = ['is_public', 'creator']
    search_fields = ['title']
    ordering_fields = ['start_time', 'end_time']
    ordering = ['-start_time']
    
    def get_queryset(self):
        """
        Filter contests based on visibility and user role.
        """
        queryset = super().get_queryset()
        queryset = queryset.annotate(participant_count=Count('participants'))
        
        user = self.request.user
        
        # Management view filtering
        if self.request.query_params.get('scope') == 'manage':
            if not user.is_authenticated:
                return queryset.none()
            
            # Admin sees all
            if user.is_staff or user.role == 'admin':
                return queryset
                
            # Teacher sees only their own
            if user.role == 'teacher':
                return queryset.filter(creator=user)
                
            return queryset.none()
        
        # Normal view filtering
        if not user.is_authenticated or (
            not user.is_staff and user.role == 'student'
        ):
            # Students see visible contests
            queryset = queryset.filter(is_visible=True)
            
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ContestListSerializer
            
        user = self.request.user
        if user.is_authenticated and (
            user.is_staff or user.role in ['admin', 'teacher']
        ):
            return ContestAdminSerializer
            
        return ContestDetailSerializer

    def perform_create(self, serializer):
        serializer.save(creator=self.request.user)
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def register(self, request, pk=None):
        """
        Register for a contest.
        """
        contest = self.get_object()
        user = request.user
        
        # Check if already registered
        if ContestParticipant.objects.filter(contest=contest, user=user).exists():
            return Response(
                {'message': 'Already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Check password if private
        if contest.password:
            password = request.data.get('password')
            if password != contest.password:
                return Response(
                    {'message': 'Invalid password'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        ContestParticipant.objects.create(contest=contest, user=user)
        
        return Response(
            {'message': 'Successfully registered'},
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def enter(self, request, pk=None):
        """
        Enter a contest.
        """
        contest = self.get_object()
        user = request.user
        
        # Privileged users (Admin/Teacher/Creator) can always enter
        is_privileged = user.is_staff or user.role in ['admin', 'teacher'] or user == contest.creator
        
        if is_privileged:
            return Response({'message': 'Entered successfully (Privileged)'})
        
        # Check start time
        if contest.status == 'upcoming':
             return Response(
                {'message': 'Contest has not started yet'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
        except ContestParticipant.DoesNotExist:
            return Response(
                {'message': 'Not registered'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        # Check if user left and multiple joins are not allowed
        if participant.left_at and not contest.allow_multiple_joins:
            return Response(
                {'message': 'You have left the contest and re-entry is not allowed'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        # If re-entering, clear left_at? Or just allow.
        # If allow_multiple_joins is True, we might want to reset left_at or just ignore it.
        if participant.left_at and contest.allow_multiple_joins:
             participant.left_at = None
             participant.save()
            
        return Response({'message': 'Entered successfully'})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def leave(self, request, pk=None):
        """
        Leave a contest.
        """
        contest = self.get_object()
        user = request.user
        
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
            if not participant.left_at:
                participant.left_at = timezone.now()
                participant.save()
        except ContestParticipant.DoesNotExist:
            pass
            
        return Response({'message': 'Left successfully'})
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def add_problem(self, request, pk=None):
        """
        Add a problem to the contest (Clone or Create).
        Body: { "source_problem_id": <int> | null }
        """
        contest = self.get_object()
        user = request.user
        
        # Check permissions (only creator or admin)
        if not (user.is_staff or user.role == 'admin' or user == contest.creator):
             return Response(
                {'message': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        source_problem_id = request.data.get('source_problem_id')
        
        from apps.problems.services import ProblemService
        from apps.problems.models import Problem
        from apps.contests.models import ContestProblem
        
        if source_problem_id:
            try:
                source_problem = Problem.objects.get(id=source_problem_id)
                new_problem = ProblemService.clone_problem(source_problem, contest, user)
            except Problem.DoesNotExist:
                return Response(
                    {'message': 'Source problem not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            title = request.data.get('title', 'New Problem')
            new_problem = ProblemService.create_contest_problem(contest, user, title=title)
            
        # Link to contest via ContestProblem (for ordering and score)
        # Determine order: last + 1
        last_order = ContestProblem.objects.filter(contest=contest).aggregate(models.Max('order'))['order__max']
        new_order = (last_order if last_order is not None else -1) + 1
        
        ContestProblem.objects.create(
            contest=contest,
            problem=new_problem,
            order=new_order,
            score=100 # Default score
        )
        
        # Return the new problem data (using ProblemListSerializer or similar)
        from apps.problems.serializers import ProblemListSerializer
        serializer = ProblemListSerializer(new_problem)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        """
        Get contest standings.
        """
        contest = self.get_object()
        
        # Check if results are visible
        if not contest.allow_view_results:
            user = request.user
            if not (user.is_authenticated and (user.is_staff or user == contest.creator)):
                return Response(
                    {'message': 'Results are not visible yet'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        participants = ContestParticipant.objects.filter(contest=contest).order_by('-score', 'joined_at')
        serializer = ContestParticipantSerializer(participants, many=True)
        return Response(serializer.data)


class ContestAnnouncementViewSet(viewsets.ModelViewSet):
    """
    ViewSet for contest announcements.
    """
    serializer_class = ContestAnnouncementSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = None  # Disable pagination for frontend compatibility
    
    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        return ContestAnnouncement.objects.filter(contest_id=contest_id).order_by('-created_at')
    
    def perform_create(self, serializer):
        contest_id = self.kwargs.get('contest_pk')
        contest = Contest.objects.get(id=contest_id)
        
        # Only creator or admin can create announcements
        user = self.request.user
        if not (user.is_staff or user == contest.creator):
            raise permissions.PermissionDenied("Only contest creator can post announcements")
            
        serializer.save(created_by=user, contest=contest)
        
    def perform_destroy(self, instance):
        # Only creator or admin can delete
        user = self.request.user
        if not (user.is_staff or user == instance.contest.creator):
            raise permissions.PermissionDenied("Only contest creator can delete announcements")
        instance.delete()


class ContestQuestionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for contest Q&A.
    """
    serializer_class = ContestQuestionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None  # Disable pagination for frontend compatibility
    
    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        return ContestQuestion.objects.filter(contest_id=contest_id)
    
    def perform_create(self, serializer):
        contest_id = self.kwargs.get('contest_pk')
        contest = Contest.objects.get(id=contest_id)
        serializer.save(user=self.request.user, contest=contest)
