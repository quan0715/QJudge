"""
Authentication services for different auth providers.
"""
import requests
import secrets
from datetime import timedelta
from urllib.parse import urlencode
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
import logging

logger = logging.getLogger(__name__)


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

        query_string = urlencode(params)
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
        try:
            token_response = requests.post(
                settings.NYCU_OAUTH_TOKEN_URL,
                data={
                    'grant_type': 'authorization_code',
                    'code': code,
                    'redirect_uri': redirect_uri,
                    'client_id': settings.NYCU_OAUTH_CLIENT_ID,
                    'client_secret': settings.NYCU_OAUTH_CLIENT_SECRET,
                },
                timeout=(5, 15),
            )
        except requests.RequestException as exc:
            raise Exception('Failed to connect to OAuth token endpoint') from exc
        
        if token_response.status_code != 200:
            raise Exception('Failed to exchange authorization code')
        
        token_data = token_response.json()
        access_token = token_data['access_token']
        
        # Get user info
        try:
            userinfo_response = requests.get(
                settings.NYCU_OAUTH_USERINFO_URL,
                headers={'Authorization': f"Bearer {access_token}"},
                timeout=(5, 15),
            )
        except requests.RequestException as exc:
            raise Exception('Failed to connect to OAuth userinfo endpoint') from exc
        
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
            oauth_data: dict with 'username', 'email'
        
        Returns:
            User object
        """
        user_info = oauth_data['user_info']
        email = user_info.get('email')
        username = user_info['username']
        
        # Try to find existing user by email and auth_provider
        if email:
            try:
                user = User.objects.get(
                    auth_provider='nycu-oauth',
                    email=email
                )
                
                # Update username if changed and available
                if username and user.username != username:
                    if not User.objects.filter(username=username).exclude(id=user.id).exists():
                        user.username = username
                user.email_verified = True
                user.save()
                return user
            except User.DoesNotExist:
                pass
        
        # Create new user
        counter = 1
        original_username = username
        while User.objects.filter(username=username).exists():
            username = f"{original_username}{counter}"
            counter += 1

        user = User.objects.create(
            username=username,
            email=email,
            auth_provider='nycu-oauth',
            email_verified=True,
            is_active=True,
        )

        return user


class APIKeyService:
    """Service for managing user API keys and validation."""

    @staticmethod
    def validate_anthropic_key(api_key: str) -> tuple[bool, str]:
        """驗證 Anthropic API Key 是否有效

        Args:
            api_key (str): 要驗證的 API Key

        Returns:
            tuple[bool, str]: (是否有效, 錯誤訊息)
        """
        try:
            # 動態導入 anthropic，避免硬依賴
            try:
                import anthropic
            except ImportError:
                logger.error('anthropic package not installed')
                return (False, 'anthropic package not installed')

            # 使用提供的 API Key 初始化 client
            client = anthropic.Anthropic(api_key=api_key)

            # 發送最小測試請求（使用最便宜的 haiku 模型）
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=10,
                messages=[{"role": "user", "content": "test"}]
            )

            logger.info(f'Successfully validated API key')
            return (True, "")

        except Exception as e:
            error_msg = str(e)
            logger.error(f'Failed to validate API key: {error_msg}')

            # 根據不同錯誤類型返回相應訊息
            if 'authentication' in error_msg.lower() or 'invalid' in error_msg.lower():
                return (False, "Invalid API key")
            elif 'rate' in error_msg.lower():
                return (False, "Rate limit exceeded")
            else:
                return (False, f"Validation failed: {error_msg}")

    @staticmethod
    def calculate_cost(input_tokens: int, output_tokens: int, model: str = 'haiku') -> int:
        """計算費用（美分）

        Args:
            input_tokens (int): 輸入 tokens 數
            output_tokens (int): 輸出 tokens 數
            model (str): 使用的模型名稱（haiku/sonnet/opus）

        Returns:
            int: 費用（美分）
        """
        # Anthropic 定價（每百萬 tokens 的 USD）
        # 更新至最新定價
        pricing = {
            'haiku': (0.80, 4.00),      # 3.5-haiku
            'sonnet': (3.00, 15.00),    # 3.5-sonnet
            'opus': (15.00, 75.00),     # 3-opus
        }

        input_price, output_price = pricing.get(model, pricing['haiku'])

        # 計算成本
        cost_usd = (
            (input_tokens / 1_000_000) * input_price +
            (output_tokens / 1_000_000) * output_price
        )

        # 轉換為美分
        return int(round(cost_usd * 100))
