"""Admin user-management views."""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.response import Response

from ..permissions import IsSuperAdmin
from ..serializers import UserRoleUpdateSerializer, UserSearchSerializer
from .common import SchemaAPIView

User = get_user_model()


class UserSearchView(SchemaAPIView):
    """
    Search users by username or email (admin only).
    If no query provided, returns all users (paginated).

    GET /api/v1/users?q=query
    GET /api/v1/users  (list all users)
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


__all__ = ["UserSearchView", "UserRoleUpdateView"]
