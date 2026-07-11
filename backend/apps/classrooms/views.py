"""
Views for classrooms.
"""
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import viewsets, permissions, serializers as drf_serializers, status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from django.conf import settings
from django.db import models
from django.urls import reverse

from apps.users.permissions import IsTeacherOrAdmin
from apps.core.services import (
    build_markdown_image_object_key,
    store_markdown_image,
    MarkdownImageStorageError,
)

from .models import Classroom, ClassroomAnnouncement
from .serializers import (
    ClassroomListSerializer,
    ClassroomDetailSerializer,
    ClassroomCreateUpdateSerializer,
    ClassroomMemberSerializer,
    ClassroomAnnouncementSerializer,
    ClassroomAnnouncementWriteSerializer,
    AddMembersSerializer,
    UpdateMemberRoleSerializer,
    BoundContestSerializer,
    CreateClassroomContestSerializer,
)
from .permissions import IsClassroomOwnerOrAdmin, IsClassroomMember, get_user_role_in_classroom
from .services import (
    add_classroom_members,
    create_classroom_contest,
    generate_invite_code,
    remove_classroom_member,
    update_classroom_member_role,
)


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
            'member_detail',
            'invite_code',
            'announcement_detail',
            'notify_announcement',
            'cover',
        }
        member_actions = {
            'retrieve',
            'list_contests',
        }

        if self.action == 'create':
            return [permissions.IsAuthenticated(), IsTeacherOrAdmin()]
        if self.action in {'members', 'announcements'}:
            permission_class = (
                IsClassroomMember
                if self.request.method in permissions.SAFE_METHODS
                else IsClassroomOwnerOrAdmin
            )
            return [permissions.IsAuthenticated(), permission_class()]
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

    @action(detail=True, methods=['get', 'post'], url_path='members')
    def members(self, request, id=None):
        classroom = self.get_object()
        if request.method.lower() == 'post':
            serializer = AddMembersSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            result = add_classroom_members(
                classroom,
                identifiers=serializer.validated_data['usernames'],
                role=serializer.validated_data['role'],
            )

            return Response({
                'added': result.added,
                'already_exists': result.already_exists,
                'not_found': result.not_found,
            })

        members = classroom.memberships.select_related('user').all()
        return Response(ClassroomMemberSerializer(members, many=True).data)

    @action(detail=True, methods=['patch', 'delete'], url_path=r'members/(?P<member_user_id>\d+)')
    def member_detail(self, request, id=None, member_user_id=None):
        classroom = self.get_object()
        user_id = int(member_user_id)

        if request.method.lower() == 'delete':
            deleted = remove_classroom_member(
                classroom=classroom,
                user_id=user_id,
            )
            if not deleted:
                raise NotFound('Member not found.')
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = UpdateMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = update_classroom_member_role(
            classroom=classroom,
            user_id=user_id,
            role=serializer.validated_data['role'],
        )

        if not updated:
            raise NotFound('Member not found.')
        return Response({'detail': 'Member role updated.'})

    @action(detail=True, methods=['post'], url_path='invite-code')
    def invite_code(self, request, id=None):
        classroom = self.get_object()
        classroom.invite_code = generate_invite_code()
        classroom.save(update_fields=['invite_code'])
        return Response({'invite_code': classroom.invite_code})

    def _is_classroom_manager(self, classroom, user) -> bool:
        role = get_user_role_in_classroom(user, classroom)
        return role in {'platform_admin', 'owner', 'manager'}

    # ── Classroom contests ───────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='contests',
            permission_classes=[permissions.IsAuthenticated, IsClassroomMember])
    def list_contests(self, request, id=None):
        classroom = self.get_object()
        if request.method.lower() == 'post':
            if not self._is_classroom_manager(classroom, request.user):
                raise PermissionDenied('You do not have permission to create contests.')
            serializer = CreateClassroomContestSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            result = create_classroom_contest(
                classroom,
                actor=request.user,
                data=serializer.validated_data,
            )

            payload = BoundContestSerializer(
                result.binding,
                context={'request': request},
            ).data
            return Response(payload, status=status.HTTP_201_CREATED)

        bindings = classroom.classroom_contests.select_related('contest')
        if not self._is_classroom_manager(classroom, request.user):
            bindings = bindings.filter(contest__status='published')
        serializer = BoundContestSerializer(
            bindings,
            many=True,
            context={'request': request},
        )
        return Response(serializer.data)

    # ── Announcements ────────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='announcements')
    def announcements(self, request, id=None):
        classroom = self.get_object()
        if request.method.lower() == 'post':
            serializer = ClassroomAnnouncementWriteSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(classroom=classroom, created_by=request.user)
            return Response(
                ClassroomAnnouncementSerializer(serializer.instance).data,
                status=status.HTTP_201_CREATED,
            )

        qs = classroom.announcements.select_related('created_by')
        return Response(ClassroomAnnouncementSerializer(qs, many=True).data)

    @action(detail=True, methods=['patch', 'delete'], url_path=r'announcements/(?P<ann_id>\d+)')
    def announcement_detail(self, request, id=None, ann_id=None):
        classroom = self.get_object()

        if request.method.lower() == 'delete':
            deleted, _ = classroom.announcements.filter(pk=ann_id).delete()
            if deleted == 0:
                raise NotFound('Announcement not found.')
            return Response(status=status.HTTP_204_NO_CONTENT)

        announcement = self._get_announcement(classroom, ann_id)
        serializer = ClassroomAnnouncementWriteSerializer(
            announcement, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ClassroomAnnouncementSerializer(announcement).data)

    def _get_announcement(self, classroom, ann_id):
        try:
            return classroom.announcements.get(pk=ann_id)
        except ClassroomAnnouncement.DoesNotExist:
            raise NotFound('Announcement not found.')

    @extend_schema(
        request=None,
        responses={200: inline_serializer(
            name="NotifyAnnouncementResponse",
            fields={
                "detail": drf_serializers.CharField(),
                "count": drf_serializers.IntegerField(),
            },
        )},
    )
    @action(detail=True, methods=['post'], url_path=r'announcements/(?P<ann_id>\d+)/notify',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin])
    def notify_announcement(self, request, id=None, ann_id=None):
        """Send email notification for a specific classroom announcement."""
        classroom = self.get_object()
        try:
            announcement = classroom.announcements.select_related('created_by').get(pk=ann_id)
        except ClassroomAnnouncement.DoesNotExist:
            raise NotFound('Announcement not found.')

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

    @action(detail=True, methods=['post'], url_path='cover',
            permission_classes=[permissions.IsAuthenticated, IsClassroomOwnerOrAdmin],
            parser_classes=[MultiPartParser, FormParser])
    def cover(self, request, id=None):
        """Upload a cover image and store in S3, saving URL to cover_url."""
        classroom = self.get_object()

        uploaded = request.FILES.get('file')
        if not uploaded:
            raise DRFValidationError('file is required')

        max_bytes = int(getattr(settings, 'MARKDOWN_IMAGE_MAX_BYTES', 5242880))
        if uploaded.size > max_bytes:
            raise DRFValidationError(f'File is too large (max {max_bytes // 1048576}MB)')

        payload = uploaded.read()
        if not payload:
            raise DRFValidationError('Uploaded file is empty')

        try:
            with Image.open(BytesIO(payload)) as img:
                img.verify()
            with Image.open(BytesIO(payload)) as img:
                image_format = (img.format or '').upper()
        except (UnidentifiedImageError, OSError):
            raise DRFValidationError('Unsupported image file')

        if image_format not in self.COVER_SUPPORTED_FORMATS:
            raise DRFValidationError('Unsupported format. Use png/jpg/webp')

        extension, content_type = self.COVER_SUPPORTED_FORMATS[image_format]
        object_key = build_markdown_image_object_key(extension)

        try:
            store_markdown_image(content=payload, object_key=object_key, content_type=content_type)
        except MarkdownImageStorageError:
            raise APIException('Failed to upload image')

        base_url = (getattr(settings, 'MARKDOWN_IMAGE_PUBLIC_BASE_URL', '') or '').strip()
        path = reverse('markdown-image-read', kwargs={'object_key': object_key})
        image_url = f'{base_url.rstrip("/")}{path}' if base_url else request.build_absolute_uri(path)

        classroom.cover_url = image_url
        classroom.save(update_fields=['cover_url'])

        return Response({'cover_url': image_url}, status=status.HTTP_200_OK)
