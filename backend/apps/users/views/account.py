"""Current-user account views."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..serializers import CurrentUserUpdateSerializer, UserSerializer
from .common import SchemaAPIView

User = get_user_model()


@method_decorator(ensure_csrf_cookie, name="dispatch")
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

        from apps.problems.models import CodingProblem
        from apps.submissions.models import Submission

        # Total problems by difficulty
        total_easy = CodingProblem.objects.filter(difficulty='easy').count()
        total_medium = CodingProblem.objects.filter(difficulty='medium').count()
        total_hard = CodingProblem.objects.filter(difficulty='hard').count()

        # Solved problems by difficulty (distinct problems solved by user)
        solved_ids = Submission.objects.filter(user=user, status='AC').values_list('problem_id', flat=True).distinct()
        solved_objs = CodingProblem.objects.filter(id__in=solved_ids)

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


__all__ = ["CurrentUserView", "UserStatsView"]
