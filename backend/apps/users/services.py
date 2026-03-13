"""
Authentication services for different auth providers.
"""
import logging
import secrets
from abc import ABC, abstractmethod
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User

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


# ---------------------------------------------------------------------------
# OAuth provider registry & base class
# ---------------------------------------------------------------------------

class BaseOAuthService(ABC):
    """Abstract base for OAuth provider services.

    Subclasses must set class-level attributes and implement
    ``_parse_user_info`` to normalize the provider's user-info response.
    """

    # Subclasses override these
    provider_name: str = ""          # e.g. "github", "google", "nycu-oauth"
    authorize_url_setting: str = ""  # settings attr name for authorize URL
    token_url_setting: str = ""      # settings attr name for token URL
    userinfo_url_setting: str = ""   # settings attr name for userinfo URL
    client_id_setting: str = ""      # settings attr name for client ID
    client_secret_setting: str = ""  # settings attr name for client secret
    default_scope: str = ""          # space-separated scopes

    # ---- public API (shared across all providers) ----

    @classmethod
    def get_authorization_url(cls, redirect_uri: str, state: str) -> str:
        params = {
            'client_id': getattr(settings, cls.client_id_setting),
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'state': state,
            'scope': cls.default_scope,
        }
        base = getattr(settings, cls.authorize_url_setting)
        return f"{base}?{urlencode(params)}"

    @classmethod
    def exchange_code(cls, code: str, redirect_uri: str) -> dict:
        """Exchange authorization code → access_token + normalized user_info."""
        access_token = cls._exchange_token(code, redirect_uri)
        user_info = cls._fetch_user_info(access_token)
        return {
            'access_token': access_token,
            'user_info': user_info,
        }

    @classmethod
    def get_or_create_user(cls, oauth_data: dict) -> User:
        """Find existing user by email (auto-merge) or create a new one.

        Account-linking rule: lookup by email only, regardless of
        ``auth_provider``.  If found, update ``auth_provider`` to this
        provider so the field reflects the most recent login method.
        """
        user_info = oauth_data['user_info']
        email = user_info.get('email')
        username = user_info.get('username') or ''
        oauth_id = user_info.get('oauth_id') or ''

        if email:
            try:
                user = User.objects.get(email=email)
                # Update provider to latest login method
                user.auth_provider = cls.provider_name
                if oauth_id:
                    user.oauth_id = oauth_id
                # Update username if changed and available
                if username and user.username != username:
                    if not User.objects.filter(username=username).exclude(id=user.id).exists():
                        user.username = username
                user.email_verified = True
                user.save()
                return user
            except User.DoesNotExist:
                pass

        # Create new user with unique username
        if not username:
            username = (email or '').split('@')[0] or 'user'
        counter = 1
        original_username = username
        while User.objects.filter(username=username).exists():
            username = f"{original_username}{counter}"
            counter += 1

        user = User.objects.create(
            username=username,
            email=email,
            auth_provider=cls.provider_name,
            oauth_id=oauth_id,
            email_verified=True,
            is_active=True,
        )
        return user

    # ---- internal helpers ----

    @classmethod
    def _exchange_token(cls, code: str, redirect_uri: str) -> str:
        try:
            resp = requests.post(
                getattr(settings, cls.token_url_setting),
                data={
                    'grant_type': 'authorization_code',
                    'code': code,
                    'redirect_uri': redirect_uri,
                    'client_id': getattr(settings, cls.client_id_setting),
                    'client_secret': getattr(settings, cls.client_secret_setting),
                },
                headers={'Accept': 'application/json'},
                timeout=(5, 15),
            )
        except requests.RequestException as exc:
            raise Exception('Failed to connect to OAuth token endpoint') from exc

        if resp.status_code != 200:
            raise Exception('Failed to exchange authorization code')

        return resp.json()['access_token']

    @classmethod
    def _fetch_user_info(cls, access_token: str) -> dict:
        try:
            resp = requests.get(
                getattr(settings, cls.userinfo_url_setting),
                headers={'Authorization': f"Bearer {access_token}"},
                timeout=(5, 15),
            )
        except requests.RequestException as exc:
            raise Exception('Failed to connect to OAuth userinfo endpoint') from exc

        if resp.status_code != 200:
            raise Exception('Failed to get user information')

        return cls._parse_user_info(resp.json())

    @classmethod
    @abstractmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        """Return ``{'username': str, 'email': str, 'oauth_id': str}``."""
        ...


