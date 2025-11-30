"""
Views for user authentication and management.
"""
import secrets
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from .serializers import (
    UserSerializer,
    RegisterSerializer,
    LoginSerializer,
    OAuthCallbackSerializer,
    UserProfileSerializer,
    UserSearchSerializer,
    UserRoleUpdateSerializer,
)
from .services import EmailAuthService, NYCUOAuthService, JWTService
from .permissions import IsSuperAdmin

User = get_user_model()


@method_decorator(csrf_exempt, name='dispatch')
class RegisterView(APIView):
    """
    User registration with email/password.
    
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
            
            return Response({
                'success': True,
                'data': {
                    **JWTService.get_user_response_data(user, tokens)['data'],
                    'verification_url': verification_url,  # For development
                },
                'message': '註冊成功,請檢查您的Email以驗證帳號'
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': {
                    'code': 'REGISTRATION_FAILED',
                    'message': str(e)
                }
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
class LoginView(APIView):
    """
    User login with email/password.
    
    POST /api/v1/auth/email/login
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
        return Response(JWTService.get_user_response_data(user, tokens))


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



@method_decorator(csrf_exempt, name='dispatch')
class NYCUOAuthCallbackView(APIView):
    """
    Handle NYCU OAuth callback.
    
    POST /api/v1/auth/nycu-oauth/callback
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
            
            return Response(JWTService.get_user_response_data(user, tokens))
            
        except Exception as e:
            return Response({
                'success': False,
                'error': {
                    'code': 'AUTH_003',
                    'message': 'NYCU OAuth 授權失敗',
                    'details': str(e)
                }
            }, status=status.HTTP_401_UNAUTHORIZED)


class TokenRefreshView(APIView):
    """
    Refresh access token.
    
    POST /api/v1/auth/refresh
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        refresh_token = request.data.get('refresh')
        
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
            
            return Response({
                'success': True,
                'data': {
                    'access_token': access_token,
                }
            })
        except Exception as e:
            return Response({
                'success': False,
                'error': {
                    'code': 'INVALID_TOKEN',
                    'message': 'Refresh token 無效或已過期'
                }
            }, status=status.HTTP_401_UNAUTHORIZED)


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


class EmailVerificationView(APIView):
    """
    Verify email address.
    
    POST /api/v1/auth/verify-email
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        token = request.data.get('token')
        
        if not token:
            return Response({
                'success': False,
                'error': {
                    'code': 'MISSING_TOKEN',
                    'message': '缺少驗證 token'
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user = EmailAuthService.verify_email(token)
        
        if not user:
            return Response({
                'success': False,
                'error': {
                    'code': 'INVALID_TOKEN',
                    'message': '驗證 token 無效或已過期'
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'success': True,
            'message': 'Email 驗證成功'
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
