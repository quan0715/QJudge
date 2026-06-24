"""
Authentication services for different auth providers.
"""
import logging
import secrets
import hashlib
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from .auth.options import get_auth_options, is_email_password_auth_enabled
# Compatibility exports: new code should import OAuth providers from apps.users.auth.
from .auth.legacy import (
    BaseOAuthService,
    GitHubOAuthService,
    GoogleOAuthService,
    NYCUOAuthService,
    OAUTH_PROVIDERS,
    get_oauth_service,
)
from .models import TeacherActivationInvite, User

logger = logging.getLogger(__name__)


TEACHER_ACTIVATION_TTL = timedelta(days=7)


class JWTService:
    """Service for JWT token management."""
    
    @staticmethod
    def generate_tokens(user):
        """Generate access and refresh tokens for user."""
        refresh = RefreshToken.for_user(user)
        
        # Update last login time
        user.last_login_at = timezone.now()
        user.save(update_fields=['last_login_at'])
        
        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'expires_in': int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        }
    
    @staticmethod
    def get_user_response_data(user, tokens):
        """Format user data with tokens for API response."""
        from .serializers import UserSerializer
        user = User.objects.select_related("profile").get(pk=user.pk)

        return {
            'success': True,
            'data': {
                'access_token': tokens['access'],
                'refresh_token': tokens['refresh'],
                'expires_in': tokens['expires_in'],
                'user': UserSerializer(user).data,
            }
        }


class EmailAuthService:
    """Service for email/password authentication."""
    
    @staticmethod
    def login(email, password):
        """
        Authenticate user with email and password.
        
        Returns:
            User object if authentication successful, None otherwise
        """
        from django.db.models import Q
        try:
            # Check if input is email or username
            user = User.objects.get(
                Q(email=email) | Q(username=email),
                auth_provider='email'
            )
        except User.DoesNotExist:
            return None
        
        # Check password
        if not user.check_password(password):
            return None
        
        if not user.is_active:
            return None
        
        return user
    
    @staticmethod
    def generate_verification_token():
        """Generate email verification token."""
        return secrets.token_urlsafe(32)

    @staticmethod
    def generate_password_reset_token():
        """Generate password reset token."""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def send_verification_email(user):
        """Send verification email to user."""
        token = EmailAuthService.generate_verification_token()
        user.email_verification_token = token
        user.email_verification_expires_at = timezone.now() + timedelta(hours=24)
        user.save()
        
        # TODO: Implement actual email sending
        # For now, just return the token
        verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        
        return verification_url
    
    @staticmethod
    def verify_email(token):
        """Verify email with token."""
        try:
            user = User.objects.get(
                email_verification_token=token,
                email_verification_expires_at__gt=timezone.now()
            )
            user.email_verified = True
            user.email_verification_token = None
            user.email_verification_expires_at = None
            user.save()
            return user
        except User.DoesNotExist:
            return None

    @staticmethod
    def issue_password_reset(user):
        """Issue a password reset token for the given user."""
        token = EmailAuthService.generate_password_reset_token()
        user.password_reset_token = token
        user.password_reset_expires_at = timezone.now() + timedelta(hours=1)
        user.save(update_fields=['password_reset_token', 'password_reset_expires_at'])
        return f"{settings.FRONTEND_URL}/reset-password?token={token}"

    @staticmethod
    def get_user_by_password_reset_token(token):
        """Return active email-auth user by valid reset token."""
        try:
            return User.objects.get(
                auth_provider='email',
                is_active=True,
                password_reset_token=token,
                password_reset_expires_at__gt=timezone.now(),
            )
        except User.DoesNotExist:
            return None

    @staticmethod
    def generate_teacher_activation_token():
        """Generate a one-time token for teacher activation."""
        return secrets.token_urlsafe(32)

    @staticmethod
    def hash_teacher_activation_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def build_teacher_activation_url(token: str) -> str:
        return f"{settings.FRONTEND_URL}/teacher-activation?token={token}"

    @staticmethod
    def get_teacher_activation_invite_by_token(token: str):
        token = (token or "").strip()
        if not token:
            return None
        digest = EmailAuthService.hash_teacher_activation_token(token)
        return TeacherActivationInvite.objects.select_related(
            "created_by",
            "target_user",
            "consumed_by",
        ).filter(token_digest=digest).first()

    @staticmethod
    def issue_teacher_activation_invite(created_by: User):
        token = EmailAuthService.generate_teacher_activation_token()
        invite = TeacherActivationInvite.objects.create(
            email="",
            token_digest=EmailAuthService.hash_teacher_activation_token(token),
            created_by=created_by,
            target_user=None,
            expires_at=timezone.now() + TEACHER_ACTIVATION_TTL,
        )
        activation_url = EmailAuthService.build_teacher_activation_url(token)
        return invite, activation_url
