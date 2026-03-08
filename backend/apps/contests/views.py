"""
Views for contests app.
"""
import logging
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone
from django.conf import settings
from django.db import transaction
from django.db.models import Q, Sum, Max
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404

from .access_policy import ContestAccessPolicy
from apps.core.throttles import (
    ExamAnticheatUrlsThrottle,
    ExamEventsThrottle,
)
from .models import (
    Contest,
    ContestParticipant,
    ContestProblem,
    ExamQuestion,
    ContestAnnouncement,
    Clarification,
    ExamEvent,
    ContestActivity,
    ExamStatus,
    ExamAnswer,
    ExamEvidenceJob,
    ExamEvidenceVideo,
)
from .serializers import (
    ContestListSerializer,
    ContestDetailSerializer,
    ContestCreateUpdateSerializer,
    ContestParticipantSerializer,
    ContestAnnouncementSerializer,
    ContestProblemSerializer,
    ContestProblemCreateSerializer,
    ExamQuestionSerializer,
    ExamQuestionStudentSerializer,
    ClarificationSerializer,
    ClarificationCreateSerializer,
    ClarificationReplySerializer,
    ExamEventSerializer,
    ExamEventCreateSerializer,
    ContestActivitySerializer,
    ExamAnswerSerializer,
    ExamAnswerDetailSerializer,
    ExamAnswerSubmitSerializer,
    ExamAnswerGradeSerializer,
    AnticheatUrlsQuerySerializer,
    ActiveSessionClearSerializer,
    ExamTakeoverApproveSerializer,
    ExamEvidenceVideoSerializer,
    ExamEvidenceVideoFlagSerializer,
)
from .permissions import (
    IsContestOwnerOrAdmin,
    IsContestLifecycleOwner,
    IsContestParticipant,
    get_contest_scope_role,
    get_user_role_in_contest,
    can_manage_contest,
)
from .services.export_service import (
    ExportValidationError,
    build_contest_download_response,
    build_paper_exam_sheet_response,
    build_student_report_response,
    parse_scale,
)
from .services.scoreboard import ScoreboardScope, ScoreboardService
from .services.anti_cheat_session import (
    clear_active_session,
    get_active_session,
    get_device_id,
    is_duplicate_exam_event,
    set_active_session,
)
from .services.anticheat_storage import (
    build_raw_object_key,
    build_upload_session_id,
    generate_get_url,
    generate_put_url,
)
from .services.exam_submission import finalize_submission
from apps.problems.services import ProblemService
from apps.problems.models import Problem

logger = logging.getLogger(__name__)


class ContestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for contests.
    """
    queryset = Contest.objects.all()
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, ContestAccessPolicy]
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
        Draft/archived contests are hidden from public listing.
        """
        queryset = super().get_queryset()

        if self.action and self.action != "list":
            return queryset

        scope = self.request.query_params.get("scope", "visible")
        return queryset.optimized_for_list().visible_to(user=self.request.user, scope=scope)

    def get_serializer_class(self):
        if self.action == 'list':
            return ContestListSerializer

        if self.action in ['create', 'update', 'partial_update']:
            return ContestCreateUpdateSerializer

        return ContestDetailSerializer

    def handle_exception(self, exc) -> Response:
        from rest_framework.exceptions import NotAuthenticated, PermissionDenied

        if isinstance(exc, (NotAuthenticated, PermissionDenied)):
            error_response = getattr(self.request, "_permission_error", None)
            if error_response is not None:
                return error_response

        return super().handle_exception(exc)

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
        Retrieve contest details. Block access if draft or archived for non-privileged users.
        """
        instance = self.get_object()
        user = request.user

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
                if instance.status == 'published' and instance.end_time and timezone.now() >= instance.end_time:
                    if participant.exam_status in [
                        ExamStatus.IN_PROGRESS,
                        ExamStatus.PAUSED,
                        ExamStatus.LOCKED,
                        ExamStatus.LOCKED_TAKEOVER,
                    ]:
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

    @action(detail=True, methods=['post'], permission_classes=[IsContestLifecycleOwner])
    def toggle_status(self, request, pk=None):
        """
        Toggle contest status between published and draft.
        """
        contest = self.get_object()
        if contest.status == 'archived':
            return Response(
                {'error': 'Contest is archived and cannot be toggled'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if contest.status == 'published':
            contest.status = 'draft'
        else:
            contest.status = 'published'
        contest.save()
        
        # Log activity
        ContestActivityViewSet.log_activity(
            contest, 
            request.user, 
            'other', 
            f"Toggled contest status to {contest.status}"
        )
        
        return Response({'status': contest.status})

    @action(detail=True, methods=['post'], permission_classes=[IsContestLifecycleOwner])
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

    @action(detail=True, methods=['post'], permission_classes=[IsContestLifecycleOwner], url_path='add_admin')
    def add_admin(self, request, pk=None):
        """
        Add a user as co-admin for this contest.
        Only owner (or platform admin) can add co-admins.
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
        
        if user == contest.owner:
            return Response({'error': 'Owner is already an admin'}, status=status.HTTP_400_BAD_REQUEST)

        # Only teachers or system admins can be added as co-admin
        if not (user.is_staff or user.is_superuser or getattr(user, 'role', '') in ('teacher', 'admin')):
            return Response(
                {'error': 'Only teachers or admins can be added as co-admin'},
                status=status.HTTP_400_BAD_REQUEST
            )

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

    @action(detail=True, methods=['post'], permission_classes=[IsContestLifecycleOwner], url_path='remove_admin')
    def remove_admin(self, request, pk=None):
        """
        Remove a user from co-admins.
        Only owner (or platform admin) can remove co-admins.
        """
        contest = self.get_object()
        
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
        Delete a contest. Only owner or platform_admin can delete.
        """
        contest = self.get_object()
        lifecycle_perm = IsContestLifecycleOwner()
        if not lifecycle_perm.has_object_permission(request, self, contest):
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

        # Only allow registration for published contests
        if contest.status != 'published':
            return Response(
                {'message': 'Contest is not published'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Block registration after contest ends
        if contest.end_time and timezone.now() > contest.end_time:
            return Response(
                {'message': 'Contest has ended'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if already registered
        if ContestParticipant.objects.filter(contest=contest, user=user).exists():
            return Response(
                {'message': 'Already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Check password if private
        if contest.visibility == 'private':
            password = request.data.get('password')
            if not contest.verify_contest_password(password):
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
        
        # Managers (platform_admin / owner / co_owner) can always enter
        if can_manage_contest(user, contest):
            return Response({'message': 'Entered successfully (Privileged)'})

        if contest.status == 'draft':
            return Response(
                {'message': 'Contest is not published'},
                status=status.HTTP_403_FORBIDDEN
            )

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
        url_path=r'problems/(?P<problem_id>\d+)/publish'
    )
    def publish_problem_to_practice(self, request, pk=None, problem_id=None):
        """
        Publish a single contest problem to the practice library by cloning.
        Only allowed when contest is archived.
        """
        contest = self.get_object()

        if contest.status != 'archived':
            return Response(
                {'message': 'Contest must be archived before publishing problems'},
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

        exists = Problem.objects.filter(
            origin_problem=problem,
            created_in_contest=contest,
        ).exists()
        if exists:
            return Response(
                {'message': 'Problem already published to practice'},
                status=status.HTTP_400_BAD_REQUEST
            )

        new_problem = ProblemService.clone_problem_to_practice(
            source_problem=problem,
            source_contest=contest,
            created_by=request.user,
        )

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'other',
            f"Published problem {problem.display_id} to practice",
        )

        return Response(
            {
                'message': 'Problem published successfully',
                'created_problem_id': new_problem.id,
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsContestOwnerOrAdmin],
        url_path='publish_to_practice'
    )
    def publish_problems_to_practice(self, request, pk=None):
        """
        Clone archived contest problems into the practice library.
        """
        contest = self.get_object()

        if contest.status != 'archived':
            return Response(
                {'message': 'Contest must be archived before publishing problems'},
                status=status.HTTP_403_FORBIDDEN
            )

        problem_ids = request.data.get('problem_ids')
        if isinstance(problem_ids, str):
            problem_ids = [pid for pid in problem_ids.split(",") if pid.strip()]
        contest_problems = ContestProblem.objects.filter(contest=contest).select_related('problem')
        if problem_ids:
            contest_problems = contest_problems.filter(problem_id__in=problem_ids)

        created_problem_ids = []
        skipped_problem_ids = []

        for contest_problem in contest_problems:
            problem = contest_problem.problem
            exists = Problem.objects.filter(
                origin_problem=problem,
                created_in_contest=contest,
            ).exists()
            if exists:
                skipped_problem_ids.append(problem.id)
                continue

            new_problem = ProblemService.clone_problem_to_practice(
                source_problem=problem,
                source_contest=contest,
                created_by=request.user,
            )
            created_problem_ids.append(new_problem.id)

        if created_problem_ids:
            ContestActivityViewSet.log_activity(
                contest,
                request.user,
                "other",
                "Published contest problems to practice",
            )

        return Response({
            'created_problem_ids': created_problem_ids,
            'skipped_problem_ids': skipped_problem_ids,
        })

    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        """
        Get contest standings (ICPC Style).
        """
        contest = self.get_object()
        result = ScoreboardService.calculate(
            contest,
            ScoreboardScope(viewer=request.user, mode="scoreboard"),
        )

        return Response({
            'problems': result.problems,
            'standings': result.standings,
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
        result = ScoreboardService.calculate(
            contest,
            ScoreboardScope(viewer=request.user, mode="export"),
        )

        # Create CSV response
        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = f'attachment; filename="contest_{contest.id}_results.csv"'
        
        writer = csv.writer(response)
        
        # Header row
        header = ['排名', '帳號', '顯示名稱', 'Email', '解題數', '總分', '罰時']
        for problem in result.problems:
            label = problem.get('label') or chr(65 + problem['order'])
            title = problem.get('title') or ''
            header.append(f'{label} ({title})')
        writer.writerow(header)
        
        # Data rows
        for item in result.standings:
            row = [
                item['rank'],
                item['user'].get('username'),
                item['display_name'],
                item['user'].get('email'),
                item['solved'],
                item['total_score'],
                item['time']
            ]
            for problem in result.problems:
                p_stat = item['problems'].get(problem['id'], {})
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

    @action(detail=True, methods=['get'], permission_classes=[IsContestOwnerOrAdmin])
    def download(self, request, pk=None):
        """
        Download contest files in PDF or Markdown format.
        Only accessible by contest owners and admins (contains problem content).
        """
        contest = self.get_object()
        file_format = request.query_params.get('file_format', 'markdown')
        language = request.query_params.get('language', 'zh-TW')
        scale = parse_scale(request.query_params.get('scale', '1.0'))
        layout = request.query_params.get('layout', 'normal')

        try:
            return build_contest_download_response(
                contest=contest,
                file_format=file_format,
                language=language,
                scale=scale,
                layout=layout,
            )
        except ExportValidationError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.exception("Failed to generate contest export: %s", e)
            return Response(
                {'error': 'Failed to generate file'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'], permission_classes=[IsContestOwnerOrAdmin], 
            url_path=r'participants/(?P<user_id>\d+)/report')
    def participant_report(self, request, pk=None, user_id=None):
        """
        Download individual student's exam report as PDF.
        Only accessible by contest owners and admins.
        
        GET /api/v1/contests/{id}/participants/{user_id}/report/
        """
        from apps.users.models import User
        
        contest = self.get_object()
        
        # Get the target user
        try:
            target_user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if user is a participant
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=target_user)
        except ContestParticipant.DoesNotExist:
            return Response(
                {'error': 'User is not a participant in this contest'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        language = request.query_params.get('language', 'zh-TW')
        scale = parse_scale(request.query_params.get('scale', '1.0'))
        
        try:
            response = build_student_report_response(
                contest=contest,
                user=target_user,
                language=language,
                scale=scale,
            )
            
            # Log activity
            ContestActivityViewSet.log_activity(
                contest,
                request.user,
                'other',
                f"Downloaded report for participant {target_user.username}"
            )
            
            return response
            
        except Exception as e:
            logger.exception("Failed to generate participant report: %s", e)
            return Response(
                {'error': 'Failed to generate report'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated],
            url_path='my_report')
    def my_report(self, request, pk=None):
        """
        Download current user's own exam report as PDF.
        Only accessible after exam submission (exam_status = 'submitted').
        
        GET /api/v1/contests/{id}/my_report/
        """
        contest = self.get_object()
        user = request.user
        
        # Check if user is a participant
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
        except ContestParticipant.DoesNotExist:
            return Response(
                {'error': 'You are not a participant in this contest'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if exam is submitted
        if participant.exam_status != ExamStatus.SUBMITTED:
            return Response(
                {'error': 'You can only download your report after submitting the exam'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check contest-level export policy
        if not contest.can_download_my_report:
            return Response(
                {'error': 'Results have not been published yet'},
                status=status.HTTP_403_FORBIDDEN
            )

        language = request.query_params.get('language', 'zh-TW')
        scale = parse_scale(request.query_params.get('scale', '1.0'))
        
        try:
            return build_student_report_response(
                contest=contest,
                user=user,
                language=language,
                scale=scale,
            )
            
        except Exception as e:
            logger.exception("Failed to generate personal report: %s", e)
            return Response(
                {'error': 'Failed to generate report'},
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
        
        # Managers (platform_admin / owner / co_owner) see all
        contest = get_object_or_404(Contest, id=contest_id)
        if can_manage_contest(user, contest):
            return queryset
            
        # Participants see their own + public ones
        return queryset.filter(
            Q(author=user) | Q(is_public=True)
        )
    
    def perform_create(self, serializer):
        contest_id = self.kwargs.get('contest_pk')
        contest = get_object_or_404(Contest, id=contest_id)
        serializer.save(author=self.request.user, contest=contest, status='pending', is_public=True)

    def perform_update(self, serializer):
        instance = serializer.instance
        if not can_manage_contest(self.request.user, instance.contest) and instance.author != self.request.user:
            raise PermissionDenied("You can only edit your own clarifications")
        serializer.save()

    def perform_destroy(self, instance):
        if not can_manage_contest(self.request.user, instance.contest) and instance.author != self.request.user:
            raise PermissionDenied("You can only delete your own clarifications")
        instance.delete()

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
    
    Layer 1: Contest status (must be published)
    Layer 2: Time range (must be within start_time ~ end_time)
    Layer 3: Participant status (must be registered, optionally in_progress)
    
    Returns: (participant, error_response) tuple
             If validation passes: (participant, None)
             If validation fails: (None, Response)
    """
    # Manager bypass for Layer 1 and 2 (platform_admin / owner / co_owner)
    if allow_admin_bypass and can_manage_contest(user, contest):
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
            return participant, None
        except ContestParticipant.DoesNotExist:
            # Managers don't need to be registered
            return None, None
    
    # Layer 1: Contest status
    if contest.status != 'published':
        return None, Response(
            {'error': 'Contest is not published.'},
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


class ExamViewSet(viewsets.GenericViewSet):
    """
    ViewSet for Exam Mode operations.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExamEventCreateSerializer
    PENALIZED_EVENT_TYPES = {
        'tab_hidden',
        'window_blur',
        'exit_fullscreen',
        'multiple_displays',
        'mouse_leave',
        'screen_share_stopped',
        'warning_timeout',
        'forbidden_focus_event',
    }
    IMMEDIATE_LOCK_EVENT_TYPES = {'warning_timeout', 'screen_share_stopped'}
    MONITORED_STATUSES = {ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER}

    def _conflict_payload(self, contest, participant):
        return {
            "code": "EXAM_ACTIVE_OTHER_DEVICE",
            "message": "Another device is currently active for this exam session.",
            "active_exam": {
                "contest_id": contest.id,
                "contest_name": contest.name,
                "exam_status": participant.exam_status,
                "started_at": participant.started_at,
            },
        }

    def _ensure_active_device_session(self, contest, participant, request):
        device_id = get_device_id(request)
        active = get_active_session(contest.id, participant.user_id)
        if active and active.get("device_id") and active.get("device_id") != device_id:
            ExamEvent.objects.create(
                contest=contest,
                user=participant.user,
                event_type="concurrent_login_detected",
                metadata={
                    "existing_device_id": active.get("device_id"),
                    "incoming_device_id": device_id,
                    "source": "exam_api",
                },
            )
            return Response(self._conflict_payload(contest, participant), status=status.HTTP_409_CONFLICT)
        set_active_session(contest, participant, request, device_id)
        return None

    def _build_event_response(self, participant, contest):
        auto_unlock_at = None
        if participant.exam_status == ExamStatus.LOCKED and participant.locked_at and contest.allow_auto_unlock:
            minutes = contest.auto_unlock_minutes or 0
            auto_unlock_at = participant.locked_at + timezone.timedelta(minutes=minutes)

        return {
            'exam_status': participant.exam_status,
            'violation_count': participant.violation_count,
            'max_cheat_warnings': contest.max_cheat_warnings,
            'locked': participant.exam_status in {ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER},
            'submitted': participant.exam_status == ExamStatus.SUBMITTED,
            'submit_reason': participant.submit_reason or "",
            'auto_unlock_at': auto_unlock_at,
        }

    def _auto_submit_participant(
        self,
        participant,
        contest,
        actor,
        reason,
        upload_session_id: str | None = None,
    ):
        finalize_submission(
            participant,
            submit_reason=reason,
            upload_session_id=upload_session_id,
            activity_user=actor,
            activity_action_type="auto_submit",
            activity_details=reason,
        )

    def _process_penalized_event(
        self,
        participant,
        contest,
        actor,
        event_type,
        upload_session_id: str | None = None,
    ):
        """
        Unified anti-cheat state handling.
        - in_progress: threshold => lock
        - paused/locked: threshold => auto-submit
        - submitted: no-op (already finished)
        """
        if participant.exam_status == ExamStatus.SUBMITTED:
            return participant

        participant.violation_count += 1
        update_fields = ['violation_count']
        force_lock = event_type in self.IMMEDIATE_LOCK_EVENT_TYPES
        reached_threshold = participant.violation_count >= contest.max_cheat_warnings
        should_escalate = force_lock or reached_threshold

        if should_escalate:
            if participant.exam_status == ExamStatus.IN_PROGRESS:
                participant.exam_status = ExamStatus.LOCKED
                participant.locked_at = timezone.now()
                if force_lock:
                    if event_type == "warning_timeout":
                        participant.lock_reason = "Warning timeout: student did not acknowledge warning within 30 seconds"
                    elif event_type == "screen_share_stopped":
                        participant.lock_reason = "Screen share stopped during exam session"
                    else:
                        participant.lock_reason = f"System lock (immediate): {event_type}"
                else:
                    participant.lock_reason = f"System lock: {event_type}"
                update_fields.extend(['exam_status', 'locked_at', 'lock_reason'])
                participant.save(update_fields=update_fields)
                ContestActivityViewSet.log_activity(
                    contest,
                    actor,
                    'lock_user',
                    f"Auto-locked due to {event_type}"
                )
                return participant

            # paused/locked are non-answering states; escalate to immediate submission.
            reason = (
                f"Auto-submitted: violation while {participant.exam_status} "
                f"(event={event_type}, count={participant.violation_count}/{contest.max_cheat_warnings})"
            )
            participant.save(update_fields=update_fields)
            self._auto_submit_participant(
                participant,
                contest,
                actor,
                reason,
                upload_session_id=upload_session_id,
            )
            return ContestParticipant.objects.get(pk=participant.pk)

        participant.save(update_fields=update_fields)
        return participant
    
    @action(detail=False, methods=['post'], url_path='start')
    def start_exam(self, request, contest_pk=None):
        """
        Signal that user is starting the exam (entering full screen).
        """
        contest = get_object_or_404(Contest, id=contest_pk)
        
        # 3-layer permission check (don't require in_progress for start)
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error_response:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if locked
        if participant.exam_status in {ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER}:
            message = (
                'Exam session has been locked due to device takeover. '
                'Please wait for invigilator approval.'
                if participant.exam_status == ExamStatus.LOCKED_TAKEOVER
                else 'You have been locked out of this contest.'
            )
            return Response(
                {'error': message},
                status=status.HTTP_403_FORBIDDEN
            )

        conflict_response = self._ensure_active_device_session(contest, participant, request)
        if conflict_response:
            return conflict_response

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
        
        set_active_session(contest, participant, request, get_device_id(request))
        return Response({'status': 'started', 'exam_status': ExamStatus.IN_PROGRESS})

    @action(detail=False, methods=['post'], url_path='end')
    def end_exam(self, request, contest_pk=None):
        """
        User manually finishes the exam.
        Allowed in: in_progress, locked, paused states.
        """
        contest = get_object_or_404(Contest, id=contest_pk)
        
        # Don't require in_progress - allow submission from in_progress, locked, or paused
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error_response:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if exam can be submitted (must be in_progress, locked, paused, or takeover-locked)
        submittable_states = [
            ExamStatus.IN_PROGRESS,
            ExamStatus.LOCKED,
            ExamStatus.PAUSED,
            ExamStatus.LOCKED_TAKEOVER,
        ]
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
        
        submit_reason = str(request.data.get('submit_reason') or "Submitted exam").strip()
        finalize_submission(
            participant,
            submit_reason=submit_reason,
            upload_session_id=str(request.data.get("upload_session_id") or ""),
            activity_user=request.user,
            activity_action_type="end_exam",
            activity_details=submit_reason,
        )
        
        return Response({
            'status': 'finished',
            'exam_status': ExamStatus.SUBMITTED,
            'submit_reason': submit_reason,
        })

    @action(
        detail=False,
        methods=['get'],
        url_path='anticheat-urls',
        permission_classes=[permissions.IsAuthenticated],
        throttle_classes=[ExamAnticheatUrlsThrottle],
    )
    def anticheat_urls(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error_response:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        if participant.exam_status not in self.MONITORED_STATUSES:
            return Response(
                {'error': f'Cannot issue anticheat upload URLs in status: {participant.exam_status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conflict_response = self._ensure_active_device_session(contest, participant, request)
        if conflict_response:
            return conflict_response

        query_serializer = AnticheatUrlsQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        count = query_serializer.validated_data["count"]

        upload_session_id = str(query_serializer.validated_data.get("upload_session_id") or "").strip()
        if not upload_session_id:
            upload_session_id = build_upload_session_id()
        start_seq = int(query_serializer.validated_data.get("start_seq") or 1)
        base_ts = int(timezone.now().timestamp() * 1000)
        items = []
        for i in range(count):
            seq = start_seq + i
            ts_ms = base_ts + i * 10_000
            object_key = build_raw_object_key(
                contest_id=contest.id,
                user_id=request.user.id,
                upload_session_id=upload_session_id,
                ts_ms=ts_ms,
                seq=seq,
            )
            put_url = generate_put_url(
                settings.ANTICHEAT_RAW_BUCKET,
                object_key,
                expires_seconds=settings.ANTICHEAT_PRESIGNED_URL_TTL_SECONDS,
            )
            items.append(
                {
                    "seq": seq,
                    "object_key": object_key,
                    "put_url": put_url,
                    "required_headers": {
                        "Content-Type": "image/webp",
                        "x-amz-tagging": "cleanup=true",
                    },
                }
            )

        return Response(
            {
                "upload_session_id": upload_session_id,
                "expires_at": timezone.now() + timedelta(seconds=settings.ANTICHEAT_PRESIGNED_URL_TTL_SECONDS),
                "interval_seconds": 1,
                "next_seq": start_seq + count,
                "throttle_scope": "exam_anticheat_urls",
                "server_time": timezone.now(),
                "items": items,
            }
        )

    @action(detail=False, methods=['post', 'get'], url_path='events',
            permission_classes=[permissions.IsAuthenticated],
            throttle_classes=[ExamEventsThrottle])
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
        Logs monitored events for in_progress / paused / locked participants.
        """
        contest = get_object_or_404(Contest, id=contest_pk)
        
        # 3-layer permission check (status validated below)
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False, allow_admin_bypass=False
        )
        if error_response:
            return error_response
        
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        if participant.exam_status in self.MONITORED_STATUSES:
            conflict_response = self._ensure_active_device_session(contest, participant, request)
            if conflict_response:
                return conflict_response
        
        serializer = ExamEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        event_type = serializer.validated_data['event_type']
        raw_metadata = serializer.validated_data.get('metadata')
        metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
        upload_session_id = str(metadata.get("upload_session_id") or "").strip() or None
        event_phase = str(metadata.get("phase") or "").upper()
        idempotency_token = str(metadata.get("event_idempotency_key") or "").strip()

        if is_duplicate_exam_event(
            contest_id=contest.id,
            user_id=request.user.id,
            event_type=event_type,
            token=idempotency_token or None,
        ):
            logger.info(
                "anticheat_event_decision contest=%s user=%s event=%s decision=dedupe_hit phase=%s",
                contest.id,
                request.user.id,
                event_type,
                event_phase or "unknown",
            )
            payload = self._build_event_response(participant, contest)
            payload.update(
                {
                    'max_cheat_warnings': contest.max_cheat_warnings,
                    'decision': 'dedupe_hit',
                    'dedupe_hit': True,
                }
            )
            return Response(payload)

        if participant.exam_status == ExamStatus.SUBMITTED:
            ExamEvent.objects.create(
                contest=contest,
                user=request.user,
                event_type=event_type,
                metadata=metadata,
            )
            logger.info(
                "anticheat_event_decision contest=%s user=%s event=%s decision=terminal_guard status=submitted",
                contest.id,
                request.user.id,
                event_type,
            )
            payload = self._build_event_response(participant, contest)
            payload.update(
                {
                    'max_cheat_warnings': contest.max_cheat_warnings,
                    'decision': 'terminal_guard',
                    'dedupe_hit': False,
                }
            )
            return Response(payload)

        if participant.exam_status not in self.MONITORED_STATUSES:
            return Response(
                {'error': f'Exam event is not accepted in current state: {participant.exam_status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        terminal_phase_guard = (
            event_phase in {"TERMINATING", "TERMINAL"}
            and event_type in self.PENALIZED_EVENT_TYPES
        )

        if event_type in self.PENALIZED_EVENT_TYPES and not terminal_phase_guard:
            with transaction.atomic():
                ExamEvent.objects.create(
                    contest=contest,
                    user=request.user,
                    event_type=event_type,
                    metadata=metadata
                )
                participant = ContestParticipant.objects.select_for_update().get(pk=participant.pk)
                participant = self._process_penalized_event(
                    participant=participant,
                    contest=contest,
                    actor=request.user,
                    event_type=event_type,
                    upload_session_id=upload_session_id,
                )
        else:
            ExamEvent.objects.create(
                contest=contest,
                user=request.user,
                event_type=event_type,
                metadata=metadata
            )

        payload = self._build_event_response(participant, contest)
        logger.info(
            "anticheat_event_decision contest=%s user=%s event=%s decision=%s phase=%s",
            contest.id,
            request.user.id,
            event_type,
            'terminal_guard' if terminal_phase_guard else 'accepted',
            event_phase or "unknown",
        )
        payload.update(
            {
                'max_cheat_warnings': contest.max_cheat_warnings,
                'decision': 'terminal_guard' if terminal_phase_guard else 'accepted',
                'dedupe_hit': False,
            }
        )
        return Response(payload)
        
    def _list_events(self, request, contest_pk=None):
        """
        List all events for this contest (Teacher only).
        """
        # Manual permission check since we can't use permission_classes on helper methods
        # and the main action allows all authenticated users (for POST)
        contest = get_object_or_404(Contest, id=contest_pk)
        user = request.user
        
        if not can_manage_contest(user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )

        events = ExamEvent.objects.filter(contest_id=contest_pk).select_related('user').order_by('-created_at')
        return Response(ExamEventSerializer(events, many=True).data)

    @action(detail=False, methods=["get"], url_path="active-sessions")
    def active_sessions(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )

        participants = ContestParticipant.objects.filter(
            contest=contest,
            exam_status__in=[ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER],
        ).select_related("user")
        rows = []
        for participant in participants:
            session_data = get_active_session(contest.id, participant.user_id)
            if not session_data:
                continue
            rows.append(
                {
                    "user_id": participant.user_id,
                    "username": participant.user.username,
                    "exam_status": participant.exam_status,
                    "started_at": participant.started_at,
                    "session": session_data,
                }
            )
        return Response(rows)

    @action(detail=False, methods=["post"], url_path="active-sessions/clear")
    def clear_active_session(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = ActiveSessionClearSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = serializer.validated_data["user_id"]
        clear_active_session(contest.id, user_id)
        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            "update_participant",
            f"Cleared active session for user_id={user_id}",
        )
        return Response({"status": "cleared", "user_id": user_id})

    @action(detail=False, methods=["post"], url_path="takeover-approve")
    def takeover_approve(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = ExamTakeoverApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = serializer.validated_data["user_id"]
        participant = get_object_or_404(ContestParticipant, contest=contest, user_id=user_id)
        if participant.exam_status != ExamStatus.LOCKED_TAKEOVER:
            return Response(
                {"error": "Participant is not in takeover-locked state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant.exam_status = ExamStatus.PAUSED
        participant.lock_reason = ""
        participant.locked_at = None
        participant.save(update_fields=["exam_status", "lock_reason", "locked_at"])
        ExamEvent.objects.create(
            contest=contest,
            user=participant.user,
            event_type="takeover_approved",
            metadata={"approved_by": request.user.id},
        )
        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            "takeover_approve",
            f"Approved takeover for user_id={participant.user_id}",
        )
        return Response({"status": "approved", "exam_status": participant.exam_status})

    @action(detail=False, methods=["get"], url_path="videos")
    def videos(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        qs = ExamEvidenceVideo.objects.filter(contest=contest).select_related(
            "participant__user", "suspected_by"
        )
        user_id = request.query_params.get("user_id")
        if user_id:
            qs = qs.filter(participant__user_id=user_id)
        flagged_only = request.query_params.get("flagged") == "true"
        if flagged_only:
            qs = qs.filter(is_suspected=True)

        jobs_qs = ExamEvidenceJob.objects.filter(contest=contest).select_related("participant__user")
        if user_id:
            jobs_qs = jobs_qs.filter(participant__user_id=user_id)

        jobs_by_key: dict[tuple[int, str], ExamEvidenceJob] = {}
        for job in jobs_qs.order_by("-created_at"):
            key = (job.participant_id, job.upload_session_id or "default")
            jobs_by_key.setdefault(key, job)

        rows: list[dict] = []
        existing_keys: set[tuple[int, str]] = set()
        serialized_videos = ExamEvidenceVideoSerializer(qs, many=True).data
        for row in serialized_videos:
            participant_user_id = int(row.get("participant_user_id"))
            upload_session_id = str(row.get("upload_session_id") or "default")
            key = (participant_user_id, upload_session_id)
            existing_keys.add(key)
            matched_job = jobs_by_key.get(key)

            merged = dict(row)
            merged["has_video"] = True
            merged["job_status"] = matched_job.status if matched_job else "success"
            merged["job_error_message"] = matched_job.error_message if matched_job else ""
            merged["job_raw_count"] = matched_job.raw_count if matched_job else int(row.get("frame_count") or 0)
            merged["job_updated_at"] = (
                matched_job.updated_at.isoformat() if matched_job else row.get("updated_at")
            )
            merged["last_activity_at"] = (
                matched_job.updated_at.isoformat()
                if matched_job
                else str(row.get("updated_at") or row.get("created_at") or "")
            )
            rows.append(merged)

        if not flagged_only:
            for job in jobs_qs.order_by("-created_at"):
                key = (job.participant.user_id, job.upload_session_id or "default")
                if key in existing_keys:
                    continue
                rows.append(
                    {
                        "id": -int(job.id),
                        "participant_user_id": job.participant.user_id,
                        "participant_username": job.participant.user.username,
                        "upload_session_id": job.upload_session_id or "default",
                        "bucket": "",
                        "object_key": "",
                        "duration_seconds": 0,
                        "frame_count": 0,
                        "size_bytes": 0,
                        "is_suspected": False,
                        "suspected_note": "",
                        "suspected_by": None,
                        "suspected_by_username": None,
                        "suspected_at": None,
                        "created_at": job.created_at.isoformat(),
                        "updated_at": job.updated_at.isoformat(),
                        "has_video": False,
                        "job_status": job.status,
                        "job_error_message": job.error_message,
                        "job_raw_count": job.raw_count,
                        "job_updated_at": job.updated_at.isoformat(),
                        "last_activity_at": job.updated_at.isoformat(),
                    }
                )

        rows.sort(
            key=lambda item: str(
                item.get("last_activity_at")
                or item.get("updated_at")
                or item.get("created_at")
                or ""
            ),
            reverse=True,
        )
        return Response(rows)

    @action(detail=False, methods=["get"], url_path=r"videos/(?P<video_id>[^/.]+)/play-url")
    def video_play_url(self, request, contest_pk=None, video_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        video = get_object_or_404(ExamEvidenceVideo, id=video_id, contest=contest)
        url = generate_get_url(video.bucket, video.object_key, expires_seconds=120)
        return Response({"url": url, "expires_in": 120})

    @action(detail=False, methods=["get"], url_path=r"videos/(?P<video_id>[^/.]+)/download-url")
    def video_download_url(self, request, contest_pk=None, video_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        video = get_object_or_404(ExamEvidenceVideo, id=video_id, contest=contest)
        url = generate_get_url(video.bucket, video.object_key, expires_seconds=120)
        return Response({"url": url, "expires_in": 120})

    @action(detail=False, methods=["patch"], url_path=r"videos/(?P<video_id>[^/.]+)/flag")
    def video_flag(self, request, contest_pk=None, video_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        video = get_object_or_404(ExamEvidenceVideo, id=video_id, contest=contest)
        serializer = ExamEvidenceVideoFlagSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        is_suspected = serializer.validated_data["is_suspected"]
        note = serializer.validated_data.get("note", "")
        video.is_suspected = is_suspected
        video.suspected_note = note
        if is_suspected:
            video.suspected_by = request.user
            video.suspected_at = timezone.now()
        else:
            video.suspected_by = None
            video.suspected_at = None
        video.save(update_fields=["is_suspected", "suspected_note", "suspected_by", "suspected_at", "updated_at"])
        return Response(ExamEvidenceVideoSerializer(video).data)


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
    
    def _check_owner_permission(self, contest):
        if not can_manage_contest(self.request.user, contest):
            raise PermissionDenied("Only contest owner or admin can manage announcements")

    def perform_create(self, serializer):
        contest_id = self.kwargs.get('contest_pk')
        contest = get_object_or_404(Contest, id=contest_id)
        self._check_owner_permission(contest)
        user = self.request.user
        serializer.save(created_by=user, contest=contest)
        
        # Log activity
        from .views import ContestActivityViewSet
        ContestActivityViewSet.log_activity(
            contest, 
            user, 
            'announce', 
            f"Posted announcement: {serializer.validated_data.get('title')}"
        )

    def perform_update(self, serializer):
        self._check_owner_permission(serializer.instance.contest)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_owner_permission(instance.contest)
        instance.delete()


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

        # Privileged users (platform_admin / owner / co_owner) can always view problem details
        is_privileged = can_manage_contest(user, contest)

        if not is_privileged:
            # Check if registered
            try:
                participant = ContestParticipant.objects.get(contest=contest, user=user)
            except ContestParticipant.DoesNotExist:
                return Response(
                    {'detail': 'You are not registered for this contest.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Must have started exam to view problems
            if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
                return Response(
                    {'detail': 'You must start the contest to view problems.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Check contest time - only allow access during contest period
            now = timezone.now()
            
            # Block if contest is draft
            if contest.status == 'draft':
                return Response(
                    {'detail': 'Contest is not published.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Block if contest hasn't started
            if contest.start_time and now < contest.start_time:
                return Response(
                    {'detail': 'Contest has not started yet.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Allow read-only access after contest ends

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

        if not can_manage_contest(user, contest):
             return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Use ProblemAdminSerializer to create the problem
        from apps.problems.serializers import ProblemAdminSerializer
        
        # Ensure contest-created problem is not exposed in practice list.
        data = request.data.copy()
        data['visibility'] = 'private'
        
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

        if not can_manage_contest(user, contest):
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


class ContestExamQuestionViewSet(viewsets.ModelViewSet):
    """
    CRUD for exam paper questions.
    - Admin/teacher: full CRUD with correct_answer visible.
    - Registered students: read-only list (correct_answer hidden).
    """

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def _get_contest(self):
        contest_pk = self.kwargs.get('contest_pk')
        return get_object_or_404(Contest, pk=contest_pk)

    def _is_admin(self, contest):
        return can_manage_contest(self.request.user, contest)

    def _ensure_admin_permission(self, contest):
        if not self._is_admin(contest):
            raise PermissionDenied('Only contest owner/admin can manage exam questions')

    def _ensure_not_frozen(self, contest, force=False):
        """檢查考試題目是否已凍結（有學生開始作答後禁止修改/刪除/排序）"""
        if force:
            return
        if contest.has_exam_started():
            return Response(
                {'error': '考試已有學生開始作答，題目已凍結。如需強制修改請加 ?force=true 參數。'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return None

    def get_serializer_class(self):
        contest = self._get_contest()
        if self._is_admin(contest):
            return ExamQuestionSerializer
        return ExamQuestionStudentSerializer

    def get_queryset(self):
        contest = self._get_contest()
        # Students can only list; admin check is enforced per-action for writes
        if not self._is_admin(contest):
            # Students must be registered and have started exam to view questions.
            participant = contest.registrations.filter(user=self.request.user).first()
            if not participant:
                raise PermissionDenied('Not registered for this contest')
            if contest.status != 'published':
                raise PermissionDenied('Contest is not published')
            if contest.start_time and timezone.now() < contest.start_time:
                raise PermissionDenied('Contest has not started yet')
            if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
                raise PermissionDenied('You must start the exam before viewing questions')
        return ExamQuestion.objects.filter(contest=contest).order_by('order', 'id')

    def perform_create(self, serializer):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        if 'order' not in self.request.data:
            last_order = ExamQuestion.objects.filter(contest=contest).aggregate(Max('order'))['order__max']
            serializer.save(contest=contest, order=(last_order if last_order is not None else -1) + 1)
            return

        serializer.save(contest=contest)

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Created exam question #{serializer.instance.id}"
        )

    def perform_update(self, serializer):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        force = self.request.query_params.get('force', '').lower() == 'true'
        frozen_response = self._ensure_not_frozen(contest, force)
        if frozen_response:
            raise PermissionDenied(frozen_response.data['error'])
        serializer.save()

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Updated exam question #{serializer.instance.id}" + (" (force)" if force else "")
        )

    def perform_destroy(self, instance):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        force = self.request.query_params.get('force', '').lower() == 'true'
        frozen_response = self._ensure_not_frozen(contest, force)
        if frozen_response:
            raise PermissionDenied(frozen_response.data['error'])
        question_id = instance.id
        instance.delete()

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Deleted exam question #{question_id}" + (" (force)" if force else "")
        )

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request, contest_pk=None):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        force = request.query_params.get('force', '').lower() == 'true'
        frozen_response = self._ensure_not_frozen(contest, force)
        if frozen_response:
            return frozen_response

        orders = request.data.get('orders', [])
        if not isinstance(orders, list) or not orders:
            return Response({'error': 'No orders provided'}, status=status.HTTP_400_BAD_REQUEST)

        for item in orders:
            question_id = item.get('id')
            new_order = item.get('order')
            if question_id is None or new_order is None:
                continue
            ExamQuestion.objects.filter(contest=contest, id=question_id).update(order=new_order)

        questions = ExamQuestion.objects.filter(contest=contest).order_by('order', 'id')
        for idx, question in enumerate(questions):
            if question.order != idx:
                question.order = idx
                question.save(update_fields=['order'])

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            "Reordered exam questions"
        )

        serialized = self.get_serializer(
            ExamQuestion.objects.filter(contest=contest).order_by('order', 'id'),
            many=True
        )
        return Response(serialized.data)

    @action(detail=False, methods=["get"], url_path="export-paper")
    def export_paper(self, request, contest_pk=None):
        """
        Export formal paper-exam PDF from backend.
        mode=question | answer
        """
        contest = self._get_contest()
        self._ensure_admin_permission(contest)

        mode = request.query_params.get("mode", "question")
        language = request.query_params.get("language", "zh-TW")
        scale = parse_scale(request.query_params.get("scale", "1.0"))

        try:
            return build_paper_exam_sheet_response(
                contest=contest,
                mode=mode,
                language=language,
                scale=scale,
            )
        except ExportValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Failed to generate paper exam sheet: %s", exc)
            return Response(
                {"error": "Failed to generate paper exam sheet"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ContestActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing contest activities.
    Only accessible by admins and teachers.
    """
    serializer_class = ContestActivitySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None  # Return all activities without pagination (admin-only API)
    
    def get_queryset(self):
        contest_pk = self.kwargs.get('contest_pk')
        user = self.request.user
        contest = get_object_or_404(Contest, pk=contest_pk)
        
        if not can_manage_contest(user, contest):
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


class ExamAnswerViewSet(viewsets.GenericViewSet):
    """
    ViewSet for exam answer operations.
    Students submit/retrieve answers; TAs grade answers and view results.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_contest(self, contest_pk):
        return get_object_or_404(Contest, pk=contest_pk)

    # ── Student endpoints ──

    @action(detail=False, methods=['post'], url_path='submit')
    def submit_answer(self, request, contest_pk=None):
        """Submit or update a single answer (auto-save)."""
        contest = self._get_contest(contest_pk)
        participant, error = validate_exam_operation(
            contest, request.user, require_in_progress=True
        )
        if error:
            return error

        serializer = ExamAnswerSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question_id = serializer.validated_data['question_id']
        try:
            question = ExamQuestion.objects.get(
                id=question_id, contest=contest
            )
        except ExamQuestion.DoesNotExist:
            return Response(
                {'error': 'Question not found in this contest.'},
                status=status.HTTP_404_NOT_FOUND
            )

        answer_obj, created = ExamAnswer.objects.update_or_create(
            participant=participant,
            question=question,
            defaults={'answer': serializer.validated_data['answer']}
        )
        # 首次建立時記錄題目快照（後續更新答案不覆蓋快照）
        if created:
            answer_obj.question_snapshot = question.to_snapshot()
        # Auto-grade objective questions
        answer_obj.auto_grade()
        answer_obj.save()

        return Response(
            ExamAnswerSerializer(answer_obj).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], url_path='my-answers')
    def my_answers(self, request, contest_pk=None):
        """Get all answers for the current student in this contest."""
        contest = self._get_contest(contest_pk)
        participant, error = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error:
            return error
        if participant is None:
            return Response(
                {'error': 'Not registered for this contest.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        answers = ExamAnswer.objects.filter(
            participant=participant
        ).select_related('question')
        return Response(ExamAnswerSerializer(answers, many=True).data)

    @action(detail=False, methods=['get'], url_path='results')
    def results(self, request, contest_pk=None):
        """Get graded results (only when results are published)."""
        contest = self._get_contest(contest_pk)

        # Check if results are published
        if not contest.results_published:
            if not can_manage_contest(request.user, contest):
                return Response(
                    {'error': 'Results have not been published yet.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        try:
            participant = ContestParticipant.objects.get(
                contest=contest, user=request.user
            )
        except ContestParticipant.DoesNotExist:
            return Response(
                {'error': 'Not registered for this contest.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        answers = ExamAnswer.objects.filter(
            participant=participant
        ).select_related('question', 'graded_by')
        return Response(ExamAnswerDetailSerializer(answers, many=True).data)

    # ── TA/Admin endpoints ──

    @action(detail=False, methods=['get'], url_path='all-answers')
    def all_answers(self, request, contest_pk=None):
        """List all answers for all students (TA/admin only)."""
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can view all answers.')

        answers = ExamAnswer.objects.filter(
            participant__contest=contest
        ).select_related('participant__user', 'question', 'graded_by')

        # Optional filter by participant (supports both participant_id and user_id)
        participant_id = request.query_params.get('participant_id')
        user_id = request.query_params.get('user_id')
        if participant_id:
            answers = answers.filter(participant_id=participant_id)
        elif user_id:
            answers = answers.filter(participant__user_id=user_id)

        return Response(ExamAnswerDetailSerializer(answers, many=True).data)

    @action(detail=True, methods=['post'], url_path='grade')
    def grade_answer(self, request, contest_pk=None, pk=None):
        """Grade a single answer (TA/admin only)."""
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can grade answers.')

        answer_obj = get_object_or_404(
            ExamAnswer.objects.filter(participant__contest=contest),
            pk=pk
        )

        serializer = ExamAnswerGradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answer_obj.score = serializer.validated_data['score']
        answer_obj.feedback = serializer.validated_data.get('feedback', '')
        answer_obj.graded_by = request.user
        answer_obj.graded_at = timezone.now()
        answer_obj.is_correct = answer_obj.score > 0
        answer_obj.save()

        # Update participant total score
        total = ExamAnswer.objects.filter(
            participant=answer_obj.participant,
            score__isnull=False
        ).aggregate(total=Sum('score'))['total'] or 0
        rounded_total = Decimal(total).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        answer_obj.participant.score = int(rounded_total)
        answer_obj.participant.save(update_fields=['score'])

        return Response(ExamAnswerDetailSerializer(answer_obj).data)
