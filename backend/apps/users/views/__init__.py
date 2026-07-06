"""Split view modules for users app."""

from .auth import (
    SchemaAPIView,
    RegisterView,
    AuthOptionsView,
    DevTokenView,
    ProviderLoginView,
    OAuthCallbackView,
)
from .token import TokenRefreshView, LogoutView
from .account import CurrentUserView
from .admin import UserSearchView, UserRoleUpdateView
from .avatar import UserAvatarUploadView
from .login_records import LoginRecordsView, LogoutOtherDevicesView
from .magic_link import MagicLinkInspectView, MagicLinkIssueView, MagicLinkRedeemView
from .preferences import UserPreferencesView

__all__ = [
    "SchemaAPIView",
    "RegisterView",
    "AuthOptionsView",
    "DevTokenView",
    "ProviderLoginView",
    "OAuthCallbackView",
    "TokenRefreshView",
    "LogoutView",
    "CurrentUserView",
    "UserSearchView",
    "UserRoleUpdateView",
    "MagicLinkIssueView",
    "MagicLinkInspectView",
    "MagicLinkRedeemView",
    "UserPreferencesView",
    "UserAvatarUploadView",
    "LoginRecordsView",
    "LogoutOtherDevicesView",
]
