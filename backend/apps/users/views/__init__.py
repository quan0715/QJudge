"""Split view modules for users app."""

from .auth import (
    SchemaAPIView,
    RegisterView,
    LoginView,
    DevTokenView,
    OAuthLoginView,
    OAuthCallbackView,
    NYCUOAuthLoginView,
    NYCUOAuthCallbackView,
)
from .token import TokenRefreshView, LogoutView, ResolveConflictView
from .profile import (
    CurrentUserView,
    UserStatsView,
    UserPreferencesView,
    UserAvatarUploadView,
    ChangePasswordView,
    ForgotPasswordView,
    ResetPasswordView,
)
from .admin import UserSearchView, UserRoleUpdateView
from .teacher_activation import (
    TeacherActivationInviteConsumeView,
    TeacherActivationInviteIssueView,
    TeacherActivationInvitePreviewView,
)
from .api_key import UserAPIKeyView, ValidateAPIKeyView, GetUsageStatsView
from ._impl import LoginRecordsView, LogoutOtherDevicesView

__all__ = [
    "SchemaAPIView",
    "RegisterView",
    "LoginView",
    "DevTokenView",
    "OAuthLoginView",
    "OAuthCallbackView",
    "NYCUOAuthLoginView",
    "NYCUOAuthCallbackView",
    "TokenRefreshView",
    "LogoutView",
    "ResolveConflictView",
    "CurrentUserView",
    "UserSearchView",
    "UserRoleUpdateView",
    "TeacherActivationInviteIssueView",
    "TeacherActivationInvitePreviewView",
    "TeacherActivationInviteConsumeView",
    "UserStatsView",
    "UserPreferencesView",
    "UserAvatarUploadView",
    "ChangePasswordView",
    "ForgotPasswordView",
    "ResetPasswordView",
    "UserAPIKeyView",
    "ValidateAPIKeyView",
    "GetUsageStatsView",
    "LoginRecordsView",
    "LogoutOtherDevicesView",
]
