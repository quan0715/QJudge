"""Split view modules for users app."""

from .auth import (
    SchemaAPIView,
    RegisterView,
    LoginView,
    DevTokenView,
    OAuthLoginView,
    OAuthCallbackView,
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
from ._impl import LoginRecordsView, LogoutOtherDevicesView

__all__ = [
    "SchemaAPIView",
    "RegisterView",
    "LoginView",
    "DevTokenView",
    "OAuthLoginView",
    "OAuthCallbackView",
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
    "LoginRecordsView",
    "LogoutOtherDevicesView",
]
