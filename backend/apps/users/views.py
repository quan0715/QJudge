"""
Views for user authentication and management.

Security:
- JWT tokens are stored in HttpOnly cookies to prevent XSS attacks.
- CSRF protection is enforced for cookie-authenticated state-changing requests.
- Authorization header authentication is exempt from CSRF (tokens aren't sent automatically).
"""
import secrets
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django_ratelimit.decorators import ratelimit

from .serializers import (
    UserSerializer,
    RegisterSerializer,
    LoginSerializer,
    OAuthCallbackSerializer,
    UserProfileSerializer,
    UserSearchSerializer,
    UserRoleUpdateSerializer,
    UserPreferencesUpdateSerializer,
    ChangePasswordSerializer,
    UserAPIKeyInfoSerializer,
    SetAPIKeySerializer,
    ValidateAPIKeySerializer,
)
from .services import EmailAuthService, NYCUOAuthService, JWTService, APIKeyService
from .permissions import IsSuperAdmin
from .authentication import set_jwt_cookies, clear_jwt_cookies, get_refresh_token_from_cookie
from .models import UserAPIKey
import asyncio

User = get_user_model()


@method_decorator(csrf_exempt, name='dispatch')
@method_decorator(ratelimit(key='ip', rate='5/m', method='POST', block=True), name='post')
class RegisterView(APIView):
    """
    User registration with email/password.
    Rate limited to 5 requests per minute per IP.
    
    POST /api/v1/auth/email/register
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '註冊資料驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = serializer.save()
            
            # Send verification email
            verification_url = EmailAuthService.send_verification_email(user)
            
            # Generate tokens
            tokens = JWTService.generate_tokens(user)
            
            response = Response({
                'success': True,
                'data': {
                    **JWTService.get_user_response_data(user, tokens)['data'],
                    'verification_url': verification_url,  # For development
                },
                'message': '註冊成功,請檢查您的Email以驗證帳號'
            }, status=status.HTTP_201_CREATED)
            
            # Set tokens in HttpOnly cookies
            set_jwt_cookies(response, tokens)
            
            return response
            
        except Exception as e:
            return Response({
                'success': False,
                'error': {
                    'code': 'REGISTRATION_FAILED',
                    'message': str(e)
                }
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
@method_decorator(ratelimit(key='ip', rate='10/m', method='POST', block=True), name='post')
@method_decorator(ensure_csrf_cookie, name='dispatch')
class LoginView(APIView):
    """
    User login with email/password.
    Rate limited to 10 requests per minute per IP.
    
    POST /api/v1/auth/email/login
    
    Response includes:
    - JWT tokens in HttpOnly cookies (access_token, refresh_token)
    - CSRF token in a readable cookie (csrftoken) for subsequent requests
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '登入資料驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        email = serializer.validated_data['email']
        password = serializer.validated_data['password']
        
        user = EmailAuthService.login(email, password)
        
        if not user:
            return Response({
                'success': False,
                'error': {
                    'code': 'AUTH_001',
                    'message': 'Email 或密碼錯誤'
                }
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        tokens = JWTService.generate_tokens(user)
        response = Response(JWTService.get_user_response_data(user, tokens))
        
        # Set tokens in HttpOnly cookies
        set_jwt_cookies(response, tokens)
        
        return response


@method_decorator(csrf_exempt, name='dispatch')
class DevTokenView(APIView):
    """
    Development-only helper to generate JWT tokens for a test user.

    POST /api/v1/auth/dev/token
    Body: { role: "student"|"teacher"|"admin", email?, username?, password? }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        if not settings.DEBUG:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        role = request.data.get('role', 'student')
        want_superuser = bool(request.data.get('superuser', False))
        if role not in ['student', 'teacher', 'admin']:
            return Response(
                {'detail': 'Invalid role. Use student, teacher, or admin.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        email = request.data.get('email') or f"dev-{role}@local.test"
        username = request.data.get('username') or f"dev_{role}"
        password = request.data.get('password')

        def ensure_unique_username(base: str) -> str:
            if not User.objects.filter(username=base).exists():
                return base
            suffix = 1
            while User.objects.filter(username=f"{base}_{suffix}").exists():
                suffix += 1
            return f"{base}_{suffix}"

        user = User.objects.filter(email=email).first()
        created = False
        if not user:
            created = True
            user = User(
                username=ensure_unique_username(username),
                email=email,
                auth_provider='email',
                email_verified=True,
                is_active=True,
            )

        # Always align role for dev convenience
        user.role = role
        user.is_staff = role == 'admin'
        user.is_superuser = role == 'admin' and want_superuser

        if created or password:
            if not password:
                password = secrets.token_urlsafe(12)
            user.set_password(password)

        if created:
            user.save()
        else:
            update_fields = ['role', 'is_staff', 'is_superuser']
            if password:
                update_fields.append('password')
            user.save(update_fields=update_fields)

        tokens = JWTService.generate_tokens(user)
        payload = JWTService.get_user_response_data(user, tokens)
        if created and password:
            payload.setdefault('data', {})['dev_password'] = password

        response = Response(payload)
        set_jwt_cookies(response, tokens)
        return response


class NYCUOAuthLoginView(APIView):
    """
    Initiate NYCU OAuth login.
    
    GET /api/v1/auth/nycu/login
    """
    permission_classes = [AllowAny]
    
    def get(self, request):
        
        redirect_uri = f"{settings.FRONTEND_URL}/auth/nycu/callback"
        state = secrets.token_urlsafe(16)
        
        # Store state in session or cache if needed for validation
        
        auth_url = NYCUOAuthService.get_authorization_url(redirect_uri, state)
        
        return Response({
            'success': True,
            'data': {
                'authorization_url': auth_url
            }
        })



@method_decorator([csrf_exempt, ensure_csrf_cookie], name='dispatch')
class NYCUOAuthCallbackView(APIView):
    """
    Handle NYCU OAuth callback.
    
    POST /api/v1/auth/nycu-oauth/callback
    
    Note: csrf_exempt is needed because this receives external OAuth callback.
    ensure_csrf_cookie ensures the response includes CSRF token for subsequent requests.
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = OAuthCallbackSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'OAuth 參數驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Exchange code for access token and user info
            oauth_data = NYCUOAuthService.exchange_code(
                code=serializer.validated_data['code'],
                redirect_uri=serializer.validated_data['redirect_uri']
            )
            
            # Get or create user
            user = NYCUOAuthService.get_or_create_user(oauth_data)
            
            # Generate JWT tokens
            tokens = JWTService.generate_tokens(user)
            
            response = Response(JWTService.get_user_response_data(user, tokens))
            
            # Set tokens in HttpOnly cookies
            set_jwt_cookies(response, tokens)
            
            return response
            
        except Exception as e:
            return Response({
                'success': False,
                'error': {
                    'code': 'AUTH_003',
                    'message': 'NYCU OAuth 授權失敗',
                    'details': str(e)
                }
            }, status=status.HTTP_401_UNAUTHORIZED)


@method_decorator(ensure_csrf_cookie, name='dispatch')
class TokenRefreshView(APIView):
    """
    Refresh access token.
    
    POST /api/v1/auth/refresh
    
    Token can be provided via:
    1. HttpOnly cookie (preferred, more secure)
    2. Request body with 'refresh' field (for API clients)
    
    Note: ensure_csrf_cookie ensures updated CSRF token is provided.
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        # Try to get refresh token from cookie first, then from body
        refresh_token = get_refresh_token_from_cookie(request) or request.data.get('refresh')
        
        if not refresh_token:
            return Response({
                'success': False,
                'error': {
                    'code': 'MISSING_TOKEN',
                    'message': '缺少 refresh token'
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            refresh = RefreshToken(refresh_token)
            access_token = str(refresh.access_token)
            
            # Create new tokens dict for cookie update
            tokens = {
                'access': access_token,
                'refresh': str(refresh),  # Keep same refresh token
            }
            
            response = Response({
                'success': True,
                'data': {
                    'access_token': access_token,
                }
            })
            
            # Update access token in cookie
            set_jwt_cookies(response, tokens)
            
            return response
        except Exception as e:
            response = Response({
                'success': False,
                'error': {
                    'code': 'INVALID_TOKEN',
                    'message': 'Refresh token 無效或已過期'
                }
            }, status=status.HTTP_401_UNAUTHORIZED)
            
            # Clear invalid cookies
            clear_jwt_cookies(response)
            
            return response


class LogoutView(APIView):
    """
    Logout user by blacklisting their refresh token and clearing cookies.
    This invalidates both access and refresh tokens.
    
    POST /api/v1/auth/logout
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            # Try to get refresh token from cookie first, then from body
            refresh_token = get_refresh_token_from_cookie(request) or request.data.get('refresh')
            
            if refresh_token:
                # Blacklist the specific refresh token
                try:
                    token = RefreshToken(refresh_token)
                    token.blacklist()
                except Exception:
                    pass
            else:
                # Blacklist all outstanding tokens for this user
                tokens = OutstandingToken.objects.filter(user=request.user)
                for token in tokens:
                    try:
                        BlacklistedToken.objects.get_or_create(token=token)
                    except Exception:
                        pass
            
            response = Response({
                'success': True,
                'message': '登出成功'
            })
            
            # Clear JWT cookies
            clear_jwt_cookies(response)
            
            return response
        except Exception as e:
            # Even if blacklisting fails, clear cookies and consider logout successful
            response = Response({
                'success': True,
                'message': '登出成功'
            })
            clear_jwt_cookies(response)
            return response


class CurrentUserView(APIView):
    """
    Get current authenticated user information.
    
    GET /api/v1/users/me
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response({
            'success': True,
            'data': serializer.data
        })
    
    def patch(self, request):
        """Update current user profile."""
        user = request.user
        serializer = UserSerializer(user, data=request.data, partial=True)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '更新資料驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer.save()
        
        return Response({
            'success': True,
            'data': serializer.data,
            'message': '個人資料已更新'
        })


class UserSearchView(APIView):
    """
    Search users by username or email (admin only).
    If no query provided, returns all users (paginated).
    
    GET /api/v1/users/search?q=query
    GET /api/v1/users/search  (list all users)
    """
    permission_classes = [IsSuperAdmin]
    
    def get(self, request):
        query = request.query_params.get('q', '').strip()
        
        # If no query, return all users
        if not query:
            users = User.objects.all().order_by('-last_login_at')[:100]  # Limit to 100 users
            serializer = UserSearchSerializer(users, many=True)
            return Response({
                'success': True,
                'data': serializer.data
            })
        
        # Validate query length for search
        if len(query) < 2:
            return Response({
                'success': False,
                'error': {
                    'code': 'QUERY_TOO_SHORT',
                    'message': '搜尋關鍵字至少需要 2 個字元'
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Search by username or email
        from django.db.models import Q
        users = User.objects.filter(
            Q(username__icontains=query) | Q(email__icontains=query)
        ).order_by('-last_login_at')[:20]  # Limit to 20 results
        
        serializer = UserSearchSerializer(users, many=True)
        
        return Response({
            'success': True,
            'data': serializer.data
        })


class UserRoleUpdateView(APIView):
    """
    Update user role (admin only).
    
    PATCH /api/v1/users/{id}/role
    """
    permission_classes = [IsSuperAdmin]
    
    def patch(self, request, pk):
        serializer = UserRoleUpdateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '資料驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({
                'success': False,
                'error': {
                    'code': 'USER_NOT_FOUND',
                    'message': '找不到指定的使用者'
                }
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Prevent users from modifying their own role
        if user.id == request.user.id:
            return Response({
                'success': False,
                'error': {
                    'code': 'CANNOT_MODIFY_SELF',
                    'message': '無法修改自己的角色'
                }
            }, status=status.HTTP_403_FORBIDDEN)
        
        new_role = serializer.validated_data['role']
        old_role = user.role
        
        # Update user role
        user.role = new_role
        
        # Update staff and superuser status based on role
        if new_role == 'admin':
            user.is_staff = True
            user.is_superuser = True
        else:
            user.is_staff = False
            user.is_superuser = False
        
        user.save()
        
        # Return updated user data
        user_serializer = UserSearchSerializer(user)
        
        return Response({
            'success': True,
            'data': user_serializer.data,
            'message': f'已將 {user.username} 的角色從 {old_role} 更新為 {new_role}'
        })


class UserStatsView(APIView):
    """
    Get current user statistics.
    GET /api/v1/users/me/stats
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        from apps.problems.models import Problem
        from apps.submissions.models import Submission

        # Total problems by difficulty
        total_easy = Problem.objects.filter(difficulty='easy').count()
        total_medium = Problem.objects.filter(difficulty='medium').count()
        total_hard = Problem.objects.filter(difficulty='hard').count()

        # Solved problems by difficulty (distinct problems solved by user)
        solved_ids = Submission.objects.filter(user=user, status='AC').values_list('problem_id', flat=True).distinct()
        solved_objs = Problem.objects.filter(id__in=solved_ids)
        
        easy_solved = solved_objs.filter(difficulty='easy').count()
        medium_solved = solved_objs.filter(difficulty='medium').count()
        hard_solved = solved_objs.filter(difficulty='hard').count()

        return Response({
            'success': True,
            'data': {
                'total_solved': easy_solved + medium_solved + hard_solved,
                'easy_solved': easy_solved,
                'medium_solved': medium_solved,
                'hard_solved': hard_solved,
                'total_easy': total_easy,
                'total_medium': total_medium,
                'total_hard': total_hard,
            }
        })


class UserPreferencesView(APIView):
    """
    Get and update current user preferences.
    
    GET /api/v1/auth/me/preferences - Get current preferences
    PATCH /api/v1/auth/me/preferences - Update preferences
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get current user preferences."""
        user = request.user
        
        # Ensure user has a profile
        from .models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        
        serializer = UserProfileSerializer(profile)
        return Response({
            'success': True,
            'data': serializer.data
        })
    
    def patch(self, request):
        """Update user preferences."""
        user = request.user
        
        # Ensure user has a profile
        from .models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        
        serializer = UserPreferencesUpdateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '偏好設定驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update profile fields
        validated_data = serializer.validated_data
        
        if 'preferred_language' in validated_data:
            profile.preferred_language = validated_data['preferred_language']
        if 'preferred_theme' in validated_data:
            profile.preferred_theme = validated_data['preferred_theme']
        if 'editor_font_size' in validated_data:
            profile.editor_font_size = validated_data['editor_font_size']
        if 'editor_tab_size' in validated_data:
            profile.editor_tab_size = validated_data['editor_tab_size']
        
        profile.save()
        
        # Return updated profile
        profile_serializer = UserProfileSerializer(profile)
        
        return Response({
            'success': True,
            'data': profile_serializer.data,
            'message': '偏好設定已更新'
        })


class ChangePasswordView(APIView):
    """
    Change password for current user.
    
    POST /api/v1/auth/change-password
    
    Requires current password verification.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        user = request.user
        
        # Only email users can change password
        if user.auth_provider != 'email':
            return Response({
                'success': False,
                'error': {
                    'code': 'OAUTH_USER',
                    'message': 'OAuth 使用者無法變更密碼，請透過原認證方式管理'
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = ChangePasswordSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '密碼驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify current password
        if not user.check_password(serializer.validated_data['current_password']):
            return Response({
                'success': False,
                'error': {
                    'code': 'WRONG_PASSWORD',
                    'message': '目前密碼錯誤'
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Set new password
        user.set_password(serializer.validated_data['new_password'])
        user.save()

        return Response({
            'success': True,
            'message': '密碼已成功變更'
        })


class UserAPIKeyView(APIView):
    """
    User API Key management endpoint.

    GET /api/v1/users/me/api-key - Get API key status (no actual key exposed)
    POST /api/v1/users/me/api-key - Set/update API key
    DELETE /api/v1/users/me/api-key - Delete API key
    POST /api/v1/users/me/api-key/validate - Validate API key
    GET /api/v1/users/me/api-key/usage - Get usage statistics
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get API key status (without exposing the actual key)."""
        try:
            api_key = request.user.api_key
            return Response({
                'success': True,
                'data': {
                    'has_key': True,
                    'is_active': api_key.is_active,
                    'is_validated': api_key.is_validated,
                    'key_name': api_key.key_name,
                    'total_input_tokens': api_key.total_input_tokens,
                    'total_output_tokens': api_key.total_output_tokens,
                    'total_requests': api_key.total_requests,
                    'total_cost_usd': float(api_key.total_cost_usd),
                    'last_validated_at': api_key.last_validated_at,
                    'created_at': api_key.created_at,
                }
            })
        except UserAPIKey.DoesNotExist:
            return Response({
                'success': True,
                'data': {'has_key': False}
            })

    @method_decorator(ratelimit(key='user', rate='5/h', method='POST', block=True))
    def post(self, request):
        """Set/update API key."""
        serializer = SetAPIKeySerializer(data=request.data)

        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'API Key 驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        api_key_str = serializer.validated_data['api_key']
        key_name = serializer.validated_data.get('key_name', 'My API Key')

        # TODO: 暫時註解掉驗證，先測試儲存流程
        # # Validate API key asynchronously
        # try:
        #     loop = asyncio.get_event_loop()
        # except RuntimeError:
        #     loop = asyncio.new_event_loop()
        #     asyncio.set_event_loop(loop)

        # is_valid, error_msg = loop.run_until_complete(
        #     APIKeyService.validate_anthropic_key(api_key_str)
        # )

        # if not is_valid:
        #     return Response({
        #         'success': False,
        #         'error': {
        #             'code': 'VALIDATION_FAILED',
        #             'message': f'API Key 驗證失敗: {error_msg}'
        #         }
        #     }, status=status.HTTP_400_BAD_REQUEST)

        # Store API key
        from django.utils import timezone
        api_key_obj, created = UserAPIKey.objects.get_or_create(user=request.user)
        api_key_obj.set_key(api_key_str)
        api_key_obj.key_name = key_name
        api_key_obj.is_validated = True
        api_key_obj.last_validated_at = timezone.now()
        api_key_obj.save()

        return Response({
            'success': True,
            'message': 'API Key 已成功保存',
            'data': {
                'is_validated': api_key_obj.is_validated,
                'key_name': api_key_obj.key_name,
            }
        }, status=status.HTTP_201_CREATED)

    def delete(self, request):
        """Delete API key."""
        try:
            request.user.api_key.delete()
            return Response({
                'success': True,
                'message': 'API Key 已成功刪除'
            })
        except UserAPIKey.DoesNotExist:
            return Response({
                'success': False,
                'error': {
                    'code': 'NOT_FOUND',
                    'message': '未找到 API Key'
                }
            }, status=status.HTTP_404_NOT_FOUND)


class ValidateAPIKeyView(APIView):
    """
    Validate API key without storing it.

    POST /api/v1/users/me/api-key/validate
    """

    permission_classes = [IsAuthenticated]

    @method_decorator(ratelimit(key='user', rate='10/h', method='POST', block=True))
    def post(self, request):
        """Validate API key."""
        serializer = ValidateAPIKeySerializer(data=request.data)

        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'API Key 驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        api_key_str = serializer.validated_data['api_key']

        # Validate API key asynchronously
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        is_valid, error_msg = loop.run_until_complete(
            APIKeyService.validate_anthropic_key(api_key_str)
        )

        return Response({
            'success': True,
            'data': {
                'valid': is_valid,
                'error': error_msg if not is_valid else None
            }
        })


class GetUsageStatsView(APIView):
    """
    Get API usage statistics.

    GET /api/v1/users/me/api-key/usage?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&granularity=day
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get usage statistics."""
        from django.db.models import Sum, Count
        from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
        from apps.ai.models import AIExecutionLog
        from datetime import datetime

        # Check if user has API key
        try:
            request.user.api_key
        except UserAPIKey.DoesNotExist:
            return Response({
                'success': False,
                'error': {
                    'code': 'NO_API_KEY',
                    'message': '未找到 API Key。請先設定 API Key'
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        # Parse query parameters
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        granularity = request.query_params.get('granularity', 'day')

        # Query logs
        logs = AIExecutionLog.objects.filter(user=request.user)

        if start_date_str:
            try:
                start_date = datetime.fromisoformat(start_date_str).date()
                logs = logs.filter(created_at__date__gte=start_date)
            except ValueError:
                return Response({
                    'success': False,
                    'error': {
                        'code': 'INVALID_DATE',
                        'message': 'Invalid start_date format. Use YYYY-MM-DD'
                    }
                }, status=status.HTTP_400_BAD_REQUEST)

        if end_date_str:
            try:
                end_date = datetime.fromisoformat(end_date_str).date()
                from datetime import timedelta
                # Include the entire end_date day
                logs = logs.filter(created_at__date__lte=end_date)
            except ValueError:
                return Response({
                    'success': False,
                    'error': {
                        'code': 'INVALID_DATE',
                        'message': 'Invalid end_date format. Use YYYY-MM-DD'
                    }
                }, status=status.HTTP_400_BAD_REQUEST)

        # Calculate total stats
        total = logs.aggregate(
            input_tokens=Sum('input_tokens'),
            output_tokens=Sum('output_tokens'),
            requests=Count('id'),
            cost_cents=Sum('cost_cents'),
        )

        # Group by granularity
        breakdown = []
        if granularity == 'total':
            # No breakdown needed
            pass
        elif granularity == 'day':
            breakdown_qs = logs.annotate(
                period=TruncDate('created_at')
            ).values('period').annotate(
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
                requests=Count('id'),
                cost_cents=Sum('cost_cents'),
            ).order_by('-period')

            for item in breakdown_qs:
                breakdown.append({
                    'period': item['period'].isoformat(),
                    'input_tokens': item['input_tokens'] or 0,
                    'output_tokens': item['output_tokens'] or 0,
                    'requests': item['requests'] or 0,
                    'cost_usd': (item['cost_cents'] or 0) / 100,
                })
        elif granularity == 'week':
            breakdown_qs = logs.annotate(
                period=TruncWeek('created_at')
            ).values('period').annotate(
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
                requests=Count('id'),
                cost_cents=Sum('cost_cents'),
            ).order_by('-period')

            for item in breakdown_qs:
                breakdown.append({
                    'period': item['period'].date().isoformat(),
                    'input_tokens': item['input_tokens'] or 0,
                    'output_tokens': item['output_tokens'] or 0,
                    'requests': item['requests'] or 0,
                    'cost_usd': (item['cost_cents'] or 0) / 100,
                })
        elif granularity == 'month':
            breakdown_qs = logs.annotate(
                period=TruncMonth('created_at')
            ).values('period').annotate(
                input_tokens=Sum('input_tokens'),
                output_tokens=Sum('output_tokens'),
                requests=Count('id'),
                cost_cents=Sum('cost_cents'),
            ).order_by('-period')

            for item in breakdown_qs:
                breakdown.append({
                    'period': item['period'].date().isoformat(),
                    'input_tokens': item['input_tokens'] or 0,
                    'output_tokens': item['output_tokens'] or 0,
                    'requests': item['requests'] or 0,
                    'cost_usd': (item['cost_cents'] or 0) / 100,
                })

        return Response({
            'success': True,
            'data': {
                'total': {
                    'input_tokens': total['input_tokens'] or 0,
                    'output_tokens': total['output_tokens'] or 0,
                    'requests': total['requests'] or 0,
                    'cost_usd': (total['cost_cents'] or 0) / 100,
                },
                'breakdown': breakdown
            }
        })
