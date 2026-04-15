"""
Views for user authentication and management.

Security:
- JWT tokens are stored in HttpOnly cookies to prevent XSS attacks.
- CSRF protection is enforced for cookie-authenticated state-changing requests.
- Authorization header authentication is exempt from CSRF (tokens aren't sent automatically).
"""
from rest_framework import status, serializers
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import FormParser, MultiPartParser
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.core.cache import cache
from django.urls import reverse
from django_ratelimit.decorators import ratelimit
from io import BytesIO
from pathlib import Path
from PIL import Image, UnidentifiedImageError
import logging

from ..serializers import (
    UserSerializer,
    CurrentUserUpdateSerializer,
    UserProfileSerializer,
    UserLoginRecordSerializer,
    UserSearchSerializer,
    UserRoleUpdateSerializer,
    UserPreferencesUpdateSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
)
from ..services import EmailAuthService
from ..permissions import IsSuperAdmin
from .common import SchemaAPIView
from apps.core.services import (
    MarkdownImageStorageError,
    build_markdown_image_object_key,
    store_markdown_image,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class CurrentUserView(SchemaAPIView):
    """
    Get current authenticated user information.
    
    GET /api/v1/users/me
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response({
            'success': True,
            'data': serializer.data
        })
    
    def patch(self, request):
        """Update current user profile."""
        user = request.user
        mutable_fields = {"username", "email"}
        requested_mutable_fields = mutable_fields.intersection(request.data.keys())

        if user.auth_provider != 'email' and requested_mutable_fields:
            return Response({
                'success': False,
                'error': {
                    'code': 'ACCOUNT_FIELDS_LOCKED',
                    'message': 'SSO/OAuth 帳號無法修改使用者名稱或電子郵件，僅可編輯顯示名稱'
                }
            }, status=status.HTTP_403_FORBIDDEN)

        if not requested_mutable_fields:
            serializer = UserSerializer(user)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': '無更新欄位'
            })

        serializer = CurrentUserUpdateSerializer(user, data=request.data, partial=True)
        
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
        refreshed_user = User.objects.get(pk=user.pk)
        response_serializer = UserSerializer(refreshed_user)
        
        return Response({
            'success': True,
            'data': response_serializer.data,
            'message': '個人資料已更新'
        })


class UserSearchView(SchemaAPIView):
    """
    Search users by username or email (admin only).
    If no query provided, returns all users (paginated).
    
    GET /api/v1/users/search?q=query
    GET /api/v1/users/search  (list all users)
    """
    permission_classes = [IsSuperAdmin]
    serializer_class = serializers.Serializer
    
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


class UserRoleUpdateView(SchemaAPIView):
    """
    Update user role (admin only).
    
    PATCH /api/v1/users/{id}/role
    """
    permission_classes = [IsSuperAdmin]
    serializer_class = UserRoleUpdateSerializer
    
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


class UserStatsView(SchemaAPIView):
    """
    Get current user statistics.
    GET /api/v1/users/me/stats
    """
    permission_classes = [IsAuthenticated]
    serializer_class = serializers.Serializer

    def get(self, request):
        user = request.user
        cache_key = f"user_stats:v1:{user.id}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response({
                'success': True,
                'data': cached_data
            })
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

        payload = {
            'total_solved': easy_solved + medium_solved + hard_solved,
            'easy_solved': easy_solved,
            'medium_solved': medium_solved,
            'hard_solved': hard_solved,
            'total_easy': total_easy,
            'total_medium': total_medium,
            'total_hard': total_hard,
        }
        cache.set(cache_key, payload, timeout=30)

        return Response({
            'success': True,
            'data': payload
        })


class UserPreferencesView(SchemaAPIView):
    """
    Get and update current user preferences.
    
    GET /api/v1/auth/me/preferences - Get current preferences
    PATCH /api/v1/auth/me/preferences - Update preferences
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserPreferencesUpdateSerializer
    
    def get(self, request):
        """Get current user preferences."""
        user = request.user
        cache_key = f"user_preferences:v1:{user.id}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response({
                'success': True,
                'data': cached_data
            })
        
        # Ensure user has a profile
        from ..models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=user)

        serializer = UserProfileSerializer(profile)
        cache.set(cache_key, serializer.data, timeout=30)
        return Response({
            'success': True,
            'data': serializer.data
        })
    
    def patch(self, request):
        """Update user preferences."""
        user = request.user
        
        # Ensure user has a profile
        from ..models import UserProfile
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
        
        if 'display_name' in validated_data:
            profile.display_name = validated_data['display_name']
        if 'avatar_url' in validated_data:
            profile.avatar_url = validated_data['avatar_url']
            profile.avatar_source = 'manual'
        if 'preferred_language' in validated_data:
            profile.preferred_language = validated_data['preferred_language']
        if 'preferred_theme' in validated_data:
            profile.preferred_theme = validated_data['preferred_theme']
        if 'editor_font_size' in validated_data:
            profile.editor_font_size = validated_data['editor_font_size']
        if 'editor_tab_size' in validated_data:
            profile.editor_tab_size = validated_data['editor_tab_size']
        if 'onboarding_completed_at' in validated_data:
            val = validated_data['onboarding_completed_at']
            profile.onboarding_completed_at = timezone.now() if val else None

        profile.save()
        cache.delete(f"user_preferences:v1:{user.id}")

        # Return updated profile
        profile_serializer = UserProfileSerializer(profile)
        
        return Response({
            'success': True,
            'data': profile_serializer.data,
            'message': '偏好設定已更新'
        })


