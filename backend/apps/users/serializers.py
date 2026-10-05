"""
Serializers for user authentication and profile management.
"""
from urllib.parse import urlparse

from rest_framework import serializers
from drf_spectacular.utils import extend_schema_serializer
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import (
    TeacherActivationInvite,
    User,
    UserLoginRecord,
    UserProfile,
)


@extend_schema_serializer(component_name="UserProfileObject")
class UserProfileSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    def get_avatar_url(self, obj) -> str | None:
        return obj.avatar_url or None

    class Meta:
        model = UserProfile
        fields = ['display_name', 'avatar_url']


@extend_schema_serializer(component_name="UserObject")
class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True, default={"display_name": "", "avatar_url": None})
    onboarding_completed_at = serializers.DateTimeField(source="profile.onboarding_completed_at", read_only=True, default=None)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'auth_provider', 'last_login_at',
                  'onboarding_completed_at', 'profile']
        read_only_fields = fields


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
    state = serializers.CharField(required=True, max_length=128)
    redirect_uri = serializers.URLField(required=True)
    device_id = serializers.CharField(required=False, allow_blank=True, max_length=128)


class TokenRefreshSerializer(serializers.Serializer):
    """Serializer for token refresh."""
    refresh = serializers.CharField(required=False, allow_blank=True)


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


class StrictSettingsSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = data.keys() - self.fields.keys()
            if unknown:
                raise serializers.ValidationError({key: "Unknown settings field." for key in sorted(unknown)})
        return super().to_internal_value(data)


class UserProfileUpdateSerializer(StrictSettingsSerializer):
    display_name = serializers.CharField(max_length=50, required=False, allow_blank=True)
    avatar_url = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)

    def validate_avatar_url(self, value):
        if not value:
            return ""
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise serializers.ValidationError("頭像連結僅支援有效的 http/https 網址")
        return value


@extend_schema_serializer(component_name="UserPreferencesObject")
class UserPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['preferred_language', 'preferred_theme', 'editor_font_size', 'editor_tab_size']


class UserPreferencesPatchSerializer(StrictSettingsSerializer):
    preferred_language = serializers.ChoiceField(choices=UserProfile.LANGUAGE_CHOICES, required=False)
    preferred_theme = serializers.ChoiceField(choices=UserProfile.THEME_CHOICES, required=False)
    editor_font_size = serializers.IntegerField(min_value=12, max_value=20, required=False)
    editor_tab_size = serializers.ChoiceField(choices=[2, 4], required=False)


@extend_schema_serializer(component_name="UserSettingsPatchRequest")
class UserPreferencesUpdateSerializer(StrictSettingsSerializer):
    profile = UserProfileUpdateSerializer(required=False)
    preferences = UserPreferencesPatchSerializer(required=False)
    onboarding_completed_at = serializers.DateTimeField(required=False, allow_null=True)

@extend_schema_serializer(component_name="UserSettingsObject")
class UserSettingsSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(source="*", read_only=True)
    preferences = UserPreferencesSerializer(source="*", read_only=True)

    class Meta:
        model = UserProfile
        fields = ['profile', 'preferences', 'onboarding_completed_at']


@extend_schema_serializer(component_name="LoginRecordObject")
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
