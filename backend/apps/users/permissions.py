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
