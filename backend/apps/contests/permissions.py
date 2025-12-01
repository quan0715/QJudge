"""
Permissions and role detection for contests.
"""
from rest_framework import permissions


def get_user_role_in_contest(user, contest):
    """
    Determine user's role in a contest.
    
    Returns: 'student' | 'teacher' | 'admin'
    """
    if not user or not user.is_authenticated:
        return 'student'
    
    if user.is_staff or user.is_superuser:
        return 'admin'
    
    # Check if user is the contest owner
    # Check if user is the contest owner
    if contest.owner_id == user.id:
        return 'teacher'
    
    return 'student'


def get_contest_permissions(user, contest):
    """
    Calculate all permissions for a user in a contest.
    
    Returns a dict with boolean flags for various permissions.
    """
    role = get_user_role_in_contest(user, contest)
    
    # Admin has all permissions
    if role == 'admin':
        return {
            'can_switch_view': True,
            'can_edit_contest': True,
            'can_toggle_status': True,
            'can_publish_problems': True,
            'can_view_all_submissions': True,
            'can_view_full_scoreboard': True,
        }
    
    # Teacher (contest owner) has all permissions except some admin-only features
    if role == 'teacher':
        return {
            'can_switch_view': True,
            'can_edit_contest': True,
            'can_toggle_status': True,
            'can_publish_problems': True,
            'can_view_all_submissions': True,
            'can_view_full_scoreboard': True,
        }
    
    # Student permissions are more restricted
    # Scoreboard visibility depends on contest settings and status
    can_view_scoreboard = (
        contest.scoreboard_visible_during_contest or 
        contest.status == 'inactive'
    )
    
    return {
        'can_switch_view': False,
        'can_edit_contest': False,
        'can_toggle_status': False,
        'can_publish_problems': False,
        'can_view_all_submissions': False,
        'can_view_full_scoreboard': can_view_scoreboard,
    }


class IsContestOwnerOrAdmin(permissions.BasePermission):
    """
    Permission class: only contest owner or admin can access.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        
        if request.user.is_staff or request.user.is_superuser:
            return True
        
        # Check if user is the owner
        if hasattr(obj, 'owner_id'):
            return obj.owner_id == request.user.id
        
        # Check if object is linked to a contest (e.g. Clarification)
        if hasattr(obj, 'contest') and hasattr(obj.contest, 'owner_id'):
            return obj.contest.owner_id == request.user.id
            
        return False


class IsContestParticipant(permissions.BasePermission):
    """
    Permission class: only contest participants can access.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Admin and owner always have access
        if request.user.is_staff or request.user.is_superuser:
            return True
        
        if obj.owner_id == request.user.id:
            return True
        
        # Check if user is registered for the contest
        from .models import ContestParticipant
        return ContestParticipant.objects.filter(
            contest=obj,
            user=request.user
        ).exists()


class IsTeacherOrAdmin(permissions.BasePermission):
    """
    Permission class: only teachers or admin can access.
    Useful for general teacher-level endpoints.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Check if user is staff/superuser or has teacher role
        return request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'role') and request.user.role == 'teacher'