class UserAvatarUploadView(SchemaAPIView):
    """Upload current user's avatar and return public URL."""

    permission_classes = [IsAuthenticated]
    serializer_class = serializers.Serializer
    parser_classes = [MultiPartParser, FormParser]

    SUPPORTED_IMAGE_FORMATS = {
        "PNG": ("png", "image/png"),
        "JPEG": ("jpg", "image/jpeg"),
        "WEBP": ("webp", "image/webp"),
        "GIF": ("gif", "image/gif"),
    }

    def _build_image_url(self, request, object_key: str) -> str:
        path = reverse("markdown-image-read", kwargs={"object_key": object_key})
        base_url = (settings.MARKDOWN_IMAGE_PUBLIC_BASE_URL or "").strip()
        if base_url:
            return f"{base_url.rstrip('/')}{path}"
        return request.build_absolute_uri(path)

    def _build_alt_text(self, file_name: str) -> str:
        stem = Path(file_name).stem.strip()
        if not stem:
            return "avatar"
        normalized = stem.replace("[", "").replace("]", "").replace("(", "").replace(")", "")
        return normalized[:80] or "avatar"

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response(
                {
                    "success": False,
                    "error": {"code": "FILE_REQUIRED", "message": "file is required"},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_bytes = int(getattr(settings, "MARKDOWN_IMAGE_MAX_BYTES", 5 * 1024 * 1024))
        if uploaded.size > max_bytes:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "FILE_TOO_LARGE",
                        "message": f"File is too large (max {max_bytes} bytes)",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = uploaded.read()
        if not payload:
            return Response(
                {
                    "success": False,
                    "error": {"code": "EMPTY_FILE", "message": "Uploaded file is empty"},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with Image.open(BytesIO(payload)) as image:
                image.verify()
            with Image.open(BytesIO(payload)) as image:
                image_format = (image.format or "").upper()
        except (UnidentifiedImageError, OSError):
            return Response(
                {
                    "success": False,
                    "error": {"code": "UNSUPPORTED_IMAGE", "message": "Unsupported image file"},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if image_format not in self.SUPPORTED_IMAGE_FORMATS:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "UNSUPPORTED_IMAGE_FORMAT",
                        "message": "Unsupported image format. Use png/jpg/jpeg/webp/gif",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        extension, content_type = self.SUPPORTED_IMAGE_FORMATS[image_format]
        object_key = build_markdown_image_object_key(extension)

        try:
            store_markdown_image(content=payload, object_key=object_key, content_type=content_type)
        except MarkdownImageStorageError:
            return Response(
                {
                    "success": False,
                    "error": {"code": "UPLOAD_FAILED", "message": "Failed to upload image"},
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        image_url = self._build_image_url(request, object_key)

        from ..models import UserProfile

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.avatar_url = image_url
        profile.avatar_source = "manual"
        profile.save(update_fields=["avatar_url", "avatar_source", "updated_at"])
        cache.delete(f"user_preferences:v1:{request.user.id}")

        return Response(
            {
                "success": True,
                "data": {
                    "avatar_url": image_url,
                    "content_type": content_type,
                    "size": len(payload),
                    "alt": self._build_alt_text(uploaded.name),
                },
                "message": "頭像已上傳",
            },
            status=status.HTTP_201_CREATED,
        )


class ChangePasswordView(SchemaAPIView):
    """
    Change password for current user.
    
    POST /api/v1/auth/change-password
    
    Requires current password verification.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ChangePasswordSerializer
    
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


@method_decorator(ratelimit(key='ip', rate='10/h', method='POST', block=True), name='post')
class ForgotPasswordView(SchemaAPIView):
    """
    Request a password reset token.

    POST /api/v1/auth/forgot-password
    """

    permission_classes = [AllowAny]
    serializer_class = ForgotPasswordSerializer

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '密碼重設請求驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        user = User.objects.filter(
            email=email,
            auth_provider='email',
            is_active=True,
        ).first()

        reset_url = None
        if user:
            reset_url = EmailAuthService.issue_password_reset(user)

        response_data = {
            'success': True,
            'message': '若此帳號可重設密碼，已寄送重設說明至信箱'
        }
        if settings.DEBUG and reset_url:
            response_data['data'] = {'reset_url': reset_url}
        return Response(response_data)


@method_decorator(ratelimit(key='ip', rate='20/h', method='POST', block=True), name='post')
class ResetPasswordView(SchemaAPIView):
    """
    Reset password by token.

    POST /api/v1/auth/reset-password
    """

    permission_classes = [AllowAny]
    serializer_class = ResetPasswordSerializer

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '密碼重設驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        token = serializer.validated_data['token']
        user = EmailAuthService.get_user_by_password_reset_token(token)
        if not user:
            return Response({
                'success': False,
                'error': {
                    'code': 'INVALID_RESET_TOKEN',
                    'message': '重設連結無效或已過期'
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['new_password'])
        user.password_reset_token = None
        user.password_reset_expires_at = None
        user.save(update_fields=['password', 'password_reset_token', 'password_reset_expires_at'])

        return Response({
            'success': True,
            'message': '密碼已重設完成'
        })


# ===========================================================================
# Login Records & Device Management
# ===========================================================================

class LoginRecordsView(SchemaAPIView):
    """GET /api/v1/auth/me/login-records — list recent login records."""
    permission_classes = [IsAuthenticated]
    serializer_class = UserLoginRecordSerializer

    def get(self, request):
        from django.utils import timezone
        from datetime import timedelta

        cutoff = timezone.now() - timedelta(days=30)
        records = request.user.login_records.filter(created_at__gte=cutoff)[:50]
        return Response({
            'success': True,
            'data': UserLoginRecordSerializer(records, many=True).data,
        })


class LogoutOtherDevicesView(SchemaAPIView):
    """POST /api/v1/auth/me/logout-other-devices — blacklist all other tokens."""
    permission_classes = [IsAuthenticated]
    serializer_class = serializers.Serializer

    def post(self, request):
        from apps.contests.services.anti_cheat_session import get_token_jti, get_refresh_jti, blacklist_other_tokens

        jti = get_token_jti(request)
        if not jti:
            return Response(
                {'success': False, 'error': {'code': 'NO_JTI', 'message': 'Cannot identify current token.'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        count = blacklist_other_tokens(request.user, access_jti=jti, refresh_jti=get_refresh_jti(request))

        # Mark other login records as not current
        from ..models import UserLoginRecord
        UserLoginRecord.objects.filter(user=request.user, is_current=True).exclude(jti=jti).update(is_current=False)

        return Response({
            'success': True,
            'data': {'blacklisted_count': count},
            'message': f'已登出其他 {count} 個裝置',
        })
