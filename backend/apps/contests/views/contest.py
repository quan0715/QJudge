"""ContestViewSet — main CRUD + admin operations."""
import csv
import logging

from django.db.models import Max
from django.utils import timezone
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from ..access_policy import ContestAccessPolicy
from ..models import (
    Contest,
    ContestParticipant,
    ContestProblem,
    ExamStatus,
)
from ..serializers import (
    ContestListSerializer,
    ContestDetailSerializer,
    ContestCreateUpdateSerializer,
    ContestParticipantSerializer,
)
from ..permissions import (
    IsContestOwnerOrAdmin,
    IsContestLifecycleOwner,
    can_manage_contest,
)
from ..services.export_service import (
    ExportValidationError,
    build_contest_download_response,
    build_student_report_response,
    parse_scale,
)
from ..services.participant_state import (
    admin_update_participant,
    reconcile_participant_on_contest_access,
    reopen_participant_exam,
    unlock_participant as unlock_contest_participant,
)
from ..services.scoreboard import ScoreboardScope, ScoreboardService
from .activity import ContestActivityViewSet
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
            return queryset.select_related("owner").prefetch_related("admins")

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

        if user.is_authenticated:
            try:
                participant = ContestParticipant.objects.get(contest=instance, user=user)
                reconcile_participant_on_contest_access(
                    participant,
                    activity_user=user,
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
            "Archived contest"
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
            unlock_contest_participant(
                participant,
                activity_user=request.user,
                activity_details=f"Unlocked participant {participant.user.username}",
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

            admin_update_participant(
                participant,
                exam_status=request.data.get('exam_status'),
                lock_reason=request.data.get('lock_reason'),
                activity_user=request.user,
                activity_details=f"Updated participant {participant.user.username}: {request.data}",
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

            reopen_participant_exam(
                participant,
                activity_user=request.user,
                activity_details=f"Reopened exam for {participant.user.username}",
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
            "Registered for contest"
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
            "Entered contest"
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
                    "Left contest"
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
        last_order = ContestProblem.objects.filter(contest=contest).aggregate(Max('order'))['order__max']
        new_order = (last_order if last_order is not None else -1) + 1

        # Generate label (A, B, C...)
        ContestProblem.objects.create(
            contest=contest,
            problem=problem,
            order=new_order,
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
        if not ContestParticipant.objects.filter(contest=contest, user=target_user).exists():
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
