"""ContestViewSet — main CRUD + admin operations."""
import csv
import logging
from uuid import UUID

from django.db import transaction
from django.db.models import Max, Sum
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.core.cache import cache
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from ..access_policy import ContestAccessPolicy
from ..models import (
    AssignmentState,
    Contest,
    ContestParticipant,
    ContestProblem,
    ExamEvidenceJob,
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
    build_paper_exam_results_csv_response,
    build_student_report_response,
    build_contest_results_csv_response,
    parse_scale,
)
from ..services.participant_state import (
    ACTIVE_EXAM_STATUSES,
    admin_update_participant,
    reconcile_participant_on_contest_access,
    reopen_participant_exam,
    unlock_participant as unlock_contest_participant,
)
from ..services.anti_cheat_session import get_active_session, get_last_heartbeat
from ..services.participant_dashboard import build_participant_dashboard
from ..services.anticheat_config import build_contest_anticheat_config
from ..services.detail_cache import (
    bump_contest_detail_cache_version,
    get_contest_detail_cache_key,
)
from ..services.scoreboard import ScoreboardScope, ScoreboardService
from ..services.question_edit_lock import ensure_contest_question_editable
from .activity import ContestActivityViewSet
from apps.problems.services import ProblemService
from apps.problems.models import Problem
from apps.problems.serializers import ProblemAdminSerializer
from apps.question_bank.models import Question, QuestionBank
from apps.question_bank.question_assets import (
    ensure_question_asset_for_bank_question,
)
from apps.question_bank.bank_workflows import is_publicly_accessible_bank
from apps.classrooms.permissions import get_user_role_in_classroom

