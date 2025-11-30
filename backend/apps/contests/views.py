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
        queryset = Contest.objects.annotate(
            participant_count=Count('participants')
        )
        
        user = self.request.user
        scope = self.request.query_params.get('scope', 'visible')
        
        # Teacher/Admin can see manage scope
        if scope == 'manage':
            if not (user.is_staff or user.role in ['teacher', 'admin']):
                return queryset.none()
            return queryset.filter(creator=user)
        
        if scope == 'all':
            # Admin can see all contests
            if not (user.is_staff or user.role == 'admin'):
                return queryset.none()

            
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
        Add a NEW problem to the contest.
        Note: Clone/copy from practice problems is no longer supported in MVP.
        Body: { "title": "Problem Title" }
        """
        contest = self.get_object()
        user = request.user
        
        # Check permissions (only creator or admin)
        if not (user.is_staff or user.role == 'admin' or user == contest.creator):
             return Response(
                {'message': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        # MVP: No longer support cloning from practice problems
        source_problem_id = request.data.get('source_problem_id')
        if source_problem_id:
            return Response(
                {'message': 'Cloning from practice problems is no longer supported. Please create a new problem.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from apps.problems.services import ProblemService
        from apps.contests.models import ContestProblem
        from django.db.models import Max
        
        title = request.data.get('title', 'New Problem')
        new_problem = ProblemService.create_contest_problem(contest, user, title=title)
            
        # Link to contest via ContestProblem (for ordering and score)
        # Determine order: last + 1
        last_order = ContestProblem.objects.filter(contest=contest).aggregate(Max('order'))['order__max']
        new_order = (last_order if last_order is not None else -1) + 1
        
        ContestProblem.objects.create(
            contest=contest,
            problem=new_problem,
            order=new_order,
            score=100 # Default score
        )
        
        # Return the new problem data
        from apps.problems.serializers import ProblemListSerializer
        serializer = ProblemListSerializer(new_problem, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def end_contest(self, request, pk=None):
        """
        Manually mark the contest as ended.
        Only contest creator or admin can call this.
        After ending, problems can be published to practice library.
        """
        contest = self.get_object()
        user = request.user
        
        # Check permissions (only creator or admin)
        if not (user.is_staff or user.role == 'admin' or user == contest.creator):
            return Response(
                {'message': 'Only contest creator or admin can end the contest'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if already ended
        if contest.is_ended:
            return Response(
                {'message': 'Contest is already ended'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Mark as ended
        contest.is_ended = True
        contest.save()
        
        # Return updated contest data
        serializer = self.get_serializer(contest)
        return Response({
            'message': 'Contest ended successfully',
            'contest': serializer.data
        })

    @action(
        detail=True,
        methods=['get'],
        permission_classes=[permissions.IsAuthenticated],
        url_path='problems/(?P<problem_id>\d+)'
    )
    def retrieve_problem(self, request, pk=None, problem_id=None):
        """
        Get specific problem details within a contest.
        Allows participants to view problem details during the contest.
        """
        contest = self.get_object()
        user = request.user
        
        # Check if privileged (Admin/Teacher/Creator)
        is_privileged = user.is_staff or user.role in ['admin', 'teacher'] or user == contest.creator
        
        if not is_privileged:
            # Check if contest has started
            if contest.status == 'upcoming':
                return Response(
                    {'message': 'Contest has not started yet'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Check if user is registered
            if not ContestParticipant.objects.filter(contest=contest, user=user).exists():
                return Response(
                    {'message': 'You must register for the contest first'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        # Get the problem
        from apps.contests.models import ContestProblem
        try:
            contest_problem = ContestProblem.objects.get(
                contest=contest,
                problem_id=problem_id
            )
        except ContestProblem.DoesNotExist:
            return Response(
                {'message': 'Problem not found in this contest'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        # Return full problem details
        from apps.problems.serializers import ProblemDetailSerializer
        problem_data = ProblemDetailSerializer(contest_problem.problem, context={'request': request}).data
        
        # Add contest-specific info
        problem_data['score'] = contest_problem.score
        problem_data['order'] = contest_problem.order
        
        return Response(problem_data)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[permissions.IsAuthenticated],
        url_path='problems/(?P<problem_id>\d+)/publish'
    )
    def publish_problem_to_practice(self, request, pk=None, problem_id=None):
        """
        Publish a contest problem to the practice library.
        Only allowed after contest is ended.
        Route: POST /contests/{contest_id}/problems/{problem_id}/publish/
        """
        contest = self.get_object()
        user = request.user
        
        # Check permissions (only creator or admin)
        if not (user.is_staff or user.role == 'admin' or user == contest.creator):
            return Response(
                {'message': 'Only contest creator or admin can publish problems'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if contest is ended
        if not contest.is_ended:
            return Response(
                {'message': 'Contest must be ended before publishing problems to practice'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get the problem
        from apps.problems.models import Problem
        from apps.contests.models import ContestProblem
        
        try:
            # Verify this problem belongs to this contest
            contest_problem = ContestProblem.objects.get(
                contest=contest,
                problem_id=problem_id
            )
            problem = contest_problem.problem
        except ContestProblem.DoesNotExist:
            return Response(
                {'message': 'Problem not found in this contest'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if already published
        if problem.is_practice_visible:
            return Response(
                {'message': 'Problem is already published to practice library'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Publish to practice
        problem.is_practice_visible = True
        problem.save()
        
        # Return updated problem data
        from apps.problems.serializers import ProblemListSerializer
        serializer = ProblemListSerializer(problem, context={'request': request})
        return Response({
            'message': 'Problem published to practice library successfully',
            'problem': serializer.data
        })

    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        """
        Get contest standings (ICPC Style).
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
        
        # 1. Get Problems (columns)
        from apps.contests.models import ContestProblem
        contest_problems = ContestProblem.objects.filter(contest=contest).select_related('problem').order_by('order')
        problems_data = [{
            'id': cp.problem.id,
            'title': cp.problem.title,
            'order': cp.order,
            'label': chr(65 + i) if i < 26 else f"P{i+1}" # A, B, C...
        } for i, cp in enumerate(contest_problems)]

        # 2. Get Participants
        participants = ContestParticipant.objects.filter(contest=contest).select_related('user')
        
        # 3. Get Submissions
        from apps.submissions.models import Submission
        submissions = Submission.objects.filter(
            contest=contest
        ).order_by('created_at')

        # 4. Process
        # user_id -> { solved: 0, time: 0, problems: { prob_id: { status: '', tries: 0, time: 0, is_pending: False } } }
        from apps.users.serializers import UserSerializer
        stats = {} 
        for p in participants:
            stats[p.user.id] = {
                'user': UserSerializer(p.user).data,
                'solved': 0,
                'time': 0, # Penalty
                'joined_at': p.joined_at,
                'problems': {}
            }
            # Initialize problems
            for cp in contest_problems:
                stats[p.user.id]['problems'][cp.problem.id] = {
                    'status': None,
                    'tries': 0,
                    'time': 0,
                    'pending': False
                }

        for sub in submissions:
            uid = sub.user.id
            pid = sub.problem.id
            if uid not in stats: continue # Should be registered
            if pid not in stats[uid]['problems']: continue # Should be in contest

            p_stat = stats[uid]['problems'][pid]
            
            if p_stat['status'] == 'AC':
                continue # Already solved, ignore subsequent

            # Update tries
            # CE doesn't count for tries in ICPC usually
            if sub.status == 'CE':
                continue
            
            if sub.status == 'pending' or sub.status == 'judging':
                p_stat['pending'] = True
                continue

            p_stat['tries'] += 1
            
            if sub.status == 'AC':
                p_stat['status'] = 'AC'
                # Calculate time in minutes
                time_diff = sub.created_at - contest.start_time
                minutes = int(time_diff.total_seconds() / 60)
                p_stat['time'] = minutes
                
                # Update total
                stats[uid]['solved'] += 1
                # Penalty: Time + 20 * (tries - 1)
                penalty = minutes + 20 * (p_stat['tries'] - 1)
                stats[uid]['time'] += penalty
            else:
                p_stat['status'] = 'attempted' # Failed attempt

        # 5. Convert to list and sort
        standings_list = list(stats.values())
        # Sort by Solved (desc), then Time (asc)
        standings_list.sort(key=lambda x: (-x['solved'], x['time']))

        # Add Rank
        for i, item in enumerate(standings_list):
            item['rank'] = i + 1

        return Response({
            'problems': problems_data,
            'standings': standings_list
        })


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

    @action(detail=True, methods=['get'], url_path='problems/(?P<problem_id>\d+)')
    def retrieve_problem(self, request, pk=None, problem_id=None):
        """
        Get specific problem details within a contest.
        """
        contest = self.get_object()
        user = request.user
        
        # Check if contest started or user is privileged
        is_privileged = user.is_staff or user == contest.creator
        
        from django.utils import timezone
        if not is_privileged and contest.start_time > timezone.now():
             return Response(
                {'message': 'Contest has not started yet'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        # Check if problem is in contest
        try:
            contest_problem = ContestProblem.objects.get(contest=contest, problem_id=problem_id)
        except ContestProblem.DoesNotExist:
            return Response(
                {'message': 'Problem not found in this contest'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        # Return problem details
        from apps.problems.serializers import ProblemDetailSerializer
        # We might want to attach the score from contest_problem to the problem data
        problem_data = ProblemDetailSerializer(contest_problem.problem, context={'request': request}).data
        problem_data['score'] = contest_problem.score
        
        return Response(problem_data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def answer(self, request, pk=None, contest_pk=None):
        """
        Answer a contest question.
        """
        question = self.get_object()
        contest = question.contest
        user = request.user
        
        # Only creator or admin can answer
        if not (user.is_staff or user == contest.creator):
            return Response(
                {'message': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        answer = request.data.get('answer')
        if not answer:
            return Response(
                {'message': 'Answer is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        question.reply = answer
        question.replied_by = user
        question.replied_at = timezone.now()
        question.save()
        
        serializer = self.get_serializer(question)
        return Response(serializer.data)
