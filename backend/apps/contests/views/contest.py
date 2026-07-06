"""ContestViewSet — main CRUD + admin operations."""
import logging

from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError as DRFValidationError
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from ..access_policy import ContestAccessPolicy
from ..models import (
    AssignmentState,
    Contest,
    ContestParticipant,
    ExamEvent,
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
    IsTeacherOrAdmin,
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
from ..services.anticheat_storage import build_raw_object_key, build_upload_session_id, generate_put_url, get_s3_client
from ..services.scoreboard import ScoreboardScope, ScoreboardService
from ..services.activity_log import log_contest_activity
from .attendance import AttendanceMixin
from apps.classrooms.permissions import get_user_role_in_classroom

logger = logging.getLogger(__name__)
ANTICHEAT_CONFIG_CACHE_TTL_SECONDS = 30
MANUAL_PROCTOR_EVENT_TYPE = "manual_proctor_note"


def _parse_manual_event_datetime(value, *, field_name: str):
    parsed = parse_datetime(str(value or ""))
    if parsed is None:
        raise DRFValidationError({field_name: "Invalid datetime."})
    if parsed.tzinfo is None:
        parsed = timezone.make_aware(parsed)
    return parsed


def _parse_required_user_id(value):
    try:
        user_id = int(str(value or "").strip())
    except (TypeError, ValueError):
        raise DRFValidationError({"user_id": "Invalid user_id."})
    if user_id <= 0:
        raise DRFValidationError({"user_id": "Invalid user_id."})
    return user_id


class ContestViewSet(AttendanceMixin, viewsets.ModelViewSet):
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

    def get_permissions(self):
        if self.action == "create":
            return [permissions.IsAuthenticated(), IsTeacherOrAdmin()]
        return [permission() for permission in self.permission_classes]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

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
    def _contest_requires_classroom_binding_response():
        return Response(
            {
                "error": {
                    "code": "contest_requires_classroom_binding",
                    "message": "This contest must be bound to a classroom.",
                    "type": "validation_error",
                }
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    def _classroom_roster_admin_gate(self, contest: Contest):
        """
        Co-admin and manual roster endpoints are disabled for classroom-bound contests;
        unbound contests are invalid in production — return a dedicated error.
        """
        if not self._is_classroom_managed_contest(contest):
            return self._contest_requires_classroom_binding_response()
        return self._classroom_managed_response()

    @classmethod
    def _assert_user_in_bound_classroom(cls, contest: Contest, user):
        classroom = cls._get_primary_bound_classroom(contest)
        if classroom is None:
            return Response(
                {"message": "Contest has no primary classroom binding."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        if get_user_role_in_classroom(user, classroom) is None:
            return Response(
                {"message": "Join the classroom before joining this contest"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

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
        membership. Managers and contest staff may still self-register.
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

        participant, created = ContestParticipant.objects.get_or_create(
            contest=contest,
            user=user,
            defaults={
                "assignment_state": (
                    AssignmentState.UNACCEPTED
                    if contest.delivery_mode == "practice"
                    else AssignmentState.ACCEPTED
                ),
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

    def perform_update(self, serializer):
        """
        Override to log contest update activity.
        """
        instance = serializer.save()
        cache.delete(f"contest_anticheat_config:{instance.id}")

        # Log activity - record what fields were changed
        changed_fields = []
        for field, value in serializer.validated_data.items():
            changed_fields.append(field)

        log_contest_activity(
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
            contest.results_published = False
        else:
            if not contest.start_time or not contest.end_time:
                return Response(
                    {'error': 'Start time and end time are required before publishing.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if contest.end_time <= contest.start_time:
                return Response(
                    {'error': 'End time must be after start time.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            contest.status = 'published'
        contest.save(update_fields=['status', 'results_published'])

        # Log activity
        log_contest_activity(
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
            raise DRFValidationError('Contest is already archived')

        contest.status = 'archived'
        contest.save()

        # Log activity
        log_contest_activity(
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
        return self._classroom_roster_admin_gate(contest)

    @action(detail=True, methods=['post'], permission_classes=[IsContestLifecycleOwner], url_path='add_admin')
    def add_admin(self, request, pk=None):
        """
        Add a user as co-admin for this contest.
        Only owner (or platform admin) can add co-admins.
        """
        contest = self.get_object()
        return self._classroom_roster_admin_gate(contest)

    @action(detail=True, methods=['post'], permission_classes=[IsContestLifecycleOwner], url_path='remove_admin')
    def remove_admin(self, request, pk=None):
        """
        Remove a user from co-admins.
        Only owner (or platform admin) can remove co-admins.
        """
        contest = self.get_object()
        return self._classroom_roster_admin_gate(contest)

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
            # Paper exam: use persisted participant.score which is maintained
            # by ExamScoringService and correctly respects score_policy
            # (excluded, full_marks, redistribute).
            user_totals: dict = {
                p.user_id: float(p.score or 0)
                for p in participants
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

        user_ids = [p.user_id for p in participants]
        if user_ids:
            from apps.contests.services.anti_cheat_session import get_last_heartbeats
            from apps.contests.services.realtime_sfu_registry import get_preferred_publishers, get_publishers_by_user

            heartbeats = get_last_heartbeats(contest.id, user_ids)
            live_publishers = get_preferred_publishers(contest.id, user_ids)
            live_publishers_by_user = get_publishers_by_user(contest.id, user_ids)
            for p in participants:
                p._last_heartbeat_cached = heartbeats.get(p.user_id)
                p._live_publisher_cached = live_publishers.get(p.user_id)
                p._live_publishers_cached = live_publishers_by_user.get(p.user_id, [])

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

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='manual_proctor_event')
    def manual_proctor_event(self, request, pk=None):
        """Create a TA-authored manual evidence event for a participant."""
        contest = self.get_object()
        user_id = _parse_required_user_id(request.data.get('user_id'))
        reason = str(request.data.get('reason') or '').strip()
        description = str(request.data.get('description') or '').strip()
        if not reason:
            raise DRFValidationError({'reason': 'This field is required.'})

        started_at = _parse_manual_event_datetime(
            request.data.get('started_at'),
            field_name='started_at',
        )
        ended_at = _parse_manual_event_datetime(
            request.data.get('ended_at'),
            field_name='ended_at',
        )
        if ended_at < started_at:
            raise DRFValidationError({'ended_at': 'ended_at must be after started_at.'})

        try:
            participant = ContestParticipant.objects.select_related('user').get(
                contest=contest,
                user_id=user_id,
            )
        except ContestParticipant.DoesNotExist:
            raise NotFound('Participant not found')

        upload_session_id = str(request.data.get('upload_session_id') or '').strip()
        uploaded_object_keys = [
            str(value).strip()
            for value in request.data.get('uploaded_object_keys', [])
            if str(value).strip()
        ]
        uploaded_seqs = [
            int(value)
            for value in request.data.get('uploaded_seqs', [])
            if str(value).strip().isdigit()
        ]
        module_results = request.data.get('module_results')
        if not isinstance(module_results, dict):
            module_results = {}

        metadata = {
            'manual_proctor_note': True,
            'reason': reason,
            'description': description,
            'recorded_by_user_id': request.user.id,
            'recorded_by_username': request.user.username,
            'manual_recording_started_at': started_at.isoformat(),
            'manual_recording_ended_at': ended_at.isoformat(),
            'evidence_window_start': started_at.isoformat(),
            'evidence_window_end': ended_at.isoformat(),
            'forced_capture_requested': True,
            'forced_capture_reason': reason,
            'forced_capture_result': 'uploaded' if uploaded_object_keys else 'manual_window',
            'forced_capture_attempted': True,
            'forced_capture_captured': bool(uploaded_object_keys),
            'forced_capture_uploaded': bool(uploaded_object_keys),
            'forced_capture_modules': ['screen_share', 'webcam'],
        }
        if upload_session_id:
            metadata['upload_session_id'] = upload_session_id
        if uploaded_object_keys:
            metadata['forced_capture_uploaded_object_keys'] = uploaded_object_keys
            metadata['evidence_uploaded_frame_count'] = len(uploaded_object_keys)
        if uploaded_seqs:
            metadata['forced_capture_uploaded_seqs'] = uploaded_seqs
            metadata['forced_capture_seq'] = uploaded_seqs[-1]
        if module_results:
            metadata['forced_capture_module_results'] = module_results

        event = ExamEvent.objects.create(
            contest=contest,
            user=participant.user,
            event_type=MANUAL_PROCTOR_EVENT_TYPE,
            metadata=metadata,
        )

        return Response({
            'status': 'created',
            'event_id': str(event.id),
            'event_type': event.event_type,
            'metadata': event.metadata,
            'created_at': event.created_at,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='manual_proctor_evidence_urls')
    def manual_proctor_evidence_urls(self, request, pk=None):
        """Issue admin-side evidence upload URLs for manual proctoring captures."""
        contest = self.get_object()
        user_id = _parse_required_user_id(request.data.get('user_id'))
        module = str(request.data.get('module') or 'screen_share').strip()
        if module not in {'screen_share', 'webcam'}:
            raise DRFValidationError({'module': 'Invalid module.'})
        try:
            participant = ContestParticipant.objects.get(contest=contest, user_id=user_id)
        except ContestParticipant.DoesNotExist:
            raise NotFound('Participant not found')
        if participant.exam_status not in ACTIVE_EXAM_STATUSES:
            raise DRFValidationError({'user_id': 'Participant is not in an active exam state.'})

        try:
            count = int(request.data.get('count') or 1)
            start_seq = int(request.data.get('start_seq') or 1)
        except (TypeError, ValueError):
            raise DRFValidationError({'count': 'Invalid count.'})
        count = min(max(count, 1), 60)
        start_seq = max(start_seq, 1)

        upload_session_id = str(request.data.get('upload_session_id') or '').strip() or build_upload_session_id()
        frame_timestamps = request.data.get('frame_timestamps')
        if not isinstance(frame_timestamps, list):
            frame_timestamps = []
        now_ms = int(timezone.now().timestamp() * 1000)
        presign_client = get_s3_client(
            endpoint_url=(settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or "").strip() or None
        )
        items = []
        for i in range(count):
            seq = start_seq + i
            try:
                ts_ms = int(frame_timestamps[i])
            except (IndexError, TypeError, ValueError):
                ts_ms = now_ms + i
            object_key = build_raw_object_key(
                contest_id=contest.id,
                user_id=participant.user_id,
                upload_session_id=upload_session_id,
                ts_ms=ts_ms,
                seq=seq,
                module=module,
            )
            items.append({
                'seq': seq,
                'object_key': object_key,
                'module': module,
                'put_url': generate_put_url(
                    settings.ANTICHEAT_RAW_BUCKET,
                    object_key,
                    expires_seconds=settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS,
                    client=presign_client,
                ),
                'required_headers': {
                    'Content-Type': 'image/webp',
                    **(
                        {'x-amz-tagging': 'cleanup=true'}
                        if settings.OBJECT_STORAGE_OBJECT_TAGGING_ENABLED
                        else {}
                    ),
                },
            })

        return Response({
            'upload_session_id': upload_session_id,
            'module': module,
            'next_seq': start_seq + count,
            'items': items,
        })

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
            raise NotFound('Participant not found')

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
            raise NotFound('Participant not found')

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
                raise DRFValidationError('Warning: User has not finished the exam.')

            reopen_participant_exam(
                participant,
                activity_user=request.user,
                activity_details=f"Reopened exam for {participant.user.username}",
            )

            return Response({'status': 'reopened', 'exam_status': ExamStatus.PAUSED})
        except ContestParticipant.DoesNotExist:
            raise NotFound('Participant not found')

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='add_participant')
    def add_participant(self, request, pk=None):
        """
        Manually add a participant to the contest.
        """
        contest = self.get_object()
        return self._classroom_roster_admin_gate(contest)

    @action(detail=True, methods=['post'], permission_classes=[IsContestOwnerOrAdmin], url_path='remove_participant')
    def remove_participant(self, request, pk=None):
        """
        Remove a participant from the contest.
        Only contest owners/admins can perform this action.
        """
        contest = self.get_object()
        return self._classroom_roster_admin_gate(contest)

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

        if not self._is_classroom_managed_contest(contest):
            return self._contest_requires_classroom_binding_response()

        err = self._assert_user_in_bound_classroom(contest, user)
        if err is not None:
            return err

        participant, created, error_response = self._ensure_classroom_bound_participant(
            contest, user,
        )
        if error_response is not None:
            return error_response
        if not created:
            raise DRFValidationError('Already registered')
        log_contest_activity(
            contest,
            request.user,
            'register',
            "Registered for contest via classroom binding",
        )
        return Response(
            {'message': 'Successfully registered'},
            status=status.HTTP_201_CREATED,
        )

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

        if not self._is_classroom_managed_contest(contest):
            return self._contest_requires_classroom_binding_response()

        err = self._assert_user_in_bound_classroom(contest, user)
        if err is not None:
            return err

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
        log_contest_activity(
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
                log_contest_activity(
                    contest,
                    request.user,
                    'other',
                    "Left contest"
                )
        except ContestParticipant.DoesNotExist:
            pass

        return Response({'message': 'Left successfully'})

    # ========== Standings & Export ==========

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
            logger.warning("Export validation error: %s", exc)
            return Response(
                {'error': 'Export validation failed'},
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
            log_contest_activity(
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
