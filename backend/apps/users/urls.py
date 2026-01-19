"""
URL configuration for users app.
"""
from django.urls import path
from .views import (
    RegisterView,
    LoginView,
    DevTokenView,
    LogoutView,
    NYCUOAuthLoginView,
    NYCUOAuthCallbackView,
    TokenRefreshView,
    CurrentUserView,
    UserSearchView,
    UserRoleUpdateView,
    UserStatsView,
    UserPreferencesView,
    ChangePasswordView,
)

app_name = 'users'

urlpatterns = [
    # Email/Password authentication
    path('email/register', RegisterView.as_view(), name='email-register'),
    path('email/login', LoginView.as_view(), name='email-login'),

    # Development helper (DEBUG only)
    path('dev/token', DevTokenView.as_view(), name='dev-token'),
    
    # NYCU OAuth
    path('nycu/login', NYCUOAuthLoginView.as_view(), name='nycu-oauth-login'),
    path('nycu/callback', NYCUOAuthCallbackView.as_view(), name='nycu-oauth-callback'),
    
    # Token management
    path('refresh', TokenRefreshView.as_view(), name='token-refresh'),
    path('logout', LogoutView.as_view(), name='logout'),
    
    # Current user
    path('me', CurrentUserView.as_view(), name='current-user'),
    path('me/stats', UserStatsView.as_view(), name='current-user-stats'),
    path('me/preferences', UserPreferencesView.as_view(), name='user-preferences'),
    
    # Password management
    path('change-password', ChangePasswordView.as_view(), name='change-password'),
    
    # User management (admin only)
    path('search', UserSearchView.as_view(), name='user-search'),
    path('<int:pk>/role', UserRoleUpdateView.as_view(), name='user-role-update'),
]
