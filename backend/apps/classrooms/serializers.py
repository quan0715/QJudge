"""
Serializers for classrooms.
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import Classroom, ClassroomMember, ClassroomContest, ClassroomAnnouncement
from .permissions import get_user_role_in_classroom

User = get_user_model()


def get_reserved_user_ids(classroom) -> set[int]:
    admin_user_ids = set(classroom.admins.values_list('id', flat=True))
    return admin_user_ids | {classroom.owner_id}


class ClassroomListSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    member_count = serializers.SerializerMethodField()
    current_user_role = serializers.SerializerMethodField()

    class Meta:
        model = Classroom
        fields = [
            'id', 'uuid', 'name', 'description', 'owner_username',
            'member_count', 'is_archived', 'current_user_role',
            'icon', 'cover_url', 'created_at',
        ]

    def get_member_count(self, obj):
        return obj.memberships.exclude(user_id__in=get_reserved_user_ids(obj)).count()

    def get_current_user_role(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        return get_user_role_in_classroom(request.user, obj)


class ClassroomMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = ClassroomMember
        fields = ['user_id', 'username', 'email', 'avatar_url', 'role', 'joined_at']

    def get_avatar_url(self, obj):
        try:
            profile = obj.user.profile
        except User.profile.RelatedObjectDoesNotExist:
            return ''
        return profile.avatar_url or ''


class BoundContestSerializer(serializers.ModelSerializer):
    contest_id = serializers.UUIDField(source='contest.id', read_only=True)
    contest_name = serializers.CharField(source='contest.name', read_only=True)
    contest_description = serializers.CharField(source='contest.description', read_only=True)
    contest_status = serializers.CharField(source='contest.status', read_only=True)
    contest_visibility = serializers.CharField(source='contest.visibility', read_only=True)
    attendance_check_enabled = serializers.BooleanField(source='contest.attendance_check_enabled', read_only=True)
    contest_type = serializers.CharField(source='contest.contest_type', read_only=True)
    contest_start_time = serializers.DateTimeField(source='contest.start_time', read_only=True)
    contest_end_time = serializers.DateTimeField(source='contest.end_time', read_only=True)
    contest_owner_username = serializers.CharField(source='contest.owner.username', read_only=True)
    results_published = serializers.BooleanField(source='contest.results_published', read_only=True)
    participant_count = serializers.SerializerMethodField()

    class Meta:
        model = ClassroomContest
        fields = [
            'contest_id',
            'contest_name',
            'contest_description',
            'contest_status',
            'contest_visibility',
            'attendance_check_enabled',
            'contest_type',
            'contest_start_time',
            'contest_end_time',
            'contest_owner_username',
            'results_published',
            'participant_count',
            'bound_at',
        ]

    def get_participant_count(self, obj):
        return obj.contest.registrations.count()


class ClassroomAnnouncementSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(
        source='created_by.username', read_only=True, default=None
    )

    class Meta:
        model = ClassroomAnnouncement
        fields = [
            'id', 'title', 'content', 'is_pinned',
            'created_by_username', 'created_at', 'updated_at',
        ]


class ClassroomAnnouncementWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassroomAnnouncement
        fields = ['title', 'content', 'is_pinned']


class AdminUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()


class ClassroomDetailSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    member_count = serializers.SerializerMethodField()
    current_user_role = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    contests = serializers.SerializerMethodField()
    admins = serializers.SerializerMethodField()
    invite_code = serializers.SerializerMethodField()
    announcements = serializers.SerializerMethodField()

    class Meta:
        model = Classroom
        fields = [
            'id', 'uuid', 'name', 'description', 'owner_username',
            'member_count', 'is_archived', 'invite_code', 'invite_code_enabled',
            'current_user_role', 'icon', 'cover_url', 'members', 'contests',
            'admins', 'announcements', 'created_at', 'updated_at',
        ]

    def get_member_count(self, obj):
        return obj.memberships.exclude(user_id__in=get_reserved_user_ids(obj)).count()

    def get_current_user_role(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        return get_user_role_in_classroom(request.user, obj)

    def get_invite_code(self, obj):
        """Only visible to classroom managers (or platform admin)."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        role = get_user_role_in_classroom(request.user, obj)
        if role in ('platform_admin', 'owner', 'manager'):
            return obj.invite_code
        return None

    def get_members(self, obj):
        return ClassroomMemberSerializer(
            obj.memberships.select_related('user').exclude(user_id__in=get_reserved_user_ids(obj)),
            many=True
        ).data

    def get_contests(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        role = get_user_role_in_classroom(user, obj) if user and user.is_authenticated else None
        bindings = obj.classroom_contests.select_related('contest')
        if role not in ('platform_admin', 'owner', 'manager'):
            bindings = bindings.filter(contest__status='published')
        return BoundContestSerializer(
            bindings, many=True
        ).data

    def get_admins(self, obj):
        return AdminUserSerializer(
            obj.admins.all(), many=True
        ).data

    def get_announcements(self, obj):
        return ClassroomAnnouncementSerializer(
            obj.announcements.select_related('created_by'), many=True
        ).data


class ClassroomCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Classroom
        fields = ['name', 'description', 'invite_code_enabled', 'icon', 'cover_url']

    def create(self, validated_data):
        from .services import generate_invite_code
        request = self.context.get('request')
        validated_data['owner'] = request.user
        validated_data['invite_code'] = generate_invite_code()
        return super().create(validated_data)


class AddMembersSerializer(serializers.Serializer):
    usernames = serializers.ListField(
        child=serializers.CharField(max_length=254),
        allow_empty=False,
    )
    role = serializers.ChoiceField(
        choices=['student', 'ta'],
        default='student',
    )


class UpdateMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=['student', 'ta'])


class CreateClassroomContestSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    contest_type = serializers.ChoiceField(choices=['coding', 'paper_exam'])
    start_time = serializers.DateTimeField(required=False, allow_null=True)
    end_time = serializers.DateTimeField(required=False, allow_null=True)
    visibility = serializers.ChoiceField(choices=['public', 'private'], required=False, default='public')
    attendance_check_enabled = serializers.BooleanField(required=False, default=False)
    cheat_detection_enabled = serializers.BooleanField(required=False, default=False)
    allow_multiple_joins = serializers.BooleanField(required=False, default=False)
    results_published = serializers.BooleanField(required=False, default=False)

    def to_internal_value(self, data):
        legacy_errors = {
            field: "Contest password access was removed. Use attendance_check_enabled."
            for field in ("requires_password", "password")
            if field in data
        }
        if legacy_errors:
            raise serializers.ValidationError(legacy_errors)
        return super().to_internal_value(data)

    def validate(self, attrs):
        start_time = attrs.get('start_time')
        end_time = attrs.get('end_time')
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})

        return attrs
