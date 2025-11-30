"""
Django admin configuration for users app.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserProfile


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom user admin."""
    list_display = ['username', 'email', 'role', 'auth_provider', 'email_verified', 'is_active']
    list_filter = ['role', 'auth_provider', 'email_verified', 'is_active']
    search_fields = ['username', 'email']
    ordering = ['-date_joined']
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('OAuth Information', {
            'fields': ('auth_provider', 'oauth_id', 'email_verified')
        }),
        ('Role', {
            'fields': ('role',)
        }),
    )


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """User profile admin."""
    list_display = ['user', 'solved_count', 'submission_count', 'accept_rate']
    search_fields = ['user__username', 'user__email']
    readonly_fields = ['solved_count', 'submission_count', 'accept_rate']
