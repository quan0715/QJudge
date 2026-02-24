"""Split view modules for users app."""

from .auth import (
    SchemaAPIView,
    RegisterView,
    LoginView,
    DevTokenView,
    NYCUOAuthLoginView,
    NYCUOAuthCallbackView,
)
from .token import TokenRefreshView, LogoutView
from .profile import (
    CurrentUserView,
    UserStatsView,
    UserPreferencesView,
    ChangePasswordView,
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
    "CurrentUserView",
    "UserSearchView",
    "UserRoleUpdateView",
    "UserStatsView",
    "UserPreferencesView",
    "ChangePasswordView",
    "UserAPIKeyView",
    "ValidateAPIKeyView",
    "GetUsageStatsView",
]
