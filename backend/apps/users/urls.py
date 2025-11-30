"""
URL configuration for users app.
"""
from django.urls import path
from .views import (
    RegisterView,
    LoginView,
    NYCUOAuthLoginView,
    NYCUOAuthCallbackView,
    TokenRefreshView,
    CurrentUserView,
    EmailVerificationView,
    UserSearchView,
    UserRoleUpdateView,
)

app_name = 'users'

urlpatterns = [
    # Email/Password authentication
    path('email/register', RegisterView.as_view(), name='email-register'),
    path('email/login', LoginView.as_view(), name='email-login'),
    path('verify-email', EmailVerificationView.as_view(), name='verify-email'),
    
    # NYCU OAuth
    path('nycu/login', NYCUOAuthLoginView.as_view(), name='nycu-oauth-login'),
    path('nycu/callback', NYCUOAuthCallbackView.as_view(), name='nycu-oauth-callback'),
    
    # Token management
    path('refresh', TokenRefreshView.as_view(), name='token-refresh'),
    
    # Current user
    path('me', CurrentUserView.as_view(), name='current-user'),
    
    # User management (admin only)
    path('search', UserSearchView.as_view(), name='user-search'),
    path('<int:pk>/role', UserRoleUpdateView.as_view(), name='user-role-update'),
]
