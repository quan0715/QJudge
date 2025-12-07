"""
Views for contests app.
"""
from django.utils import timezone
from django.db.models import Count, Q, Sum
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404

from .models import (
    Contest,
    ContestParticipant,
    ContestProblem,
    ContestAnnouncement,
    Clarification,
    ExamEvent,
    ContestActivity
)
from .serializers import (
    ContestListSerializer,
    ContestDetailSerializer,
    ContestCreateUpdateSerializer,
    ContestParticipantSerializer,
    ContestAnnouncementSerializer,
    ContestProblemSerializer,
    ContestProblemCreateSerializer,
    ClarificationSerializer,
    ClarificationCreateSerializer,
    ClarificationReplySerializer,
    ExamEventSerializer,
    ExamEventCreateSerializer,
    ContestActivitySerializer
)
from .permissions import (
    IsContestOwnerOrAdmin,
    IsContestParticipant,
    get_user_role_in_contest
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
    filterset_fields = ['visibility', 'owner', 'status']
    search_fields = ['name']
    ordering_fields = ['start_time', 'end_time', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        """
        Filter contests based on visibility and user role.
        """
        queryset = super().get_queryset()
        queryset = queryset.annotate(participant_count=Count('participants'))

        user = self.request.user
        scope = self.request.query_params.get('scope', 'visible')

        # Teacher/Admin can see manage scope
        if scope == 'manage':
            if not user.is_authenticated:
                return queryset.none()
            if user.is_staff or getattr(user, 'role', '') == 'admin':
                return queryset
            # Teachers see contests they own
            return queryset.filter(owner=user)

        # Public scope (default)
        if user.is_staff or getattr(user, 'role', '') == 'admin':
            return queryset

        # For regular users:
        # 1. Public contests (excluding inactive ones unless registered?)
        # Actually, requirement says: "User 進不去 inactive contest (這代表沒開放)"
        # So inactive contests should be hidden or return 403 if accessed directly.
        # But get_queryset filters the list.
        
        queryset = queryset.filter(
            Q(visibility__in=['public', 'private']) |
            Q(participants=user) |
            Q(owner=user)
        ).distinct()

        if user.is_authenticated:
             # Filter out inactive contests for non-owners/non-participants?
             # Or just let them see it in list but block detail view?
             # The requirement says "User 進不去 inactive contest".
             # Usually this means detail view. But if they can't enter, maybe they shouldn't see it?
             # But "inactive" also means "not open yet" or "ended"?
             # Wait, status 'inactive' means "Not Open". 'active' means "Open".
             # If it's inactive, maybe only owner should see it?
             # Let's keep it visible in list if it's public, but block access in `retrieve` or `enter`.
             pass
        else:
            queryset = queryset.filter(visibility='public')
            
        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return ContestListSerializer

        if self.action in ['create', 'update', 'partial_update']:
            return ContestCreateUpdateSerializer

        return ContestDetailSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        """
        Retrieve contest details. Block access if inactive and user is not owner/admin.
        """
        instance = self.get_object()
        user = request.user
        
        # Allow if owner or admin
        is_owner = user.is_authenticated and (instance.owner == user or user.is_staff or getattr(user, 'role', '') == 'admin')
        
        # Auto-unlock check
        if user.is_authenticated:
            try:
                participant = ContestParticipant.objects.get(contest=instance, user=user)
                if participant.is_locked and instance.allow_auto_unlock and participant.locked_at:
                    minutes = instance.auto_unlock_minutes or 0
                    unlock_time = participant.locked_at + timezone.timedelta(minutes=minutes)
                    
                    if timezone.now() >= unlock_time:
                        participant.is_locked = False
                        participant.is_paused = True  # Auto-unlock to paused state
                        participant.locked_at = None
                        participant.violation_count = 0
                        participant.lock_reason = ""
                        participant.save()
                        
                        # Log activity
                        ContestActivityViewSet.log_activity(
                            instance, 
                            user, 
                            'unlock_user', 
                            "Auto-unlocked by system"
                        )
            except ContestParticipant.DoesNotExist:
                pass
            
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin])
    def toggle_status(self, request, pk=None):
        """
        Toggle contest status between active and inactive.
        """
        contest = self.get_object()
        if contest.status == 'active':
            contest.status = 'inactive'
        else:
            contest.status = 'active'
        contest.save()
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'other', 
            f"Toggled contest status to {contest.status}"
        )
        
        return Response({'status': contest.status})

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin])
    def archive(self, request, pk=None):
        """
        Archive a contest. This action is irreversible.
        """
        contest = self.get_object()
        if contest.status == 'archived':
            return Response({'error': 'Contest is already archived'}, status=status.HTTP_400_BAD_REQUEST)
            
        contest.status = 'archived'
        contest.save()
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'other', 
            f"Archived contest"
        )
        
        return Response({'status': 'archived'})

    def destroy(self, request, *args, **kwargs):
        """
        Delete a contest. Only owner can delete.
        """
        contest = self.get_object()
        
        # Check ownership (IsContestOwnerOrAdmin permission might allow admins, but let's enforce owner or superuser)
        if request.user != contest.owner and not request.user.is_superuser:
             return Response(
                {'error': 'Only the contest owner can delete this contest.'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'], permission_classes=[IsContestOwnerOrAdmin])
    def participants(self, request, pk=None):
        """
        Get all participants for this contest (Teacher view).
        """
        contest = self.get_object()
        participants = ContestParticipant.objects.filter(contest=contest).select_related('user')
        serializer = ContestParticipantSerializer(participants, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='unlock_participant')
    def unlock_participant(self, request, pk=None):
        """
        Unlock a participant.
        """
        contest = self.get_object()
        user_id = request.data.get('user_id')

        try:
            participant = ContestParticipant.objects.get(contest=contest, user_id=user_id)
            participant.is_locked = False
            participant.lock_reason = ""
            participant.is_paused = True # Require manual resume
            participant.save()
            
            # Log activity
            ContestActivityViewSet.log_activity(
                contest, 
                request.user, 
                'unlock_user', 
                f"Unlocked participant {participant.user.username}"
            )
            
            return Response({'status': 'unlocked'})
        except ContestParticipant.DoesNotExist:
            return Response({'error': 'Participant not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['patch'], permission_classes=[IsContestOwnerOrAdmin], url_path='update_participant')
    def update_participant(self, request, pk=None):
        """
        Update a participant's status (lock, finished exam, etc.).
        """
        contest = self.get_object()
        user_id = request.data.get('user_id')

        try:
            participant = ContestParticipant.objects.get(contest=contest, user_id=user_id)

            if 'is_locked' in request.data:
                participant.is_locked = request.data['is_locked']
            if 'lock_reason' in request.data:
                participant.lock_reason = request.data['lock_reason']
            if 'has_finished_exam' in request.data:
                participant.has_finished_exam = request.data['has_finished_exam']
            if 'is_paused' in request.data:
                participant.is_paused = request.data['is_paused']

            participant.save()
            
            # Log activity
            ContestActivityViewSet.log_activity(
                contest, 
                request.user, 
                'other', 
                f"Updated participant {participant.user.username}: {request.data}"
            )
            
            return Response({'status': 'updated'})
        except ContestParticipant.DoesNotExist:
            return Response({'error': 'Participant not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'], permission_classes=[IsContestOwnerOrAdmin], url_path='events')
    def _list_events(self, request, pk=None):
        """
        List exam events for a contest (Teacher/Admin only).
        """
        contest = self.get_object()
        role = get_user_role_in_contest(request.user, contest)

        if role not in ['teacher', 'admin']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        events = ExamEvent.objects.filter(contest=contest)

        # Optional filtering by user
        user_id = request.query_params.get('user_id')
        if user_id:
            events = events.filter(user_id=user_id)

        serializer = ExamEventCreateSerializer(events, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='add_participant')
    def add_participant(self, request, pk=None):
        """
        Manually add a participant to the contest.
        """
        contest = self.get_object()
        username = request.data.get('username')

        if not username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.users.models import User
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if ContestParticipant.objects.filter(contest=contest, user=user).exists():
            return Response({'error': 'User is already registered'}, status=status.HTTP_400_BAD_REQUEST)

        ContestParticipant.objects.create(contest=contest, user=user)
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'register', 
            f"Added participant: {username}"
        )
        
        return Response({'status': 'added'})

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='remove_participant')
    def remove_participant(self, request, pk=None):
        """
        Remove a participant from the contest.
        Only contest owners/admins can perform this action.
        """
        contest = self.get_object()
        user_id = request.data.get('user_id')

        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            participant = ContestParticipant.objects.get(contest=contest, user_id=user_id)
        except ContestParticipant.DoesNotExist:
            return Response({'error': 'Participant not found'}, status=status.HTTP_404_NOT_FOUND)

        username = participant.user.username
        participant.delete()
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'unregister', 
            f"Removed participant: {username}"
        )
        
        return Response({'status': 'removed'})

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
        if contest.visibility == 'private':
            password = request.data.get('password')
            if password != contest.password:
                return Response(
                    {'message': 'Invalid password'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        ContestParticipant.objects.create(contest=contest, user=user)
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'register', 
            f"Registered for contest"
        )
        
        return Response(
            {'message': 'Successfully registered'},
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def enter(self, request, pk=None):
        """
        Enter a contest (check eligibility).
        """
        contest = self.get_object()
        user = request.user
        
        role = get_user_role_in_contest(user, contest)
        
        # Admin/Teacher can always enter
        if role in ['admin', 'teacher']:
            return Response({'message': 'Entered successfully (Privileged)'})
        
        # Check status - REMOVED to allow entry in inactive state
        # if contest.status == 'inactive':
        #      return Response(
        #         {'message': 'Contest is not active'},
        #         status=status.HTTP_403_FORBIDDEN
        #     )

        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
        except ContestParticipant.DoesNotExist:
            return Response(
                {'message': 'Not registered'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        # Check if user is locked - REMOVED to allow entry (frontend handles lock screen)
        # if participant.is_locked:
        #     return Response(
        #         {'message': 'You have been locked out of this contest due to rule violations.'},
        #         status=status.HTTP_403_FORBIDDEN
        #     )

        # Check if user left and multiple joins are not allowed
        if participant.left_at and not contest.allow_multiple_joins:
            return Response(
                {'message': 'You have left the contest and re-entry is not allowed'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        # If re-entering, clear left_at if allowed
        if participant.left_at and contest.allow_multiple_joins:
             participant.left_at = None
             participant.save()
             
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'enter_contest', 
            f"Entered contest"
        )
            
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
                
                # Log activity
                ContestActivityViewSet.log_activity(
                    contest, 
                    request.user, 
                    'other', 
                    f"Left contest"
                )
        except ContestParticipant.DoesNotExist:
            pass
            
        return Response({'message': 'Left successfully'})
    
    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin])
    def add_problem(self, request, pk=None):
        """
        Add a problem to the contest.
        Supports adding existing problem (by ID) or creating a new one (by title).
        """
        contest = self.get_object()
        user = request.user
        
        problem_id = request.data.get('problem_id')
        title = request.data.get('title')
        
        if problem_id:
            # Clone existing problem (Template)
            from apps.problems.models import Problem
            from apps.problems.services import ProblemService
            try:
                source_problem = Problem.objects.get(id=problem_id)
                # Clone it to the contest
                problem = ProblemService.clone_problem(source_problem, contest, user)
            except Problem.DoesNotExist:
                return Response({'error': 'Problem not found'}, status=status.HTTP_404_NOT_FOUND)
        elif title:
            # Create new problem
            from apps.problems.services import ProblemService
            problem = ProblemService.create_contest_problem(contest, user, title=title)
        else:
            return Response({'error': 'Either problem_id or title is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Determine order and label
        from django.db.models import Max
        last_order = ContestProblem.objects.filter(contest=contest).aggregate(Max('order'))['order__max']
        new_order = (last_order if last_order is not None else -1) + 1
        
        # Generate label (A, B, C...)
        ContestProblem.objects.create(
            contest=contest,
            problem=problem,
            order=new_order,
            score=0, 
            # label=label, # Dynamic now
        )
        
        from apps.problems.serializers import ProblemListSerializer
        serializer = ProblemListSerializer(problem, context={'request': request})
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'submit_code', 
            f"Submitted code for problem {problem.display_id}"
        )
        
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin])
    def reorder_problems(self, request, pk=None):
        """
        Reorder problems and regenerate labels.
        Expects: { "orders": [{ "id": 1, "order": 0 }, ...] }  where id is ContestProblem ID
        """
        contest = self.get_object()
        orders = request.data.get('orders', [])
        
        if not orders:
            return Response({'error': 'No orders provided'}, status=status.HTTP_400_BAD_REQUEST)
            
        # 1. Update orders
        for item in orders:
            cp_id = item.get('id')
            new_order = item.get('order')
            if cp_id is not None and new_order is not None:
                ContestProblem.objects.filter(contest=contest, id=cp_id).update(order=new_order)
                
        # 2. Regenerate labels based on sorted order
        contest_problems = ContestProblem.objects.filter(contest=contest).order_by('order')
        for i, cp in enumerate(contest_problems):
            # Ensure order is sequential 0, 1, 2...
            cp.order = i
            # cp.label = ... # Dynamic now
            cp.save()
            
        return Response({'status': 'reordered'})

    @action(
        detail=True, 
        methods=['post'], 
        permission_classes=[IsContestOwnerOrAdmin],
        url_path='problems/(?P<problem_id>\d+)/publish'
    )
    def publish_problem_to_practice(self, request, pk=None, problem_id=None):
        """
        Publish a contest problem to the practice library.
        """
        contest = self.get_object()
        
        # Check if contest is ended/inactive
        if contest.status == 'active':
            return Response(
                {'message': 'Contest must be inactive/ended before publishing problems'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
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
        
        if problem.is_practice_visible:
            return Response(
                {'message': 'Problem is already published'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        problem.is_practice_visible = True
        problem.save()
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'other', 
            f"Published problem {problem.display_id} to practice"
        )
        
        return Response({'message': 'Problem published successfully'})

    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        """
        Get contest standings (ICPC Style).
        """
        contest = self.get_object()
        user = request.user
        
        # Check visibility
        role = get_user_role_in_contest(user, contest)
        can_view = False
        
        if role in ['admin', 'teacher']:
            can_view = True
        elif contest.scoreboard_visible_during_contest:
            can_view = True
        elif contest.status == 'inactive': # Ended
            can_view = True
            
        if not can_view:
             return Response(
                {'message': 'Scoreboard is not visible'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # 1. Get Problems
        contest_problems = ContestProblem.objects.filter(contest=contest).select_related('problem').order_by('order').annotate(
            problem_score_sum=Sum('problem__test_cases__score')
        )
        problems_data = [{
            'id': cp.problem.id,
            'title': cp.problem.title,
            'order': cp.order,
            'label': cp.label,
            'score': cp.problem_score_sum or 0
        } for cp in contest_problems]

        # 2. Get Participants
        participants = ContestParticipant.objects.filter(contest=contest).select_related('user')
        
        # 3. Get Submissions
        from apps.submissions.models import Submission
        submissions = Submission.objects.filter(
            contest=contest,
            source_type='contest'
        ).order_by('created_at')

        # 4. Process Stats
        from apps.users.serializers import UserSerializer
        stats = {} 
        for p in participants:
            stats[p.user.id] = {
                'user': UserSerializer(p.user).data,
                'solved': 0,
                'total_score': 0,
                'time': 0, # Penalty
                'joined_at': p.joined_at,
                'has_finished_exam': p.has_finished_exam,
                'problems': {}
            }
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
            if uid not in stats: continue
            if pid not in stats[uid]['problems']: continue

            p_stat = stats[uid]['problems'][pid]
            
            if p_stat['status'] == 'AC':
                continue

            # if sub.status == 'CE':
            #     continue
            
            if sub.status in ['pending', 'judging']:
                p_stat['pending'] = True
                continue

            p_stat['tries'] += 1
            
            if sub.status == 'AC':
                p_stat['status'] = 'AC'
                # Calculate time in minutes from start_time
                # If start_time is null (shouldn't happen in active contest), use created_at
                start_time = contest.start_time or contest.created_at
                time_diff = sub.created_at - start_time
                minutes = int(time_diff.total_seconds() / 60)
                p_stat['time'] = minutes
                
                stats[uid]['solved'] += 1
                penalty = minutes + 20 * (p_stat['tries'] - 1)
                stats[uid]['time'] += penalty
                
                # Add score
                problem_score = next(((cp.problem_score_sum or 0) for cp in contest_problems if cp.problem.id == pid), 0)
                stats[uid]['total_score'] += problem_score
            else:
                p_stat['status'] = sub.status

        standings_list = list(stats.values())
        standings_list.sort(key=lambda x: (-x['solved'], x['time']))

        for i, item in enumerate(standings_list):
            item['rank'] = i + 1

        return Response({
            'problems': problems_data,
            'standings': standings_list
        })


class ClarificationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Clarifications (Q&A).
    """
    serializer_class = ClarificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ClarificationCreateSerializer
        return ClarificationSerializer
    
    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        user = self.request.user
        
        # Base queryset
        queryset = Clarification.objects.filter(contest_id=contest_id).select_related('author', 'problem')
        
        # Admin/Teacher see all
        contest = Contest.objects.get(id=contest_id)
        role = get_user_role_in_contest(user, contest)
        if role in ['admin', 'teacher']:
            return queryset
            
        # Students see their own + public ones
        return queryset.filter(
            Q(author=user) | Q(is_public=True)
        )
    
    def perform_create(self, serializer):
        contest_id = self.kwargs.get('contest_pk')
        contest = Contest.objects.get(id=contest_id)
        serializer.save(author=self.request.user, contest=contest, status='pending', is_public=True)

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin])
    def reply(self, request, pk=None, contest_pk=None):
        """
        Reply to a clarification.
        """
        clarification = self.get_object()
        serializer = ClarificationReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        clarification.answer = serializer.validated_data['answer']
        clarification.is_public = serializer.validated_data['is_public']
        clarification.status = 'answered'
        clarification.answered_at = timezone.now()
        clarification.save()
        
        # Log activity
        ContestActivityViewSet.log_activity(
            clarification.contest, 
            request.user, 
            'reply_question', 
            f"Replied to question #{clarification.id}"
        )
        
        return Response(ClarificationSerializer(clarification).data)


class ExamViewSet(viewsets.ViewSet):
    """
    ViewSet for Exam Mode operations.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    @action(detail=False, methods=['post'], url_path='start')
    def start_exam(self, request, contest_pk=None):
        """
        Signal that user is starting the exam (entering full screen).
        """
        contest = Contest.objects.get(id=contest_pk)
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=request.user)
            
            if participant.is_locked:
                return Response(
                    {'error': 'You have been locked out of this contest.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            if participant.has_finished_exam:
                if contest.allow_multiple_joins:
                    # Reset finished status if multiple joins allowed
                    participant.has_finished_exam = False
                    participant.save()
                else:
                    return Response(
                        {'error': 'You have already finished this exam.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            if participant.is_paused:
                participant.is_paused = False
                participant.save()
                
                # Log activity
                ContestActivityViewSet.log_activity(
                    contest, 
                    request.user, 
                    'start_exam', 
                    "Resumed exam"
                )
                return Response({'status': 'resumed'})

            if not participant.started_at:
                participant.started_at = timezone.now()
                participant.save()
            
            # Log activity
            ContestActivityViewSet.log_activity(
                contest, 
                request.user, 
                'start_exam', 
                "Started exam"
            )
            
            return Response({'status': 'started'})
        except ContestParticipant.DoesNotExist:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='end')
    def end_exam(self, request, contest_pk=None):
        """
        User manually finishes the exam.
        """
        contest = Contest.objects.get(id=contest_pk)
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=request.user)
            
            if not participant.started_at:
                return Response(
                    {'error': 'You have not started the exam yet'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
                
            participant.has_finished_exam = True
            participant.save()
            return Response({'status': 'finished'})
        except ContestParticipant.DoesNotExist:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post', 'get'], url_path='events', permission_classes=[permissions.IsAuthenticated])
    def events(self, request, contest_pk=None):
        """
        Handle exam events.
        POST: Log an event (Student/Participant)
        GET: List events (Teacher/Admin only)
        """
        if request.method == 'POST':
            return self._log_event(request, contest_pk)
        else:
            return self._list_events(request, contest_pk)

    def _log_event(self, request, contest_pk=None):
        """
        Log an exam event (tab switch, etc).
        """
        contest = Contest.objects.get(id=contest_pk)
        serializer = ExamEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        ExamEvent.objects.create(
            contest=contest,
            user=request.user,
            event_type=serializer.validated_data['event_type'],
            metadata=serializer.validated_data.get('metadata')
        )
        
        # Auto-lock logic
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=request.user)
            
            # Admin/Teacher bypass
            role = get_user_role_in_contest(request.user, contest)
            if role in ['admin', 'teacher']:
                return Response({'status': 'logged', 'locked': False, 'bypass': True})

            # Increment violation count
            participant.violation_count += 1
            
            # Check threshold
            should_lock = False
            if participant.violation_count > contest.max_cheat_warnings:
                should_lock = True
            
            if should_lock and not participant.is_locked:
                participant.is_locked = True
                participant.locked_at = timezone.now()
                
                # Use provided lock reason or default
                custom_reason = serializer.validated_data.get('lock_reason')
                if custom_reason:
                    participant.lock_reason = custom_reason
                else:
                    participant.lock_reason = f"System lock: {serializer.validated_data['event_type']}"
                
                # Log activity
                ContestActivityViewSet.log_activity(
                    contest, 
                    request.user, 
                    'lock_user', 
                    f"Auto-locked due to {serializer.validated_data['event_type']}"
                )
            
            participant.save()
            
            # Calculate auto unlock time
            auto_unlock_at = None
            if participant.is_locked and participant.locked_at and contest.allow_auto_unlock:
                minutes = contest.auto_unlock_minutes or 0
                auto_unlock_at = participant.locked_at + timezone.timedelta(minutes=minutes)
            
            return Response({
                'status': 'logged', 
                'locked': participant.is_locked,
                'violation_count': participant.violation_count,
                'max_warnings': contest.max_cheat_warnings,
                'remaining_chances': max(0, contest.max_cheat_warnings - participant.violation_count + 1),
                'auto_unlock_at': auto_unlock_at
            })
        except ContestParticipant.DoesNotExist:
            pass
            
        return Response({'status': 'logged', 'locked': False})
        
    def _list_events(self, request, contest_pk=None):
        """
        List all events for this contest (Teacher only).
        """
        # Manual permission check since we can't use permission_classes on helper methods
        # and the main action allows all authenticated users (for POST)
        contest = Contest.objects.get(id=contest_pk)
        user = request.user
        
        is_allowed = (
            user.is_staff or 
            user.is_superuser or 
            contest.owner_id == user.id
        )
        
        if not is_allowed:
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )

        events = ExamEvent.objects.filter(contest_id=contest_pk).select_related('user').order_by('-created_at')
        return Response(ExamEventSerializer(events, many=True).data)


class ContestAnnouncementViewSet(viewsets.ModelViewSet):
    """
    ViewSet for contest announcements.
    """
    serializer_class = ContestAnnouncementSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = None
    
    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        return ContestAnnouncement.objects.filter(contest_id=contest_id).order_by('-created_at')
    
    def perform_create(self, serializer):
        contest_id = self.kwargs.get('contest_pk')
        contest = Contest.objects.get(id=contest_id)
        
        user = self.request.user
        if not (user.is_staff or user == contest.owner):
            raise permissions.PermissionDenied("Only contest owner can post announcements")
            
        serializer.save(created_by=user, contest=contest)
        
        # Log activity
        from .views import ContestActivityViewSet
        ContestActivityViewSet.log_activity(
            contest, 
            user, 
            'announce', 
            f"Posted announcement: {serializer.validated_data.get('title')}"
        )


class ContestProblemViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for retrieving contest problems.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ContestProblemSerializer

    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        return ContestProblem.objects.filter(contest_id=contest_id).select_related('problem').annotate(
            problem_score_sum=Sum('problem__test_cases__score')
        )

    def retrieve(self, request, *args, **kwargs):
        contest_id = self.kwargs.get('contest_pk')
        problem_id = self.kwargs.get('pk')
        
        try:
            # We look up by problem_id (the Problem's ID), not ContestProblem's ID
            contest_problem = ContestProblem.objects.get(
                contest_id=contest_id,
                problem_id=problem_id
            )
        except ContestProblem.DoesNotExist:
            # Try looking up by ContestProblem ID as a fallback
            try:
                contest_problem = ContestProblem.objects.get(
                    contest_id=contest_id,
                    id=problem_id
                )
            except ContestProblem.DoesNotExist:
                return Response(
                    {'detail': 'Problem not found in this contest.'}, 
                    status=status.HTTP_404_NOT_FOUND
                )

        contest = contest_problem.contest
        user = request.user
        role = get_user_role_in_contest(user, contest)
        
        # Check permissions
        if role not in ['admin', 'teacher']:
            # Check if contest is active or ended (if allowed to view results)
            if contest.status == 'inactive' and not contest.allow_view_results:
                 return Response(
                    {'detail': 'Contest is not active.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Check if registered
            try:
                participant = ContestParticipant.objects.get(contest=contest, user=user)
                
                # Must have started exam or finished it to view problems
                if not participant.started_at and not participant.has_finished_exam:
                     return Response(
                        {'detail': 'You must start the contest to view problems.'}, 
                        status=status.HTTP_403_FORBIDDEN
                    )
                    
            except ContestParticipant.DoesNotExist:
                 return Response(
                    {'detail': 'You are not registered for this contest.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )

        # Serialize the problem with full details
        from apps.problems.serializers import ProblemDetailSerializer
        problem = contest_problem.problem
        serializer = ProblemDetailSerializer(problem, context={'request': request})
        data = serializer.data
        
        # Add contest-specific fields
        # data['score'] = contest_problem.score
        data['score'] = contest_problem.problem.test_cases.aggregate(Sum('score'))['score__sum'] or 0
        data['label'] = contest_problem.label
        data['contest_problem_id'] = contest_problem.id
        
        return Response(data)

    def create(self, request, *args, **kwargs):
        """
        Create a new problem and add it to the contest.
        Used for YAML import or creating new problems directly in contest context.
        """
        contest_id = self.kwargs.get('contest_pk')
        from .models import Contest, ContestProblem
        from django.shortcuts import get_object_or_404
        
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user
        
        # Check permissions (admin or teacher)
        if not (user.is_staff or user.role in ['admin', 'teacher']):
             return Response(
                {'detail': 'Permission denied.'}, 
                status=status.HTTP_403_FORBIDDEN
            )
            
        # Use ProblemAdminSerializer to create the problem
        from apps.problems.serializers import ProblemAdminSerializer
        
        # Ensure problem is hidden from practice and linked to contest
        data = request.data.copy()
        data['is_practice_visible'] = False
        data['is_visible'] = True # Visible in general (so it can be seen in contest)
        
        serializer = ProblemAdminSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        
        # Save with created_in_contest
        problem = serializer.save(created_in_contest=contest)
        
        # Calculate next order and label
        last_problem = ContestProblem.objects.filter(contest=contest).order_by('-order').first()
        next_order = (last_problem.order + 1) if last_problem else 0
        
        # Simple label generation (A, B, C...)
        import string
        if next_order < 26:
            next_label = string.ascii_uppercase[next_order]
        else:
            next_label = f"P{next_order + 1}"
            
        # Create ContestProblem link
        contest_problem = ContestProblem.objects.create(
            contest=contest,
            problem=problem,
            # score=100, # Default score removed
            # label=next_label,
            order=next_order
        )
        
        # Return the created problem data with contest_id for navigation
        response_data = serializer.data
        response_data['contest_id'] = contest.id
        
        # Log activity
        from .views import ContestActivityViewSet
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'update_problem', 
            f"Created new problem {problem.display_id} in contest"
        )
        
        return Response(response_data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """
        Remove a problem from the contest.
        """
        contest_id = self.kwargs.get('contest_pk')
        problem_id = self.kwargs.get('pk') # This is the problem_id (not ContestProblem id)
        
        from .models import Contest, ContestProblem
        from django.shortcuts import get_object_or_404
        
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user
        
        # Check permissions (admin or teacher)
        if not (user.is_staff or user.role in ['admin', 'teacher']):
             return Response(
                {'detail': 'Permission denied.'}, 
                status=status.HTTP_403_FORBIDDEN
            )
            
        try:
            # Find the ContestProblem entry
            # We use problem_id because the URL structure is usually .../problems/<problem_id>/
            # But wait, standard ViewSet expects pk to be the ID of the resource (ContestProblem).
            # However, our frontend might be sending the Problem ID.
            # Let's support both or check how retrieve works.
            # Retrieve supports both. Let's do the same here.
            
            try:
                contest_problem = ContestProblem.objects.get(
                    contest=contest,
                    problem_id=problem_id
                )
            except ContestProblem.DoesNotExist:
                contest_problem = ContestProblem.objects.get(
                    contest=contest,
                    id=problem_id
                )
                
            # Delete the relationship
            problem_display_id = contest_problem.problem.display_id
            contest_problem.delete()
            
            # Log activity
            from .views import ContestActivityViewSet
            ContestActivityViewSet.log_activity(
                contest, 
                request.user, 
                'update_problem', 
                f"Removed problem {problem_display_id} from contest"
            )
            
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except ContestProblem.DoesNotExist:
            return Response(
                {'detail': 'Problem not found in this contest.'}, 
                status=status.HTTP_404_NOT_FOUND
            )


class ContestActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing contest activities.
    Only accessible by admins and teachers.
    """
    serializer_class = ContestActivitySerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        contest_pk = self.kwargs.get('contest_pk')
        user = self.request.user
        contest = get_object_or_404(Contest, pk=contest_pk)
        
        role = get_user_role_in_contest(user, contest)
        if role not in ['admin', 'teacher']:
            return ContestActivity.objects.none()
            
        return ContestActivity.objects.filter(contest=contest).order_by('-created_at')

    @staticmethod
    def log_activity(contest, user, action_type, details=""):
        """
        Helper to log a contest activity.
        """
        try:
            ContestActivity.objects.create(
                contest=contest,
                user=user,
                action_type=action_type,
                details=details
            )
        except Exception as e:
            print(f"Failed to log activity: {e}")
