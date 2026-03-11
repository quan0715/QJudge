"""Split view modules for users app."""

from .auth import (
    SchemaAPIView,
    RegisterView,
    LoginView,
    DevTokenView,
    NYCUOAuthLoginView,
    NYCUOAuthCallbackView,
)
from .token import TokenRefreshView, LogoutView, ResolveConflictView
from .profile import (
    CurrentUserView,
    UserStatsView,
    UserPreferencesView,
    ChangePasswordView,
    ForgotPasswordView,
    ResetPasswordView,
)
from .admin import UserSearchView, UserRoleUpdateView
from .api_key import UserAPIKeyView, ValidateAPIKeyView, GetUsageStatsView

__all__ = [
    "SchemaAPIView",
    "RegisterView",
    "LoginView",
    "DevTokenView",
    "NYCUOAuthLoginView",
    "NYCUOAuthCallbackView",
    "TokenRefreshView",
    "LogoutView",
    "ResolveConflictView",
    "CurrentUserView",
    "UserSearchView",
    "UserRoleUpdateView",
    "UserStatsView",
    "UserPreferencesView",
    "ChangePasswordView",
    "ForgotPasswordView",
    "ResetPasswordView",
    "UserAPIKeyView",
    "ValidateAPIKeyView",
    "GetUsageStatsView",
]