logger = logging.getLogger(__name__)
CONTEST_DETAIL_CACHE_TTL_SECONDS = 2
ANTICHEAT_CONFIG_CACHE_TTL_SECONDS = 30


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

    @staticmethod
    def _normalize_uuid(value, *, field_name: str) -> str:
        try:
            return str(UUID(str(value)))
        except (TypeError, ValueError):
            raise DRFValidationError({field_name: "Must be a valid UUID."})

    @staticmethod
    def _resolve_problem(identifier):
        if identifier in (None, ""):
            return None
        try:
            normalized_uuid = str(UUID(str(identifier)))
        except (TypeError, ValueError):
            return None
        if normalized_uuid:
            return Problem.objects.filter(id=normalized_uuid).first()
        return None

    def _resolve_exam_window_status(self, contest: Contest, now):
        if contest.status == "archived":
            return "ended"
        if contest.status != "published":
            return "upcoming"
        if contest.end_time and now >= contest.end_time:
            return "ended"
        if contest.start_time and now < contest.start_time:
            return "upcoming"
        return "running"

    @staticmethod
    def _is_classroom_managed_contest(contest: Contest) -> bool:
        return contest.classroom_bindings.exists()

    def _classroom_managed_response(self):
        return Response(
            {
                "error": {
                    "code": "contest_managed_by_classroom",
                    "message": "This contest is managed by a classroom. Update members in classroom.",
                    "type": "permission_denied",
                }
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    @staticmethod
    def _get_primary_bound_classroom(contest: Contest):
        binding = (
            contest.classroom_bindings.select_related("classroom")
            .order_by("bound_at")
            .first()
        )
        return binding.classroom if binding is not None else None

    def _ensure_classroom_bound_participant(self, contest: Contest, user):
        """
        Classroom-bound contests must source student participation from classroom
        membership. Managers do not register separately.
        """
        classroom = self._get_primary_bound_classroom(contest)
        if classroom is None:
            return None, False, None

        classroom_role = get_user_role_in_classroom(user, classroom)
        if classroom_role is None:
            return None, False, Response(
                {"message": "Join the classroom before joining this contest"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if classroom_role in {"platform_admin", "owner", "manager"}:
            return None, False, Response(
                {"message": "Classroom managers do not register separately"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant, created = ContestParticipant.objects.get_or_create(
            contest=contest,
            user=user,
            defaults={
                "assignment_state": (
                    AssignmentState.UNACCEPTED
                    if contest.delivery_mode == "practice"
                    else AssignmentState.ACCEPTED
                ),
                "nickname": user.username,
            },
        )
        return participant, created, None

    def _build_time_progress(self, contest: Contest, now):
        start_time = contest.start_time
        end_time = contest.end_time

        if not start_time or not end_time or end_time <= start_time:
            return {
                "total_seconds": 0,
                "elapsed_seconds": 0,
                "remaining_seconds": 0,
                "progress_percent": 0,
                "is_started": False,
                "is_ended": False,
            }

        total_seconds = max(0, int((end_time - start_time).total_seconds()))
        elapsed_seconds = int((now - start_time).total_seconds())
        elapsed_seconds = min(max(elapsed_seconds, 0), total_seconds)
        remaining_seconds = max(total_seconds - elapsed_seconds, 0)
        progress_percent = (
            round((elapsed_seconds / total_seconds) * 100, 2)
            if total_seconds > 0
            else 0
        )

        return {
            "total_seconds": total_seconds,
            "elapsed_seconds": elapsed_seconds,
            "remaining_seconds": remaining_seconds,
            "progress_percent": progress_percent,
            "is_started": now >= start_time,
            "is_ended": now >= end_time,
        }

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

        if self.action in ['update', 'partial_update']:
            return ContestCreateUpdateSerializer

        return ContestDetailSerializer

    def handle_exception(self, exc) -> Response:
        from rest_framework.exceptions import NotAuthenticated, PermissionDenied

        if isinstance(exc, (NotAuthenticated, PermissionDenied)):
            error_response = getattr(self.request, "_permission_error", None)
            if error_response is not None:
                return error_response

        return super().handle_exception(exc)

    def create(self, request, *args, **kwargs):
        return Response(
            {
                "detail": (
                    "Standalone contest creation is disabled. "
                    "Create contests from a classroom."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def perform_update(self, serializer):
        """
        Override to log contest update activity.
        """
        instance = serializer.save()
        bump_contest_detail_cache_version(instance.id)
        cache.delete(f"contest_anticheat_config:{instance.id}")

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
        user_cache_key = user.id if user.is_authenticated else "anon"
        cache_key = get_contest_detail_cache_key(instance.id, str(user_cache_key))

        if user.is_authenticated:
            try:
                participant = ContestParticipant.objects.get(contest=instance, user=user)
                reconcile_participant_on_contest_access(
                    participant,
                    activity_user=user,
                )
            except ContestParticipant.DoesNotExist:
                pass

        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        serializer = self.get_serializer(instance)
        payload = serializer.data
        cache.set(cache_key, payload, timeout=CONTEST_DETAIL_CACHE_TTL_SECONDS)
        return Response(payload)

    @action(
        detail=True,
        methods=['get'],
        permission_classes=[permissions.IsAuthenticated, ContestAccessPolicy],
        url_path='anticheat-config',
    )
    def anticheat_config(self, request, pk=None):
        """Return frontend anti-cheat runtime config for this contest."""
        contest = self.get_object()
        cache_key = f"contest_anticheat_config:{contest.id}"
        payload = cache.get(cache_key)
        if payload is None:
            payload = build_contest_anticheat_config(contest)
            cache.set(cache_key, payload, timeout=ANTICHEAT_CONFIG_CACHE_TTL_SECONDS)
        return Response(payload)

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
        if self._is_classroom_managed_contest(contest):
            return self._classroom_managed_response()
        admins = contest.admins.all()
        return Response([{'id': u.id, 'username': u.username} for u in admins])

    @action(detail=True, methods=['post'], permission_classes=[IsContestLifecycleOwner], url_path='add_admin')
    def add_admin(self, request, pk=None):
        """
        Add a user as co-admin for this contest.
        Only owner (or platform admin) can add co-admins.
        """
        contest = self.get_object()
        if self._is_classroom_managed_contest(contest):
            return self._classroom_managed_response()

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
        if self._is_classroom_managed_contest(contest):
            return self._classroom_managed_response()

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
        Includes total_score_annotated to avoid N+1 queries.
        """
        from django.db.models import Max, Sum
        from apps.submissions.models import Submission

        contest = self.get_object()

        # Query 1: All participants
        participants = list(
            ContestParticipant.objects.filter(contest=contest)
            .select_related('user', 'user__profile')
        )

        if contest.contest_type == 'paper_exam':
            # Paper exam: sum ExamAnswer scores per participant
            from apps.contests.models import ExamAnswer
            answer_totals = (
                ExamAnswer.objects
                .filter(participant__contest=contest, score__isnull=False)
                .values('participant__user_id')
                .annotate(total=Sum('score'))
            )
            user_totals: dict = {
                row['participant__user_id']: float(row['total'] or 0)
                for row in answer_totals
            }
        else:
            # Coding contest: best submission score per (user, problem)
            best_scores = Submission.objects.filter(
                contest=contest,
                source_type='contest',
                is_test=False,
            ).values('user_id', 'problem_id').annotate(best=Max('score'))

            user_totals = {}
            for row in best_scores:
                uid = row['user_id']
                user_totals[uid] = user_totals.get(uid, 0) + (row['best'] or 0)

        for p in participants:
            p.total_score_annotated = user_totals.get(p.user_id, 0)

        serializer = ContestParticipantSerializer(participants, many=True)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=['get'],
        permission_classes=[IsContestOwnerOrAdmin],
        url_path='overview-metrics',
    )
    def overview_metrics(self, request, pk=None):
        contest = self.get_object()
        now = timezone.now()
        heartbeat_threshold = now - timezone.timedelta(seconds=90)

        user_ids = list(
            ContestParticipant.objects.filter(
                contest=contest,
                exam_status__in=ACTIVE_EXAM_STATUSES,
            )
            .values_list("user_id", flat=True)
            .distinct()
        )

        online_now = 0
        online_active_sessions = 0
        for user_id in user_ids:
            heartbeat_raw = get_last_heartbeat(contest.id, user_id)
            if heartbeat_raw:
                heartbeat_at = parse_datetime(heartbeat_raw)
                if heartbeat_at and timezone.is_naive(heartbeat_at):
                    heartbeat_at = timezone.make_aware(
                        heartbeat_at,
                        timezone.get_current_timezone(),
                    )
                if heartbeat_at and heartbeat_at >= heartbeat_threshold:
                    online_now += 1

            if get_active_session(contest.id, user_id):
                online_active_sessions += 1

        exam_status = self._resolve_exam_window_status(contest, now)
        return Response(
            {
                "online_now": online_now,
                "online_active_sessions": online_active_sessions,
                "exam": {
                    "status": exam_status,
                    "contest_type": contest.contest_type,
                },
                "time_progress": self._build_time_progress(contest, now),
            }
        )

    @action(
        detail=True,
        methods=['get'],
        permission_classes=[IsContestOwnerOrAdmin],
        url_path=r'participants/(?P<user_id>\d+)/dashboard',
    )
    def participant_dashboard(self, request, pk=None, user_id=None):
        """Return the admin dashboard payload for a single participant."""
        contest = self.get_object()
        try:
            participant = ContestParticipant.objects.select_related(
                'user',
                'user__profile',
                'contest',
            ).get(contest=contest, user_id=user_id)
        except ContestParticipant.DoesNotExist:
            return Response(
                {'error': 'Participant not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(build_participant_dashboard(contest, participant))

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
        if self._is_classroom_managed_contest(contest):
            return self._classroom_managed_response()
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
        if self._is_classroom_managed_contest(contest):
            return self._classroom_managed_response()
        user_id = request.data.get('user_id')

        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            participant = ContestParticipant.objects.get(contest=contest, user_id=user_id)
        except ContestParticipant.DoesNotExist:
            return Response({'error': 'Participant not found'}, status=status.HTTP_404_NOT_FOUND)

        username = participant.user.username

        # Block removal if participant has evidence data (screenshots/videos)
        has_evidence = ExamEvidenceJob.objects.filter(participant=participant).exists()
        if has_evidence:
            return Response(
                {
                    'error': (
                        f'Cannot remove participant {username}: '
                        'exam evidence data exists. '
                        'Delete evidence first or use the evidence management API.'
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

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

        if self._is_classroom_managed_contest(contest):
            participant, created, error_response = self._ensure_classroom_bound_participant(
                contest, user,
            )
            if error_response is not None:
                return error_response
            if participant.nickname != user.username and not participant.nickname:
                participant.nickname = user.username
                participant.save(update_fields=["nickname"])
            if not created:
                return Response({'message': 'Already registered'}, status=status.HTTP_400_BAD_REQUEST)
            ContestActivityViewSet.log_activity(
                contest,
                request.user,
                'register',
                "Registered for contest via classroom membership"
            )
            return Response(
                {'message': 'Successfully registered'},
                status=status.HTTP_201_CREATED
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

        if self._is_classroom_managed_contest(contest):
            _, _, error_response = self._ensure_classroom_bound_participant(contest, user)
            if error_response is not None:
                return error_response

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

    def _get_default_problem_max_score(self, problem: Problem) -> int:
        score_sum = (
            problem.test_cases.aggregate(total=Sum('score')).get('total')
            or 0
        )
        return max(1, int(score_sum or 100))

    def _resolve_bank_question_for_import(self, *, user, question_bank_id, question_id):
        try:
            normalized_bank_uuid = self._normalize_uuid(
                question_bank_id, field_name="question_bank_id"
            )
        except DRFValidationError as exc:
            return None, None, Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        bank = QuestionBank.objects.filter(uuid=normalized_bank_uuid, is_archived=False).first()
        if not bank:
            return None, None, Response({'error': 'Question bank not found'}, status=status.HTTP_404_NOT_FOUND)

        if bank.owner_id != user.id and not is_publicly_accessible_bank(bank):
            return None, None, Response({'error': 'No access to this question bank'}, status=status.HTTP_403_FORBIDDEN)

        try:
            normalized_question_uuid = self._normalize_uuid(
                question_id, field_name="question_id"
            )
        except DRFValidationError as exc:
            return None, None, Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        # Primary lookup: QuestionBankMembership (bank_item_id from frontend)
        from apps.question_bank.models import QuestionBankMembership
        from apps.question_bank.write_workflows import materialize_bank_question_adapter_for_membership

        membership = (
            QuestionBankMembership.objects.filter(
                bank=bank, id=normalized_question_uuid,
            )
            .select_related("question_asset", "question_asset__latest_version", "legacy_question")
            .first()
        )

        if membership:
            if membership.legacy_question_id:
                question = membership.legacy_question
            else:
                # Materialize adapter on demand (will be eliminated when Question is fully retired)
                question = materialize_bank_question_adapter_for_membership(
                    membership=membership, actor=user,
                )
        else:
            # Legacy fallback: direct Question ID (old frontend may still send this)
            question = Question.objects.filter(bank=bank, id=normalized_question_uuid).first()

        if not question:
            return None, None, Response({'error': 'Question not found in bank'}, status=status.HTTP_404_NOT_FOUND)

        if question.question_type != Question.QuestionType.CODING:
            return None, None, Response({'error': 'Only coding bank questions can be imported here'}, status=status.HTTP_400_BAD_REQUEST)

        return bank, question, None

    def _materialize_problem_from_bank_question(self, *, contest: Contest, question: Question, user, request):
        def _normalize_weights(cases):
            if not cases:
                return
            raw_weights = [max(0, int(case.get('weight_percent', 0) or 0)) for case in cases]
            total = sum(raw_weights)
            if total == 100:
                return
            if total <= 0:
                base = 100 // len(cases)
                remainder = 100 % len(cases)
                for idx, case in enumerate(cases):
                    weight = base + (1 if idx < remainder else 0)
                    case['weight_percent'] = weight
                    case['score'] = weight
                return

            scaled = []
            for weight in raw_weights:
                scaled.append((weight * 100) / total)
            floor_values = [int(value) for value in scaled]
            remainder = 100 - sum(floor_values)
            fractions = sorted(
                enumerate(value - int(value) for value in scaled),
                key=lambda item: item[1],
                reverse=True,
            )
            for idx in range(remainder):
                floor_values[fractions[idx][0]] += 1

            for idx, case in enumerate(cases):
                case['weight_percent'] = floor_values[idx]
                case['score'] = floor_values[idx]

        coding_ext = getattr(question, "coding_ext", None)
        translations = []
        test_cases = []
        language_configs = []
        forbidden_keywords = []
        required_keywords = []

        if coding_ext:
            translations = coding_ext.translations or []
            for idx, raw_tc in enumerate(coding_ext.test_cases or []):
                tc = dict(raw_tc or {})
                weight_percent = tc.get('weight_percent')
                if weight_percent is None:
                    weight_percent = tc.get('score', 0)
                try:
                    normalized_weight = int(weight_percent)
                except (TypeError, ValueError):
                    normalized_weight = 0
                test_cases.append(
                    {
                        'input_data': tc.get('input_data', ''),
                        'output_data': tc.get('output_data', ''),
                        'is_sample': bool(tc.get('is_sample', False)),
                        'score': normalized_weight,
                        'weight_percent': normalized_weight,
                        'order': int(tc.get('order', idx)),
                        'is_hidden': bool(tc.get('is_hidden', False)),
                    }
                )
            language_configs = coding_ext.language_configs or []
            forbidden_keywords = coding_ext.forbidden_keywords or []
            required_keywords = coding_ext.required_keywords or []

        if not translations:
            translations = [
                {
                    'language': 'zh-TW',
                    'title': question.title or 'Imported Problem',
                    'description': question.prompt or '',
                    'input_description': '',
                    'output_description': '',
                    'hint': '',
                }
            ]

        if not test_cases:
            # Safety fallback for bank entries without coding extension.
            test_cases = [
                {
                    'input_data': '',
                    'output_data': '',
                    'is_sample': True,
                    'score': 100,
                    'weight_percent': 100,
                    'order': 0,
                    'is_hidden': False,
                }
            ]
        else:
            _normalize_weights(test_cases)

        payload = {
            'title': question.title or 'Imported Problem',
            'difficulty': question.difficulty or 'medium',
            'time_limit': question.time_limit or 1000,
            'memory_limit': question.memory_limit or 128,
            'translations': translations,
            'test_cases': test_cases,
            'language_configs': language_configs,
            'forbidden_keywords': forbidden_keywords,
            'required_keywords': required_keywords,
        }

        serializer = ProblemAdminSerializer(data=payload, context={'request': request})
        serializer.is_valid(raise_exception=True)
        problem = serializer.save(
            created_by=user,
        )
        question_asset, question_version = ensure_question_asset_for_bank_question(
            question=question,
            actor=user,
        )
        problem.question_asset = question_asset
        problem.question_version = question_version
        problem.save(update_fields=['question_asset', 'question_version', 'updated_at'])
        return problem

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin])
    def add_problem(self, request, pk=None):
        """
        Add a problem to the contest.
        Supports:
        - legacy: existing problem (problem_id) or new blank problem (title)
        - question bank import: question_bank_id + question_id (legacy import_mode ignored; fixed copy strategy)
        """
        contest = self.get_object()
        user = request.user
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(user, "id", None),
            action="contest.add_problem",
        )

        problem_id = request.data.get('problem_id')
        title = request.data.get('title')
        question_bank_id = request.data.get('question_bank_id')
        question_id = request.data.get('question_id')
        requested_max_score = request.data.get('max_score')

        source_bank_id = None
        source_bank_name = ""
        source_question_id = None
        source_mode = "manual"

        try:
            with transaction.atomic():
                if question_bank_id and question_id:
                    bank, bank_question, error_response = self._resolve_bank_question_for_import(
                        user=user,
                        question_bank_id=question_bank_id,
                        question_id=question_id,
                    )
                    if error_response:
                        return error_response

                    source_bank_id = bank.uuid
                    source_bank_name = bank.name
                    source_question_id = bank_question.id
                    source_mode = "copy"

                    problem = self._materialize_problem_from_bank_question(
                        contest=contest,
                        question=bank_question,
                        user=user,
                        request=request,
                    )
                elif problem_id:
                    normalized_problem_id = self._normalize_uuid(
                        problem_id, field_name="problem_id"
                    )
                    source_problem = self._resolve_problem(normalized_problem_id)
                    if not source_problem:
                        return Response({'error': 'Problem not found'}, status=status.HTTP_404_NOT_FOUND)
                    problem = ProblemService.clone_problem(source_problem, contest, user)
                elif title:
                    problem = ProblemService.create_contest_problem(contest, user, title=title)
                else:
                    return Response(
                        {'error': 'Either problem_id/title or question_bank_id/question_id is required'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                from apps.question_bank.models import ContestQuestionBinding, QuestionAsset

                # Ensure asset exists
                if not problem.question_asset_id:
                    from apps.question_bank.question_assets import sync_problem_question_asset
                    sync_problem_question_asset(problem=problem, actor=user)
                    problem.refresh_from_db(fields=["question_asset", "question_version"])

                # Determine order
                last_order = (
                    ContestQuestionBinding.objects.filter(
                        contest=contest, binding_type=QuestionAsset.AssetType.CODING,
                    ).aggregate(max_order=Max('order'))['max_order']
                )
                new_order = (last_order if last_order is not None else -1) + 1

                default_max_score = self._get_default_problem_max_score(problem)
                max_score = default_max_score
                if requested_max_score is not None:
                    try:
                        max_score = max(1, int(requested_max_score))
                    except (TypeError, ValueError):
                        return Response({'error': 'max_score must be a positive integer'}, status=status.HTTP_400_BAD_REQUEST)

                # Primary write: ContestQuestionBinding
                binding = ContestQuestionBinding.objects.create(
                    contest=contest,
                    question_asset=problem.question_asset,
                    question_version=problem.question_version,
                    coding_problem=problem,
                    binding_type=QuestionAsset.AssetType.CODING,
                    order=new_order,
                    score=max_score,
                    source_bank_id=source_bank_id,
                    source_bank_name=source_bank_name,
                    source_question_id=source_question_id,
                    source_mode=source_mode,
                    created_by=user,
                )

                # Backward-compat: ContestProblem (skip auto binding sync)
                cp = ContestProblem(
                    contest=contest,
                    problem=problem,
                    order=new_order,
                    max_score=max_score,
                    question_asset=problem.question_asset,
                    question_version=problem.question_version,
                    source_bank_id=source_bank_id,
                    source_bank_name=source_bank_name,
                    source_question_id=source_question_id,
                    source_mode=source_mode,
                )
                cp._skip_binding_sync = True
                cp.save()
                binding.legacy_contest_problem = cp
                binding.save(update_fields=['legacy_contest_problem', 'updated_at'])
        except DRFValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Failed to add contest problem from payload: %s", exc)
            return Response({'error': 'Failed to add problem'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        from apps.problems.serializers import ProblemListSerializer
        serializer = ProblemListSerializer(problem, context={'request': request})
        # Log activity
        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'add_problem',
            f"Added problem {problem.title or problem.id} to contest"
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
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, "id", None),
            action="contest.reorder_problems",
        )
        orders = request.data.get('orders', [])

        if not orders:
            return Response({'error': 'No orders provided'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.question_bank.models import ContestQuestionBinding, QuestionAsset

        import uuid as _uuid

        # 1. Update orders on bindings (accepts both binding UUIDs and legacy ContestProblem int IDs)
        for item in orders:
            item_id = item.get('id')
            new_order = item.get('order')
            if item_id is None or new_order is None:
                continue
            item_str = str(item_id)
            is_uuid = False
            try:
                _uuid.UUID(item_str)
                is_uuid = True
            except (ValueError, AttributeError):
                pass

            if is_uuid:
                updated = ContestQuestionBinding.objects.filter(
                    contest=contest, id=item_str,
                ).update(order=new_order)
                if not updated:
                    ContestQuestionBinding.objects.filter(
                        contest=contest, coding_problem_id=item_str,
                    ).update(order=new_order)
            elif item_str.isdigit():
                ContestQuestionBinding.objects.filter(
                    contest=contest, legacy_contest_problem_id=int(item_str),
                ).update(order=new_order)

        # 2. Normalize to sequential 0, 1, 2... and sync back to ContestProblem
        bindings = ContestQuestionBinding.objects.filter(
            contest=contest, binding_type=QuestionAsset.AssetType.CODING,
        ).order_by('order', 'created_at')
        for i, b in enumerate(bindings):
            if b.order != i:
                b.order = i
                b.save(update_fields=['order', 'updated_at'])
            # Always sync ContestProblem order
            if b.legacy_contest_problem_id:
                ContestProblem.objects.filter(pk=b.legacy_contest_problem_id).update(order=i)

        return Response({'status': 'reordered'})

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
        contest = self.get_object()

        if contest.contest_type == 'paper_exam':
            return build_paper_exam_results_csv_response(contest)

        result = ScoreboardService.calculate(
            contest,
            ScoreboardScope(viewer=request.user, mode="export"),
        )

        return build_contest_results_csv_response(contest, result)

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
                include_grading=contest.report_includes_grading,
            )

        except Exception as e:
            logger.exception("Failed to generate personal report: %s", e)
            return Response(
                {'error': 'Failed to generate report'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
