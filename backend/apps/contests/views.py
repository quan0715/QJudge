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
    ContestActivity,
    ExamStatus
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
        Inactive contests are hidden from public listing unless user is owner/participant.
        """
        queryset = super().get_queryset()
        queryset = queryset.annotate(participant_count=Count('participants'))

        user = self.request.user
        scope = self.request.query_params.get('scope', 'visible')

        # Teacher/Admin can see manage scope (all their contests)
        if scope == 'manage':
            if not user.is_authenticated:
                return queryset.none()
            if user.is_staff or getattr(user, 'role', '') == 'admin':
                return queryset
            # Teachers see contests they own
            return queryset.filter(owner=user)

        # Public scope (default)
        # Admin/staff can see all contests
        if user.is_staff or getattr(user, 'role', '') == 'admin':
            return queryset

        # For regular users:
        # - Active public/private contests are visible
        # - Inactive contests are only visible if user is owner or participant
        if user.is_authenticated:
            queryset = queryset.filter(
                # Active contests with public/private visibility
                Q(status='active', visibility__in=['public', 'private']) |
                # User is the owner (can see all their contests regardless of status)
                Q(owner=user) |
                # User is a participant (can see contests they joined regardless of status)
                Q(participants=user)
            ).distinct()
        else:
            # Anonymous users only see active public contests
            queryset = queryset.filter(
                status='active',
                visibility='public'
            )

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return ContestListSerializer

        if self.action in ['create', 'update', 'partial_update']:
            return ContestCreateUpdateSerializer

        return ContestDetailSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_update(self, serializer):
        """
        Override to log contest update activity.
        """
        instance = serializer.save()
        
        # Log activity - record what fields were changed
        changed_fields = []
        for field, value in serializer.validated_data.items():
            changed_fields.append(field)
        
        ContestActivityViewSet.log_activity(
            instance,
            self.request.user,
            'update_contest',
            f"Updated contest settings: {', '.join(changed_fields)}"
        )

    def retrieve(self, request, *args, **kwargs):
        """
        Retrieve contest details. Block access if inactive and user is not owner/admin/participant.
        """
        instance = self.get_object()
        user = request.user

        # Check if user is owner or admin
        is_privileged = user.is_authenticated and (
            instance.owner == user or
            user.is_staff or
            getattr(user, 'role', '') == 'admin'
        )

        # Check if user is a participant
        is_participant = False
        if user.is_authenticated:
            is_participant = ContestParticipant.objects.filter(
                contest=instance, user=user
            ).exists()

        # Block access to inactive contests for non-privileged, non-participant users
        if instance.status == 'inactive' and not is_privileged and not is_participant:
            return Response(
                {'detail': 'This contest is not available.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Auto-unlock check
        if user.is_authenticated:
            try:
                participant = ContestParticipant.objects.get(contest=instance, user=user)
                
                # Auto-unlock if locked and timeout passed
                if participant.exam_status == ExamStatus.LOCKED and instance.allow_auto_unlock and participant.locked_at:
                    minutes = instance.auto_unlock_minutes or 0
                    unlock_time = participant.locked_at + timezone.timedelta(minutes=minutes)
                    
                    if timezone.now() >= unlock_time:
                        participant.exam_status = ExamStatus.PAUSED
                        
                        # Reset lock info
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
                
                # Auto-submit if contest ended and participant still active
                if instance.end_time and timezone.now() >= instance.end_time:
                    if participant.exam_status in [ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED]:
                        participant.exam_status = ExamStatus.SUBMITTED
                        participant.left_at = timezone.now()
                        participant.save()
                        
                        # Log activity
                        ContestActivityViewSet.log_activity(
                            instance,
                            user,
                            'auto_submit',
                            "Auto-submitted: contest ended"
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

    # ========== Admin Management ==========
    @action(detail=True, methods=['get'], permission_classes=[IsContestOwnerOrAdmin])
    def admins(self, request, pk=None):
        """
        Get all admins for this contest.
        """
        contest = self.get_object()
        admins = contest.admins.all()
        return Response([{'id': u.id, 'username': u.username} for u in admins])

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='add_admin')
    def add_admin(self, request, pk=None):
        """
        Add a user as admin for this contest.
        Only owner can add admins.
        """
        contest = self.get_object()
        
        # Only owner can add admins
        if request.user != contest.owner and not request.user.is_superuser:
            return Response({'error': 'Only owner can add admins'}, status=status.HTTP_403_FORBIDDEN)
        
        username = request.data.get('username')
        if not username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.users.models import User
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if user == contest.owner:
            return Response({'error': 'Owner is already an admin'}, status=status.HTTP_400_BAD_REQUEST)
        
        if contest.admins.filter(pk=user.pk).exists():
            return Response({'error': 'User is already an admin'}, status=status.HTTP_400_BAD_REQUEST)
        
        contest.admins.add(user)
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'other', 
            f"Added admin: {username}"
        )
        
        return Response({'status': 'added', 'user': {'id': user.id, 'username': user.username}})

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='remove_admin')
    def remove_admin(self, request, pk=None):
        """
        Remove a user from admins.
        Only owner can remove admins.
        """
        contest = self.get_object()
        
        # Only owner can remove admins
        if request.user != contest.owner and not request.user.is_superuser:
            return Response({'error': 'Only owner can remove admins'}, status=status.HTTP_403_FORBIDDEN)
        
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.users.models import User
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not contest.admins.filter(pk=user.pk).exists():
            return Response({'error': 'User is not an admin'}, status=status.HTTP_400_BAD_REQUEST)
        
        contest.admins.remove(user)
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'other', 
            f"Removed admin: {user.username}"
        )
        
        return Response({'status': 'removed'})

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
            participant.exam_status = ExamStatus.PAUSED # Auto-unlock to paused state
            participant.locked_at = None
            participant.violation_count = 0
            participant.lock_reason = ""
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

            # Legacy field support removed - rely on exam_status
            if 'exam_status' in request.data:
                participant.exam_status = request.data['exam_status']
            
            if 'lock_reason' in request.data:
                participant.lock_reason = request.data['lock_reason']
                
            participant.save()
            
            # Log activity
            ContestActivityViewSet.log_activity(
                contest, 
                request.user, 
                'update_participant', 
                f"Updated participant {participant.user.username}: {request.data}"
            )
            
            return Response({'status': 'updated', 'exam_status': participant.exam_status})
        except ContestParticipant.DoesNotExist:
            return Response({'error': 'Participant not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='reopen_exam')
    def reopen_exam(self, request, pk=None):
        """
        Admin reopens a submitted exam, allowing student to continue.
        """
        contest = self.get_object()
        user_id = request.data.get('user_id')

        try:
            participant = ContestParticipant.objects.get(contest=contest, user_id=user_id)
            
            if participant.exam_status != ExamStatus.SUBMITTED:
                return Response({'error': 'Warning: User has not finished the exam.'}, status=status.HTTP_400_BAD_REQUEST)
                
            # Reopen to PAUSED state
            participant.exam_status = ExamStatus.PAUSED  # Require student to click "Continue"
            participant.save()
            
            # Log activity
            ContestActivityViewSet.log_activity(
                contest, 
                request.user, 
                'reopen_exam', 
                f"Reopened exam for {participant.user.username}"
            )
            
            return Response({'status': 'reopened', 'exam_status': ExamStatus.PAUSED})
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
        
        # Handle nickname (default to username if empty)
        nickname = request.data.get('nickname', '').strip()
        if not nickname:
            nickname = user.username
        
        ContestParticipant.objects.create(
            contest=contest, 
            user=user,
            nickname=nickname
        )
        
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

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated], url_path='update_nickname')
    def update_nickname(self, request, pk=None):
        """
        Allow user to update their nickname in an anonymous contest.
        """
        contest = self.get_object()
        user = request.user
        
        if not contest.anonymous_mode_enabled:
            return Response(
                {'error': 'Anonymous mode is not enabled for this contest'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
        except ContestParticipant.DoesNotExist:
            return Response(
                {'error': 'Not registered for this contest'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        nickname = request.data.get('nickname', '').strip()
        if not nickname:
            nickname = user.username
        
        if len(nickname) > 50:
            return Response(
                {'error': 'Nickname is too long (max 50 characters)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        participant.nickname = nickname
        participant.save()
        
        return Response({
            'status': 'updated',
            'nickname': nickname
        })

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
            # label=label, # Dynamic now
        )
        
        from apps.problems.serializers import ProblemListSerializer
        serializer = ProblemListSerializer(problem, context={'request': request})
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'add_problem', 
            f"Added problem {problem.display_id} to contest"
        )
        
        # Include contest_id for frontend navigation
        response_data = serializer.data
        response_data['contest_id'] = contest.id
        return Response(response_data, status=status.HTTP_201_CREATED)

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
        
        # Determine if current user can see real names
        can_see_real_names = role in ['admin', 'teacher']
        
        for p in participants:
            # Calculate display_name based on anonymous mode and role
            if not contest.anonymous_mode_enabled:
                display_name = p.user.username
            elif can_see_real_names:
                display_name = p.user.username
            else:
                display_name = p.nickname or p.user.username
            
            stats[p.user.id] = {
                'user': UserSerializer(p.user).data,
                'display_name': display_name,
                'nickname': p.nickname,
                'solved': 0,
                'rank': p.rank,
                'score': p.score,
                'joined_at': p.joined_at,
                'has_finished_exam': p.exam_status == ExamStatus.SUBMITTED,
                'started_at': p.started_at,
                'total_score': 0,
                'time': 0, # Penalty
                'problems': {}
            }
            for cp in contest_problems:
                stats[p.user.id]['problems'][cp.problem.id] = {
                    'status': None,
                    'tries': 0,
                    'time': 0,
                    'pending': False,
                    'score': 0,  # Score earned for this problem
                    'max_score': cp.problem_score_sum or 0  # Max possible score
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
            
            # Get max possible score for this problem
            max_problem_score = next(((cp.problem_score_sum or 0) for cp in contest_problems if cp.problem.id == pid), 0)
            
            if sub.status == 'AC':
                p_stat['status'] = 'AC'
                # Calculate time in minutes from start_time
                start_time = contest.start_time or contest.created_at
                time_diff = sub.created_at - start_time
                minutes = int(time_diff.total_seconds() / 60)
                p_stat['time'] = minutes
                
                stats[uid]['solved'] += 1
                penalty = minutes + 20 * (p_stat['tries'] - 1)
                stats[uid]['time'] += penalty
                
                # Full score for AC
                new_score = max_problem_score
                score_diff = new_score - p_stat['score']
                p_stat['score'] = new_score
                stats[uid]['total_score'] += score_diff
            else:
                p_stat['status'] = sub.status
                # Track partial score (highest score among all submissions)
                submission_score = sub.score or 0
                if submission_score > p_stat['score']:
                    score_diff = submission_score - p_stat['score']
                    p_stat['score'] = submission_score
                    stats[uid]['total_score'] += score_diff

        standings_list = list(stats.values())
        standings_list.sort(key=lambda x: (-x['solved'], x['time']))

        for i, item in enumerate(standings_list):
            item['rank'] = i + 1

        return Response({
            'problems': problems_data,
            'standings': standings_list
        })

    @action(detail=True, methods=['get'])
    def export_results(self, request, pk=None):
        """
        Export contest results as CSV file.
        Only accessible by admins and teachers.
        """
        import csv
        from django.http import HttpResponse
        
        contest = self.get_object()
        user = request.user
        
        # Only allow admins/teachers
        role = get_user_role_in_contest(user, contest)
        if role not in ['admin', 'teacher']:
            return Response(
                {'message': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get standings data (reuse standings logic)
        # 1. Get Problems
        contest_problems = ContestProblem.objects.filter(contest=contest).select_related('problem').order_by('order').annotate(
            problem_score_sum=Sum('problem__test_cases__score')
        )
        problems_data = list(contest_problems)
        
        # 2. Get Participants
        participants = ContestParticipant.objects.filter(contest=contest).select_related('user')
        
        # 3. Get Submissions
        from apps.submissions.models import Submission
        submissions = Submission.objects.filter(
            contest=contest,
            source_type='contest'
        ).order_by('created_at')
        
        # 4. Process Stats
        stats = {}
        for p in participants:
            stats[p.user.id] = {
                'username': p.user.username,
                'display_name': p.nickname or p.user.username,
                'email': p.user.email,
                'solved': 0,
                'total_score': 0,
                'time': 0,
                'problems': {}
            }
            for cp in contest_problems:
                stats[p.user.id]['problems'][cp.problem.id] = {
                    'status': '-',
                    'tries': 0,
                    'time': 0,
                    'score': 0
                }
        
        for sub in submissions:
            uid = sub.user.id
            pid = sub.problem.id
            if uid not in stats: 
                continue
            if pid not in stats[uid]['problems']: 
                continue
            
            p_stat = stats[uid]['problems'][pid]
            
            if p_stat['status'] == 'AC':
                continue
            
            if sub.status in ['pending', 'judging']:
                continue
            
            p_stat['tries'] += 1
            
            # Get max possible score for this problem
            max_problem_score = next(((cp.problem_score_sum or 0) for cp in problems_data if cp.problem.id == pid), 0)
            
            if sub.status == 'AC':
                p_stat['status'] = 'AC'
                start_time = contest.start_time or contest.created_at
                time_diff = sub.created_at - start_time
                minutes = int(time_diff.total_seconds() / 60)
                p_stat['time'] = minutes
                
                stats[uid]['solved'] += 1
                penalty = minutes + 20 * (p_stat['tries'] - 1)
                stats[uid]['time'] += penalty
                
                # Full score for AC
                new_score = max_problem_score
                score_diff = new_score - p_stat['score']
                p_stat['score'] = new_score
                stats[uid]['total_score'] += score_diff
            else:
                p_stat['status'] = sub.status
                # Track partial score (highest score among all submissions)
                submission_score = sub.score or 0
                if submission_score > p_stat['score']:
                    score_diff = submission_score - p_stat['score']
                    p_stat['score'] = submission_score
                    stats[uid]['total_score'] += score_diff
        
        # Sort by standings
        standings_list = list(stats.values())
        standings_list.sort(key=lambda x: (-x['solved'], x['time']))
        
        for i, item in enumerate(standings_list):
            item['rank'] = i + 1
        
        # Create CSV response
        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = f'attachment; filename="contest_{contest.id}_results.csv"'
        
        writer = csv.writer(response)
        
        # Header row
        header = ['排名', '帳號', '顯示名稱', 'Email', '解題數', '總分', '罰時']
        for cp in problems_data:
            header.append(f'{cp.label or chr(65 + cp.order)} ({cp.problem.title})')
        writer.writerow(header)
        
        # Data rows
        for item in standings_list:
            row = [
                item['rank'],
                item['username'],
                item['display_name'],
                item['email'],
                item['solved'],
                item['total_score'],
                item['time']
            ]
            for cp in problems_data:
                p_stat = item['problems'].get(cp.problem.id, {})
                status_str = p_stat.get('status', '-')
                tries = p_stat.get('tries', 0)
                time_val = p_stat.get('time', 0)
                
                if status_str == 'AC':
                    cell = f'AC ({tries} tries, {time_val}m)'
                elif tries > 0:
                    cell = f'{status_str} ({tries} tries)'
                else:
                    cell = '-'
                row.append(cell)
            
            writer.writerow(row)
        
        return response

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Download contest files in PDF or Markdown format.
        Accessible by participants and managers.
        """
        from django.http import HttpResponse
        from .exporters import MarkdownExporter, PDFExporter, sanitize_filename
        
        contest = self.get_object()
        user = request.user
        
        # Check permissions: user must be participant, owner, or admin
        role = get_user_role_in_contest(user, contest)
        is_participant = ContestParticipant.objects.filter(contest=contest, user=user).exists()
        
        if not (role in ['admin', 'teacher'] or is_participant):
            return Response(
                {'message': 'You must be a participant or manager to download contest files'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get file_format, language, and scale from query params
        # Use 'file_format' instead of 'format' to avoid conflict with DRF's format suffix feature
        file_format = request.query_params.get('file_format', 'markdown').lower()
        language = request.query_params.get('language', 'zh-TW')
        
        # Get scale parameter for PDF (0.5 to 2.0, default 1.0)
        try:
            scale = float(request.query_params.get('scale', '1.0'))
            scale = max(0.5, min(2.0, scale))  # Clamp between 0.5 and 2.0
        except (ValueError, TypeError):
            scale = 1.0
        
        if file_format not in ['markdown', 'pdf']:
            return Response(
                {'error': 'Invalid format. Choose "markdown" or "pdf"'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Sanitize contest name for safe filename
        safe_name = sanitize_filename(contest.name)
        
        try:
            if file_format == 'markdown':
                exporter = MarkdownExporter(contest, language)
                content = exporter.export()
                
                response = HttpResponse(content, content_type='text/markdown; charset=utf-8')
                response['Content-Disposition'] = f'attachment; filename="contest_{contest.id}_{safe_name}.md"'
                
            else:  # pdf
                exporter = PDFExporter(contest, language, scale=scale)
                pdf_file = exporter.export()
                
                response = HttpResponse(pdf_file.read(), content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="contest_{contest.id}_{safe_name}.pdf"'
            
            return response
            
        except Exception as e:
            return Response(
                {'error': f'Failed to generate file: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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


def validate_exam_operation(contest, user, require_in_progress=False, allow_admin_bypass=True):
    """
    3-layer permission check for exam operations.
    
    Layer 1: Contest status (must be active)
    Layer 2: Time range (must be within start_time ~ end_time)
    Layer 3: Participant status (must be registered, optionally in_progress)
    
    Returns: (participant, error_response) tuple
             If validation passes: (participant, None)
             If validation fails: (None, Response)
    """
    # Admin/Teacher bypass for Layer 1 and 2
    if allow_admin_bypass:
        role = get_user_role_in_contest(user, contest)
        if role in ['admin', 'teacher']:
            try:
                participant = ContestParticipant.objects.get(contest=contest, user=user)
                return participant, None
            except ContestParticipant.DoesNotExist:
                # Admins/Teachers don't need to be registered
                return None, None
    
    # Layer 1: Contest status
    if contest.status != 'active':
        return None, Response(
            {'error': 'Contest is not active.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Layer 2: Time range
    now = timezone.now()
    if contest.start_time and now < contest.start_time:
        return None, Response(
            {'error': 'Contest has not started yet. Please wait until the start time.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if contest.end_time and now > contest.end_time:
        return None, Response(
            {'error': 'Contest has ended.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Layer 3: Participant status
    try:
        participant = ContestParticipant.objects.get(contest=contest, user=user)
    except ContestParticipant.DoesNotExist:
        return None, Response(
            {'error': 'Not registered for this contest.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if require_in_progress and participant.exam_status != ExamStatus.IN_PROGRESS:
        return None, Response(
            {'error': 'Exam is not in progress.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    return participant, None


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
        
        # 3-layer permission check (don't require in_progress for start)
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error_response:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if locked
        if participant.exam_status == ExamStatus.LOCKED:
            return Response(
                {'error': 'You have been locked out of this contest.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check if already submitted
        if participant.exam_status == ExamStatus.SUBMITTED:
            if contest.allow_multiple_joins:
                # Reset for re-entry - clear violation count for fresh start
                participant.exam_status = ExamStatus.IN_PROGRESS
                participant.violation_count = 0
                participant.save()
            else:
                return Response(
                    {'error': 'You have already finished this exam.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Handle resume from paused state
        if participant.exam_status == ExamStatus.PAUSED:
            participant.exam_status = ExamStatus.IN_PROGRESS
            participant.save()
            
            # Log activity
            ContestActivityViewSet.log_activity(
                contest, 
                request.user, 
                'resume_exam', 
                "Resumed exam"
            )
            return Response({'status': 'resumed', 'exam_status': ExamStatus.IN_PROGRESS})

        # Start exam for user if not already started
        if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
            participant.started_at = timezone.now()
            participant.exam_status = ExamStatus.IN_PROGRESS
            participant.save()
            
            # Log activity
            ContestActivityViewSet.log_activity(
                contest, 
                request.user, 
                'start_exam', 
                "Started exam"
            )
        
        return Response({'status': 'started', 'exam_status': ExamStatus.IN_PROGRESS})

    @action(detail=False, methods=['post'], url_path='end')
    def end_exam(self, request, contest_pk=None):
        """
        User manually finishes the exam.
        Allowed in: in_progress, locked, paused states.
        """
        contest = Contest.objects.get(id=contest_pk)
        
        # Don't require in_progress - allow submission from in_progress, locked, or paused
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error_response:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if exam can be submitted (must be in_progress, locked, or paused)
        submittable_states = [ExamStatus.IN_PROGRESS, ExamStatus.LOCKED, ExamStatus.PAUSED]
        if participant.exam_status not in submittable_states:
            return Response(
                {'error': f'Cannot submit exam in current state: {participant.exam_status}'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not participant.started_at:
            return Response(
                {'error': 'You have not started the exam yet'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        participant.left_at = timezone.now()
        participant.exam_status = ExamStatus.SUBMITTED
        participant.save()
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'end_exam', 
            "Submitted exam"
        )
        
        return Response({'status': 'finished', 'exam_status': ExamStatus.SUBMITTED})

    @action(detail=False, methods=['post'], url_path='heartbeat', permission_classes=[permissions.IsAuthenticated])
    def heartbeat(self, request, contest_pk=None):
        """
        Exam heartbeat to verify client connectivity.
        Should be called every 30 seconds during exam.
        
        POST /api/v1/contests/{id}/exam/heartbeat
        Body: { "is_focused": true, "is_fullscreen": true }
        """
        contest = Contest.objects.get(id=contest_pk)
        user = request.user
        
        # Admin/Teacher bypass
        role = get_user_role_in_contest(user, contest)
        if role in ['admin', 'teacher']:
            return Response({'status': 'ok', 'bypass': True})
        
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
        except ContestParticipant.DoesNotExist:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Only update heartbeat if exam is in progress
        if participant.exam_status == ExamStatus.IN_PROGRESS:
            participant.last_heartbeat = timezone.now()
            participant.save(update_fields=['last_heartbeat'])
            
            # Check for violations reported in heartbeat
            is_focused = request.data.get('is_focused', True)
            is_fullscreen = request.data.get('is_fullscreen', True)
            
            if not is_focused or not is_fullscreen:
                # Log potential violation (but don't auto-lock from heartbeat alone)
                ExamEvent.objects.create(
                    contest=contest,
                    user=user,
                    event_type='forbidden_focus_event' if not is_focused else 'exit_fullscreen',
                    metadata={
                        'source': 'heartbeat',
                        'is_focused': is_focused,
                        'is_fullscreen': is_fullscreen
                    }
                )
        
        return Response({
            'status': 'ok',
            'exam_status': participant.exam_status,
            'violation_count': participant.violation_count,
            'max_warnings': contest.max_cheat_warnings,
        })

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
        Only logs events when exam is in_progress.
        """
        contest = Contest.objects.get(id=contest_pk)
        
        # 3-layer permission check (require in_progress for event logging)
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=True, allow_admin_bypass=True
        )
        if error_response:
            return error_response
        
        # Admin/Teacher bypass - don't log violations
        role = get_user_role_in_contest(request.user, contest)
        if role in ['admin', 'teacher']:
            return Response({'status': 'logged', 'locked': False, 'bypass': True})
        
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = ExamEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        ExamEvent.objects.create(
            contest=contest,
            user=request.user,
            event_type=serializer.validated_data['event_type'],
            metadata=serializer.validated_data.get('metadata')
        )

        # Increment violation count
        participant.violation_count += 1
        
        # Check threshold - if should lock and not already locked
        should_lock = participant.violation_count >= contest.max_cheat_warnings
        if should_lock and participant.exam_status != ExamStatus.LOCKED:
            participant.exam_status = ExamStatus.LOCKED
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
        if participant.exam_status == ExamStatus.LOCKED and participant.locked_at and contest.allow_auto_unlock:
            minutes = contest.auto_unlock_minutes or 0
            auto_unlock_at = participant.locked_at + timezone.timedelta(minutes=minutes)
        
        return Response({
            'violation_count': participant.violation_count,
            'max_cheat_warnings': contest.max_cheat_warnings,
            'locked': participant.exam_status == ExamStatus.LOCKED,
            'auto_unlock_at': auto_unlock_at
        })
        
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
                if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
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
