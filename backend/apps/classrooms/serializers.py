"""
Serializers for classrooms.
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import Classroom, ClassroomMember, ClassroomContest
from .permissions import get_user_role_in_classroom

User = get_user_model()


class ClassroomListSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    member_count = serializers.SerializerMethodField()
    current_user_role = serializers.SerializerMethodField()

    class Meta:
        model = Classroom
        fields = [
            'id', 'name', 'description', 'owner_username',
            'member_count', 'is_archived', 'current_user_role', 'created_at',
        ]

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_current_user_role(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        return get_user_role_in_classroom(request.user, obj)


class ClassroomMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)

    class Meta:
        model = ClassroomMember
        fields = ['user_id', 'username', 'email', 'role', 'joined_at']


class BoundContestSerializer(serializers.ModelSerializer):
    contest_id = serializers.IntegerField(source='contest.id', read_only=True)
    contest_name = serializers.CharField(source='contest.name', read_only=True)

    class Meta:
        model = ClassroomContest
        fields = ['contest_id', 'contest_name', 'bound_at']


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

    class Meta:
        model = Classroom
        fields = [
            'id', 'name', 'description', 'owner_username',
            'member_count', 'is_archived', 'invite_code', 'invite_code_enabled',
            'current_user_role', 'members', 'contests', 'admins',
            'created_at', 'updated_at',
        ]

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_current_user_role(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        return get_user_role_in_classroom(request.user, obj)

    def get_invite_code(self, obj):
        """Only visible to teacher/admin."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        role = get_user_role_in_classroom(request.user, obj)
        if role in ('admin', 'teacher'):
            return obj.invite_code
        return None

    def get_members(self, obj):
        return ClassroomMemberSerializer(
            obj.memberships.select_related('user'), many=True
        ).data

    def get_contests(self, obj):
        return BoundContestSerializer(
            obj.classroom_contests.select_related('contest'), many=True
        ).data

    def get_admins(self, obj):
        return AdminUserSerializer(
            obj.admins.all(), many=True
        ).data


class ClassroomCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Classroom
        fields = ['name', 'description', 'invite_code_enabled']

    def create(self, validated_data):
        from .services import generate_invite_code
        request = self.context.get('request')
        validated_data['owner'] = request.user
        validated_data['invite_code'] = generate_invite_code()
        return super().create(validated_data)


class JoinClassroomSerializer(serializers.Serializer):
    invite_code = serializers.CharField(max_length=8)


class AddMembersSerializer(serializers.Serializer):
    usernames = serializers.ListField(
        child=serializers.CharField(max_length=150),
        allow_empty=False,
    )
    role = serializers.ChoiceField(
        choices=['student', 'ta'],
        default='student',
    )


class RemoveMemberSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()


class BindContestSerializer(serializers.Serializer):
    contest_id = serializers.IntegerField()
