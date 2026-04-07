"""
Views for classrooms.
"""
from io import BytesIO
from uuid import UUID

from PIL import Image, UnidentifiedImageError
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.urls import reverse
from django.utils import timezone

from apps.users.permissions import IsTeacherOrAdmin, IsSuperAdmin
from apps.contests.models import AssignmentState, Contest, ContestParticipant, ExamStatus
from apps.core.services import (
    build_markdown_image_object_key,
    store_markdown_image,
    MarkdownImageStorageError,
)

from .models import Classroom, ClassroomMember, ClassroomContest, ClassroomAnnouncement
from .serializers import (
    ClassroomListSerializer,
    ClassroomDetailSerializer,
    ClassroomCreateUpdateSerializer,
    ClassroomMemberSerializer,
    ClassroomAnnouncementSerializer,
    ClassroomAnnouncementWriteSerializer,
    JoinClassroomSerializer,
    AddMembersSerializer,
    RemoveMemberSerializer,
    UpdateMemberRoleSerializer,
    BindContestSerializer,
    BoundContestSerializer,
    ClassroomLabDetailSerializer,
    ClassroomLabSummarySerializer,
    CreateClassroomLabSerializer,
    CreateClassroomContestSerializer,
)
from .permissions import IsClassroomOwnerOrAdmin, IsClassroomMember, get_user_role_in_classroom
from .services import generate_invite_code, sync_classroom_participants, on_member_joined
from apps.contests.services.detail_cache import bump_contest_detail_cache_version

User = get_user_model()


class ClassroomViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "uuid"
    lookup_url_kwarg = "id"
    lookup_value_regex = "[0-9a-fA-F-]{36}"
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        scope = self.request.query_params.get('scope', 'all')

        # For detail/custom actions, use object-level permissions to determine access.
        if self.action and self.action != 'list':
            return Classroom.objects.all()

        if user.is_staff or user.is_superuser:
            qs = Classroom.objects.all()
        elif scope == 'manage':
            # Classrooms the user owns or is admin of
            qs = Classroom.objects.filter(
                models.Q(owner=user) | models.Q(admins=user)
            ).distinct()
        elif scope == 'enrolled':
            # Classrooms the user is a member of
            qs = Classroom.objects.filter(members=user)
        else:
            # All classrooms the user is involved in
            qs = Classroom.objects.filter(
                models.Q(owner=user) | models.Q(admins=user) | models.Q(members=user)
            ).distinct()

        if not self.request.query_params.get('include_archived'):
            qs = qs.filter(is_archived=False)

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return ClassroomListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return ClassroomCreateUpdateSerializer
        return ClassroomDetailSerializer

    def create(self, request, *args, **kwargs):
        write_serializer = ClassroomCreateUpdateSerializer(
            data=request.data, context=self.get_serializer_context()
        )
        write_serializer.is_valid(raise_exception=True)
        instance = write_serializer.save()
        read_serializer = ClassroomDetailSerializer(
            instance, context=self.get_serializer_context()
        )
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    def get_permissions(self):
        owner_admin_actions = {
            'update', 'partial_update', 'destroy',
            'add_members', 'remove_member',
            'update_member_role',
            'regenerate_code',
            'create_announcement',
            'update_announcement', 'delete_announcement',
            'notify_announcement',
            'upload_cover',
        }
        platform_admin_actions = {
            'bind_contest', 'unbind_contest',
        }
        member_actions = {
            'retrieve', 'list_members',
            'list_contests',
            'list_labs', 'retrieve_lab', 'accept_lab', 'solve_lab',
            'list_announcements',
        }

        if self.action == 'create':
            return [permissions.IsAuthenticated(), IsTeacherOrAdmin()]
        if self.action in platform_admin_actions:
            return [permissions.IsAuthenticated(), IsSuperAdmin()]
        if self.action in owner_admin_actions:
            return [permissions.IsAuthenticated(), IsClassroomOwnerOrAdmin()]
        if self.action in member_actions:
            return [permissions.IsAuthenticated(), IsClassroomMember()]
        return [permissions.IsAuthenticated()]

    def perform_destroy(self, instance):
        """Archive instead of hard delete."""
        instance.is_archived = True
        instance.save(update_fields=['is_archived'])

    # ── Members ──────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='members')
    def list_members(self, request, id=None):
        classroom = self.get_object()
        members = classroom.memberships.select_related('user').all()
        return Response(ClassroomMemberSerializer(members, many=True).data)

    @action(detail=True, methods=['post'], url_path='add_members',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def add_members(self, request, id=None):
        classroom = self.get_object()
        serializer = AddMembersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        identifiers = serializer.validated_data['usernames']
        role = serializer.validated_data['role']

        users_by_key: dict[str, User] = {}
        for user in User.objects.filter(
            models.Q(username__in=identifiers)
            | models.Q(email__in=[value.lower() for value in identifiers if "@" in value])
        ):
            users_by_key.setdefault(user.username, user)
            users_by_key.setdefault(user.email.lower(), user)

        resolved_users: list[User] = []
        seen_user_ids: set[int] = set()
        not_found: list[str] = []
        for raw_identifier in identifiers:
            lookup_key = raw_identifier.lower() if "@" in raw_identifier else raw_identifier
            user = users_by_key.get(lookup_key)
            if user is None:
                not_found.append(raw_identifier)
                continue
            if user.id in seen_user_ids:
                continue
            seen_user_ids.add(user.id)
            resolved_users.append(user)

        added = []
        already_exists = []
        reserved_user_ids = set(classroom.admins.values_list('id', flat=True)) | {classroom.owner_id}
        for user in resolved_users:
            if user.id in reserved_user_ids:
                already_exists.append(user.username)
                continue
            _, created = ClassroomMember.objects.get_or_create(
                classroom=classroom, user=user,
                defaults={'role': role},
            )
            if created:
                added.append(user.username)
                on_member_joined(classroom, user)
            else:
                already_exists.append(user.username)

        return Response({
            'added': added,
            'already_exists': already_exists,
            'not_found': not_found,
        })

    @action(detail=True, methods=['post'], url_path='remove_member',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def remove_member(self, request, id=None):
        classroom = self.get_object()
        serializer = RemoveMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        deleted, _ = ClassroomMember.objects.filter(
            classroom=classroom,
            user_id=serializer.validated_data['user_id'],
        ).delete()

        if deleted == 0:
            return Response({'detail': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Member removed.'})

    @action(detail=True, methods=['post'], url_path='update_member_role',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def update_member_role(self, request, id=None):
        classroom = self.get_object()
        serializer = UpdateMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated = ClassroomMember.objects.filter(
            classroom=classroom,
            user_id=serializer.validated_data['user_id'],
        ).update(role=serializer.validated_data['role'])

        if updated == 0:
            return Response({'detail': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Member role updated.'})

    # ── Join / Invite Code ───────────────────────────────

    @action(detail=False, methods=['post'], url_path='join')
    def join(self, request):
        serializer = JoinClassroomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data['invite_code'].upper()
        try:
            classroom = Classroom.objects.get(invite_code=code, is_archived=False)
        except Classroom.DoesNotExist:
            return Response(
                {'detail': 'Invalid invite code.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not classroom.invite_code_enabled:
            return Response(
                {'detail': 'Invite code is disabled for this classroom.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if classroom.owner_id == request.user.id or classroom.admins.filter(pk=request.user.pk).exists():
            return Response(
                ClassroomDetailSerializer(classroom, context={'request': request}).data,
                status=status.HTTP_200_OK,
            )

        _, created = ClassroomMember.objects.get_or_create(
            classroom=classroom, user=request.user,
            defaults={'role': 'student'},
        )
        if created:
            on_member_joined(classroom, request.user)

        return Response(
            ClassroomDetailSerializer(classroom, context={'request': request}).data,
            status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='regenerate_code',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def regenerate_code(self, request, id=None):
        classroom = self.get_object()
        classroom.invite_code = generate_invite_code()
        classroom.save(update_fields=['invite_code'])
        return Response({'invite_code': classroom.invite_code})

    def _get_bound_lab(self, classroom, lab_id: str) -> ClassroomContest:
        try:
            UUID(str(lab_id))
        except ValueError:
            raise ClassroomContest.DoesNotExist
        return classroom.classroom_contests.select_related('contest').get(
            contest_id=lab_id,
            contest__delivery_mode='practice',
        )

    def _is_classroom_manager(self, classroom, user) -> bool:
        role = get_user_role_in_classroom(user, classroom)
        return role in {'platform_admin', 'owner', 'manager'}

    def _get_lab_or_403(self, request, classroom, lab_id: str):
        try:
            binding = self._get_bound_lab(classroom, lab_id)
        except ClassroomContest.DoesNotExist:
            return None, Response({'detail': 'Lab not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not self._is_classroom_manager(classroom, request.user):
            if binding.contest.status != 'published':
                return None, Response({'detail': 'Lab not found.'}, status=status.HTTP_404_NOT_FOUND)
            participant = binding.contest.registrations.filter(user=request.user).first()
            if participant is None:
                return None, Response({'detail': 'You are not a classroom member.'}, status=status.HTTP_403_FORBIDDEN)
        return binding, None

    # ── Bind Contest ─────────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='contests',
            permission_classes=[permissions.IsAuthenticated, IsClassroomMember])
    def list_contests(self, request, id=None):
        classroom = self.get_object()
        if request.method.lower() == 'post':
            if not self._is_classroom_manager(classroom, request.user):
                return Response({'detail': 'You do not have permission to create contests.'}, status=status.HTTP_403_FORBIDDEN)
            serializer = CreateClassroomContestSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            with transaction.atomic():
                raw_password = serializer.validated_data.get('password')
                contest = Contest.objects.create(
                    owner=request.user,
                    name=serializer.validated_data['name'],
                    description=serializer.validated_data.get('description', ''),
                    contest_type=serializer.validated_data['contest_type'],
                    delivery_mode='exam',
                    start_time=serializer.validated_data.get('start_time'),
                    end_time=serializer.validated_data.get('end_time'),
                    visibility='private'
                    if serializer.validated_data.get('requires_password')
                    else 'public',
                    cheat_detection_enabled=serializer.validated_data.get('cheat_detection_enabled', False),
                    allow_multiple_joins=serializer.validated_data.get('allow_multiple_joins', False),
                    results_published=serializer.validated_data.get('results_published', False),
                )
                if raw_password is not None:
                    contest.set_contest_password(raw_password)
                    contest.save(update_fields=['password'])
                binding = ClassroomContest.objects.create(classroom=classroom, contest=contest)
                sync_classroom_participants(classroom, contest)

            payload = BoundContestSerializer(binding, context={'request': request}).data
            return Response(payload, status=status.HTTP_201_CREATED)

        bindings = classroom.classroom_contests.select_related('contest').filter(
            contest__delivery_mode='exam',
        )
        if not self._is_classroom_manager(classroom, request.user):
            bindings = bindings.filter(contest__status='published')
        serializer = BoundContestSerializer(bindings, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='bind_contest',
            permission_classes=[permissions.IsAuthenticated, IsSuperAdmin])
    def bind_contest(self, request, id=None):
        classroom = self.get_object()
        serializer = BindContestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from apps.contests.models import Contest
        try:
            contest = Contest.objects.get(id=serializer.validated_data['contest_id'])
        except Contest.DoesNotExist:
            return Response({'detail': 'Contest not found.'}, status=status.HTTP_404_NOT_FOUND)

        _, created = ClassroomContest.objects.get_or_create(
            classroom=classroom, contest=contest,
        )
        if created:
            bump_contest_detail_cache_version(contest.id)
            count = sync_classroom_participants(classroom, contest)
            return Response({
                'detail': f'Contest bound. {count} participants registered.',
            }, status=status.HTTP_201_CREATED)
        return Response({'detail': 'Contest already bound.'})

    @action(detail=True, methods=['post'], url_path='unbind_contest',
            permission_classes=[permissions.IsAuthenticated, IsSuperAdmin])
    def unbind_contest(self, request, id=None):
        classroom = self.get_object()
        serializer = BindContestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        deleted, _ = ClassroomContest.objects.filter(
            classroom=classroom,
            contest_id=serializer.validated_data['contest_id'],
        ).delete()

        if deleted == 0:
            return Response({'detail': 'Binding not found.'}, status=status.HTTP_404_NOT_FOUND)
        bump_contest_detail_cache_version(serializer.validated_data['contest_id'])
        return Response({'detail': 'Contest unbound.'})

    # ── Labs facade ─────────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='labs',
            permission_classes=[permissions.IsAuthenticated, IsClassroomMember])
    def list_labs(self, request, id=None):
        classroom = self.get_object()
        if request.method.lower() == 'post':
            if not self._is_classroom_manager(classroom, request.user):
                return Response({'detail': 'You do not have permission to create labs.'}, status=status.HTTP_403_FORBIDDEN)
            serializer = CreateClassroomLabSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            with transaction.atomic():
                contest = Contest.objects.create(
                    owner=request.user,
                    name=serializer.validated_data['name'],
                    description=serializer.validated_data.get('description', ''),
                    contest_type=serializer.validated_data['contest_type'],
                    delivery_mode='practice',
                    start_time=serializer.validated_data.get('start_time'),
                    end_time=serializer.validated_data.get('end_time'),
                    results_published=serializer.validated_data.get('results_published', False),
                    cheat_detection_enabled=False,
                    visibility='private',
                )
                binding = ClassroomContest.objects.create(classroom=classroom, contest=contest)
                sync_classroom_participants(classroom, contest)

            payload = ClassroomLabDetailSerializer(binding, context={'request': request}).data
            return Response(payload, status=status.HTTP_201_CREATED)

        bindings = classroom.classroom_contests.select_related('contest').filter(
            contest__delivery_mode='practice',
        )
        if not self._is_classroom_manager(classroom, request.user):
            bindings = bindings.filter(contest__status='published')
        serializer = ClassroomLabSummarySerializer(bindings, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path=r'labs/(?P<lab_id>[0-9a-fA-F-]{36})',
            permission_classes=[permissions.IsAuthenticated, IsClassroomMember])
    def retrieve_lab(self, request, id=None, lab_id=None):
        classroom = self.get_object()
        binding, error = self._get_lab_or_403(request, classroom, lab_id)
        if error is not None:
            return error
        serializer = ClassroomLabDetailSerializer(binding, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path=r'labs/(?P<lab_id>[0-9a-fA-F-]{36})/accept',
            permission_classes=[permissions.IsAuthenticated, IsClassroomMember])
    def accept_lab(self, request, id=None, lab_id=None):
        classroom = self.get_object()
        binding, error = self._get_lab_or_403(request, classroom, lab_id)
        if error is not None:
            return error

        participant = binding.contest.registrations.filter(user=request.user).first()
        if participant is None:
            return Response({'detail': 'You are not a classroom member.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        update_fields = []
        if participant.assignment_state == AssignmentState.UNACCEPTED:
            participant.assignment_state = AssignmentState.ACCEPTED
            participant.accepted_at = now
            update_fields.extend(['assignment_state', 'accepted_at'])
        elif participant.accepted_at is None:
            participant.accepted_at = now
            update_fields.append('accepted_at')
        if participant.started_at is None:
            participant.started_at = now
            update_fields.append('started_at')
        if binding.contest.contest_type == 'paper_exam' and participant.exam_status == ExamStatus.NOT_STARTED:
            participant.exam_status = ExamStatus.IN_PROGRESS
            update_fields.append('exam_status')
        if update_fields:
            participant.save(update_fields=update_fields)
            bump_contest_detail_cache_version(binding.contest_id)

        serializer = ClassroomLabDetailSerializer(binding, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path=r'labs/(?P<lab_id>[0-9a-fA-F-]{36})/solve',
            permission_classes=[permissions.IsAuthenticated, IsClassroomMember])
    def solve_lab(self, request, id=None, lab_id=None):
        classroom = self.get_object()
        binding, error = self._get_lab_or_403(request, classroom, lab_id)
        if error is not None:
            return error

        if not self._is_classroom_manager(classroom, request.user):
            participant = binding.contest.registrations.filter(user=request.user).first()
            if participant is None:
                return Response({'detail': 'You are not a classroom member.'}, status=status.HTTP_403_FORBIDDEN)
            if participant.assignment_state == AssignmentState.UNACCEPTED:
                return Response(
                    {'detail': 'You must accept this lab before solving it.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = ClassroomLabDetailSerializer(binding, context={'request': request})
        return Response(serializer.data)

    # ── Announcements ────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='announcements')
    def list_announcements(self, request, id=None):
        classroom = self.get_object()
        qs = classroom.announcements.select_related('created_by')
        return Response(ClassroomAnnouncementSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='announcements/create',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def create_announcement(self, request, id=None):
        classroom = self.get_object()
        serializer = ClassroomAnnouncementWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(classroom=classroom, created_by=request.user)
        return Response(
            ClassroomAnnouncementSerializer(serializer.instance).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['patch'], url_path=r'announcements/(?P<ann_id>\d+)',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def update_announcement(self, request, id=None, ann_id=None):
        classroom = self.get_object()
        try:
            announcement = classroom.announcements.get(pk=ann_id)
        except ClassroomAnnouncement.DoesNotExist:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ClassroomAnnouncementWriteSerializer(
            announcement, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ClassroomAnnouncementSerializer(announcement).data)

    @action(detail=True, methods=['delete'], url_path=r'announcements/(?P<ann_id>\d+)/delete',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def delete_announcement(self, request, id=None, ann_id=None):
        classroom = self.get_object()
        deleted, _ = classroom.announcements.filter(pk=ann_id).delete()
        if deleted == 0:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path=r'announcements/(?P<ann_id>\d+)/notify',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def notify_announcement(self, request, id=None, ann_id=None):
        """Send email notification for a specific classroom announcement."""
        classroom = self.get_object()
        try:
            announcement = classroom.announcements.select_related('created_by').get(pk=ann_id)
        except ClassroomAnnouncement.DoesNotExist:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.notifications.services import NotificationService

        notifications = NotificationService.send_classroom_announcement_email(
            announcement=announcement,
            triggered_by=request.user,
        )
        return Response({
            'detail': f'已排入 {len(notifications)} 封通知信寄送佇列。',
            'count': len(notifications),
        })

    COVER_SUPPORTED_FORMATS = {
        "PNG": ("png", "image/png"),
        "JPEG": ("jpg", "image/jpeg"),
        "WEBP": ("webp", "image/webp"),
    }

    @action(detail=True, methods=['post'], url_path='upload_cover',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin],
            parser_classes=[MultiPartParser, FormParser])
    def upload_cover(self, request, id=None):
        """Upload a cover image and store in S3, saving URL to cover_url."""
        classroom = self.get_object()

        uploaded = request.FILES.get('file')
        if not uploaded:
            return Response({'error': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)

        max_bytes = int(getattr(settings, 'MARKDOWN_IMAGE_MAX_BYTES', 5242880))
        if uploaded.size > max_bytes:
            return Response(
                {'error': f'File is too large (max {max_bytes // 1048576}MB)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = uploaded.read()
        if not payload:
            return Response({'error': 'Uploaded file is empty'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with Image.open(BytesIO(payload)) as img:
                img.verify()
            with Image.open(BytesIO(payload)) as img:
                image_format = (img.format or '').upper()
        except (UnidentifiedImageError, OSError):
            return Response({'error': 'Unsupported image file'}, status=status.HTTP_400_BAD_REQUEST)

        if image_format not in self.COVER_SUPPORTED_FORMATS:
            return Response(
                {'error': 'Unsupported format. Use png/jpg/webp'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        extension, content_type = self.COVER_SUPPORTED_FORMATS[image_format]
        object_key = build_markdown_image_object_key(extension)

        try:
            store_markdown_image(content=payload, object_key=object_key, content_type=content_type)
        except MarkdownImageStorageError:
            return Response({'error': 'Failed to upload image'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        base_url = (getattr(settings, 'MARKDOWN_IMAGE_PUBLIC_BASE_URL', '') or '').strip()
        path = reverse('markdown-image-read', kwargs={'object_key': object_key})
        image_url = f'{base_url.rstrip("/")}{path}' if base_url else request.build_absolute_uri(path)

        classroom.cover_url = image_url
        classroom.save(update_fields=['cover_url'])

        return Response({'cover_url': image_url}, status=status.HTTP_200_OK)