# ---------------------------------------------------------------------------
# Concrete providers
# ---------------------------------------------------------------------------

class NYCUOAuthService(BaseOAuthService):
    provider_name = 'nycu-oauth'
    authorize_url_setting = 'NYCU_OAUTH_AUTHORIZE_URL'
    token_url_setting = 'NYCU_OAUTH_TOKEN_URL'
    userinfo_url_setting = 'NYCU_OAUTH_USERINFO_URL'
    client_id_setting = 'NYCU_OAUTH_CLIENT_ID'
    client_secret_setting = 'NYCU_OAUTH_CLIENT_SECRET'
    default_scope = 'profile'

    @classmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        return {
            'username': raw.get('username'),
            'email': raw.get('email'),
            'oauth_id': raw.get('sub') or raw.get('id'),
        }


class GitHubOAuthService(BaseOAuthService):
    provider_name = 'github'
    authorize_url_setting = 'GITHUB_OAUTH_AUTHORIZE_URL'
    token_url_setting = 'GITHUB_OAUTH_TOKEN_URL'
    userinfo_url_setting = 'GITHUB_OAUTH_USERINFO_URL'
    client_id_setting = 'GITHUB_OAUTH_CLIENT_ID'
    client_secret_setting = 'GITHUB_OAUTH_CLIENT_SECRET'
    default_scope = 'read:user user:email'

    @classmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        return {
            'username': raw.get('login'),
            'email': raw.get('email'),
            'oauth_id': str(raw.get('id', '')),
        }

    @classmethod
    def _fetch_user_info(cls, access_token: str) -> dict:
        """Override to also fetch private email from /user/emails."""
        info = super()._fetch_user_info(access_token)

        # GitHub may not expose email in /user — fetch from /user/emails
        if not info.get('email'):
            try:
                resp = requests.get(
                    getattr(settings, 'GITHUB_OAUTH_USER_EMAILS_URL',
                            'https://api.github.com/user/emails'),
                    headers={
                        'Authorization': f"Bearer {access_token}",
                        'Accept': 'application/json',
                    },
                    timeout=(5, 15),
                )
                if resp.status_code == 200:
                    emails = resp.json()
                    primary = next(
                        (e['email'] for e in emails
                         if e.get('primary') and e.get('verified')),
                        None,
                    )
                    if primary:
                        info['email'] = primary
            except requests.RequestException:
                logger.warning('Failed to fetch GitHub user emails')

        return info


class GoogleOAuthService(BaseOAuthService):
    provider_name = 'google'
    authorize_url_setting = 'GOOGLE_OAUTH_AUTHORIZE_URL'
    token_url_setting = 'GOOGLE_OAUTH_TOKEN_URL'
    userinfo_url_setting = 'GOOGLE_OAUTH_USERINFO_URL'
    client_id_setting = 'GOOGLE_OAUTH_CLIENT_ID'
    client_secret_setting = 'GOOGLE_OAUTH_CLIENT_SECRET'
    default_scope = 'openid email profile'

    @classmethod
    def _parse_user_info(cls, raw: dict) -> dict:
        name = raw.get('name') or raw.get('email', '').split('@')[0]
        return {
            'username': name,
            'email': raw.get('email'),
            'oauth_id': raw.get('sub'),
        }


# Provider registry for view dispatch
OAUTH_PROVIDERS: dict[str, type[BaseOAuthService]] = {
    'nycu': NYCUOAuthService,
    'github': GitHubOAuthService,
    'google': GoogleOAuthService,
}


def get_oauth_service(provider: str) -> type[BaseOAuthService] | None:
    """Return the service class for *provider*, or ``None``."""
    return OAUTH_PROVIDERS.get(provider)


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
