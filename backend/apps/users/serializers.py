"""
Serializers for user authentication and profile management.
"""
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from .models import User, UserProfile


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile."""
    
    class Meta:
        model = UserProfile
        fields = [
            'solved_count',
            'submission_count',
            'accept_rate',
            'preferred_language',
        ]
        read_only_fields = ['solved_count', 'submission_count', 'accept_rate']


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user model."""
    profile = UserProfileSerializer(read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'role',
            'auth_provider',
            'email_verified',
            'is_active',
            'date_joined',
            'last_login_at',
            'profile',
        ]
        read_only_fields = [
            'id',
            'auth_provider',
            'email_verified',
            'date_joined',
            'last_login_at',
        ]


class RegisterSerializer(serializers.Serializer):
    """Serializer for user registration with email/password."""
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
    """Serializer for email/password login."""
    email = serializers.CharField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )


class OAuthCallbackSerializer(serializers.Serializer):
    """Serializer for OAuth callback."""
    code = serializers.CharField(required=True)
    redirect_uri = serializers.URLField(required=True)


class TokenRefreshSerializer(serializers.Serializer):
    """Serializer for token refresh."""
    refresh = serializers.CharField(required=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for password reset request."""
    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for password reset confirmation."""
    token = serializers.CharField(required=True)
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
    
    
    def validate(self, attrs):
        """Validate passwords match."""
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({
                'password_confirm': '密碼不一致'
            })
        
        try:
            validate_password(attrs['password'])
        except ValidationError as e:
            raise serializers.ValidationError({
                'password': list(e.messages)
            })
        
        return attrs


class UserSearchSerializer(serializers.ModelSerializer):
    """Serializer for user search results in admin interface."""
    
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'role',
            'auth_provider',
            'email_verified',
            'last_login_at',
            'is_active',
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
