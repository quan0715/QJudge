"""
Serializers for user authentication and profile management.
"""
from datetime import timedelta
from urllib.parse import urlparse

from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import (
    TeacherActivationInvite,
    User,
    UserLoginRecord,
    UserProfile,
)


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile."""
    
    class Meta:
        model = UserProfile
        fields = [
            'solved_count',
            'submission_count',
            'accept_rate',
            'display_name',
            'avatar_url',
            'preferred_language',
            'preferred_theme',
            'editor_font_size',
            'editor_tab_size',
            'onboarding_completed_at',
        ]
        read_only_fields = ['solved_count', 'submission_count', 'accept_rate']


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user model."""
    profile = UserProfileSerializer(read_only=True)
    subscription = serializers.SerializerMethodField()

    def get_subscription(self, obj):
        try:
            sub = obj.subscription
            return {"tier": sub.tier, "status": sub.status}
        except Exception:
            return {"tier": "free", "status": "active"}

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'role',
            'auth_provider',
            'is_active',
            'date_joined',
            'last_login_at',
            'profile',
            'subscription',
        ]
        read_only_fields = [
            'id',
            'auth_provider',
            'date_joined',
            'last_login_at',
        ]


class CurrentUserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating current user's account fields."""

    class Meta:
        model = User
        fields = ['username', 'email']

    def validate_username(self, value):
        user = self.instance
        if user and user.username == value:
            return value
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('此使用者名稱已被使用')
        return value

    def validate_email(self, value):
        user = self.instance
        if user and user.email == value:
            return value
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('此 Email 已被註冊')
        return value


class RegisterSerializer(serializers.Serializer):
    """Serializer for password credential registration."""
    username = serializers.CharField(
        max_length=150,
        required=True,
    )
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    # Role field removed - all new users are automatically students
    # Only admins can change roles through user management interface
    
    def validate_username(self, value):
        """Validate username is unique."""
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('此使用者名稱已被使用')
        return value
    
    def validate_email(self, value):
        """Validate email is unique."""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('此 Email 已被註冊')
        return value
    
    def validate(self, attrs):
        """Validate passwords match."""
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({
                'password_confirm': '密碼不一致'
            })
        
        # Validate password strength
        try:
            validate_password(attrs['password'])
        except ValidationError as e:
            raise serializers.ValidationError({
                'password': list(e.messages)
            })
        
        return attrs
    
    def create(self, validated_data):
        """Create user with student role by default."""
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        
        user = User.objects.create_user(
            password=password,
            auth_provider='email',
            role='student',  # Force all new users to be students
            **validated_data
        )
        return user


class LoginSerializer(serializers.Serializer):
    """Serializer for password credential login."""
    identifier = serializers.CharField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    device_id = serializers.CharField(required=False, allow_blank=True, max_length=128)


class OAuthCallbackSerializer(serializers.Serializer):
    """Serializer for OAuth callback."""
    code = serializers.CharField(required=True)
    redirect_uri = serializers.URLField(required=True)
    device_id = serializers.CharField(required=False, allow_blank=True, max_length=128)


class TokenRefreshSerializer(serializers.Serializer):
    """Serializer for token refresh."""
    refresh = serializers.CharField(required=False, allow_blank=True)


class UserSearchSerializer(serializers.ModelSerializer):
    """Serializer for user search results in admin interface."""
    display_name = serializers.SerializerMethodField()
    onboarding_completed_at = serializers.SerializerMethodField()

    def get_display_name(self, obj):
        try:
            return obj.profile.display_name
        except UserProfile.DoesNotExist:
            return ''

    def get_onboarding_completed_at(self, obj):
        try:
            return obj.profile.onboarding_completed_at
        except UserProfile.DoesNotExist:
            return None
    
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'role',
            'auth_provider',
            'last_login_at',
            'is_active',
            'display_name',
            'onboarding_completed_at',
        ]
        read_only_fields = fields


class UserRoleUpdateSerializer(serializers.Serializer):
    """Serializer for updating user role."""
    role = serializers.ChoiceField(
        choices=['student', 'teacher', 'admin'],
        required=True
    )
    
    def validate_role(self, value):
        """Validate role choice."""
        if value not in ['student', 'teacher', 'admin']:
            raise serializers.ValidationError('無效的角色選擇')
        return value


class ActionLinkIssueSerializer(serializers.Serializer):
    """Serializer for issuing a scoped action link."""

    purpose = serializers.ChoiceField(
        choices=["teacher_activation", "classroom_join"],
        default="teacher_activation",
    )
    classroom_id = serializers.UUIDField(required=False)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate(self, attrs):
        purpose = attrs.get("purpose", "teacher_activation")
        if purpose == "classroom_join" and not attrs.get("classroom_id"):
            raise serializers.ValidationError({
                "classroom_id": "classroom_id is required for classroom_join action links."
            })
        return attrs


class ActionLinkRedeemSerializer(serializers.Serializer):
    """Serializer for redeeming a scoped action link."""
    pass


class ActionLinkInspectSerializer(serializers.Serializer):
    """Serializer placeholder for inspecting a scoped action link."""
    pass


class TeacherActivationInviteSerializer(serializers.ModelSerializer):
    """Serializer for teacher activation invite metadata."""

    status = serializers.SerializerMethodField()

    def get_status(self, obj):
        if obj.consumed_at:
            return "consumed"
        if obj.expires_at <= timezone.now():
            return "expired"
        return "pending"

    class Meta:
        model = TeacherActivationInvite
        fields = [
            'id',
            'email',
            'expires_at',
            'consumed_at',
            'created_at',
            'status',
        ]
        read_only_fields = fields


class UserPreferencesUpdateSerializer(serializers.Serializer):
    """Serializer for updating user preferences."""
    display_name = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True
    )
    avatar_url = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True
    )
    preferred_language = serializers.ChoiceField(
        choices=[c[0] for c in UserProfile.LANGUAGE_CHOICES],
        required=False
    )
    preferred_theme = serializers.ChoiceField(
        choices=[c[0] for c in UserProfile.THEME_CHOICES],
        required=False
    )
    editor_font_size = serializers.IntegerField(
        min_value=12,
        max_value=20,
        required=False
    )
    editor_tab_size = serializers.ChoiceField(
        choices=[2, 4],
        required=False
    )
    onboarding_completed_at = serializers.DateTimeField(
        required=False,
        allow_null=True
    )
    
    def validate_avatar_url(self, value):
        if value == "":
            return value
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"}:
            raise serializers.ValidationError("頭像連結僅支援 http/https")
        if not parsed.netloc:
            raise serializers.ValidationError("頭像連結格式無效")
        return value

    def validate_onboarding_completed_at(self, value):
        if value and value > timezone.now() + timedelta(seconds=60):
            raise serializers.ValidationError("完成時間不能晚於現在")
        return value


class UserLoginRecordSerializer(serializers.ModelSerializer):
    """Read-only serializer for login history entries."""

    class Meta:
        model = UserLoginRecord
        fields = [
            'id',
            'device_id',
            'ip_address',
            'user_agent',
            'login_method',
            'created_at',
            'is_current',
        ]
        read_only_fields = fields
