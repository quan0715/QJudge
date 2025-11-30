"""
Authentication services for different auth providers.
"""
import requests
import secrets
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User


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
        return {
            'success': True,
            'data': {
                'access_token': tokens['access'],
                'refresh_token': tokens['refresh'],
                'expires_in': tokens['expires_in'],
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'role': user.role,
                    'auth_provider': user.auth_provider,
                    'email_verified': user.email_verified,
                }
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
        try:
            user = User.objects.get(email=email, auth_provider='email')
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


class NYCUOAuthService:
    """Service for NYCU OAuth authentication."""
    
    @staticmethod
    def get_authorization_url(redirect_uri, state):
        """Generate NYCU OAuth authorization URL."""
        params = {
            'client_id': settings.NYCU_OAUTH_CLIENT_ID,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'state': state,
            'scope': 'profile',
        }
        
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        return f"{settings.NYCU_OAUTH_AUTHORIZE_URL}?{query_string}"
    
    @staticmethod
    def exchange_code(code, redirect_uri):
        """
        Exchange authorization code for access token and user info.
        
        Returns:
            dict: {
                'access_token': str,
                'user_info': {
                    'username': str,
                    'email': str,
                    'oauth_id': str,
                }
            }
        
        Raises:
            Exception: If OAuth exchange fails
        """
        # Exchange code for access token
        token_response = requests.post(
            settings.NYCU_OAUTH_TOKEN_URL,
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri,
                'client_id': settings.NYCU_OAUTH_CLIENT_ID,
                'client_secret': settings.NYCU_OAUTH_CLIENT_SECRET,
            }
        )
        
        if token_response.status_code != 200:
            raise Exception('Failed to exchange authorization code')
        
        token_data = token_response.json()
        access_token = token_data['access_token']
        
        # Get user info
        userinfo_response = requests.get(
            settings.NYCU_OAUTH_USERINFO_URL,
            headers={'Authorization': f"Bearer {access_token}"}
        )
        
        if userinfo_response.status_code != 200:
            raise Exception('Failed to get user information')
        
        user_info = userinfo_response.json()
        
        return {
            'access_token': access_token,
            'user_info': {
                'username': user_info.get('username'),
                'email': user_info.get('email'),
                'oauth_id': user_info.get('sub') or user_info.get('id'),
            }
        }
    
    @staticmethod
    def get_or_create_user(oauth_data):
        """
        Get or create user from NYCU OAuth data.
        
        Args:
            oauth_data: dict with 'username', 'email', 'oauth_id'
        
        Returns:
            User object
        """
        user_info = oauth_data['user_info']
        
        # Try to find existing user by OAuth ID
        try:
            user = User.objects.get(
                auth_provider='nycu-oauth',
                oauth_id=user_info['oauth_id']
            )
            # Update user info
            user.email = user_info['email']
            user.username = user_info['username']
            user.email_verified = True
            user.save()
            return user
        except User.DoesNotExist:
            pass
        
        # Try to find by email
        try:
            user = User.objects.get(email=user_info['email'])
            # Link OAuth account
            user.auth_provider = 'nycu-oauth'
            user.oauth_id = user_info['oauth_id']
            user.email_verified = True
            user.save()
            return user
        except User.DoesNotExist:
            pass
        
        # Create new user
        # Ensure unique username
        username = user_info['username']
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f"{user_info['username']}{counter}"
            counter += 1
        
        user = User.objects.create(
            username=username,
            email=user_info['email'],
            auth_provider='nycu-oauth',
            oauth_id=user_info['oauth_id'],
            email_verified=True,
            is_active=True,
        )
        
        return user
