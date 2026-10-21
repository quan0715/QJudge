"""
Custom permissions for user management.
"""
from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    """
    Permission check for super admin users.
    Only users with role='admin' AND is_superuser=True can access.
    """
    
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and 
            request.user.is_superuser and 
            request.user.role == 'admin'
        )
    
    message = '只有超級管理員可以執行此操作'


class IsTeacherOrAdmin(BasePermission):
    """
    Platform-level permission for teachers and platform admins.
    Contest- and classroom-scoped access must use their own role checks.
    """

    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and (
            user.is_staff or user.is_superuser or user.role == 'teacher'
        )

    message = '只有教師或管理員可以執行此操作'
