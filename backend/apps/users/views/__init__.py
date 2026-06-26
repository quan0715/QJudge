"""Split view modules for users app."""

from .auth import (
    SchemaAPIView,
    RegisterView,
    LoginView,
    AuthOptionsView,
    DevTokenView,
    OAuthLoginView,
    OAuthCallbackView,
)
from .token import TokenRefreshView, LogoutView, ResolveConflictView
from .account import CurrentUserView, UserStatsView
from .admin import UserSearchView, UserRoleUpdateView
from .avatar import UserAvatarUploadView
from .login_records import LoginRecordsView, LogoutOtherDevicesView
from .password import ChangePasswordView, ForgotPasswordView, ResetPasswordView
from .preferences import UserPreferencesView
from .teacher_activation import (
    TeacherActivationInviteConsumeView,
    TeacherActivationInviteIssueView,
    TeacherActivationInvitePreviewView,
)

__all__ = [
    "SchemaAPIView",
    "RegisterView",
    "LoginView",
    "AuthOptionsView",
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
