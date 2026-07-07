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
from .sessions import AuthSessionListView, LogoutOtherSessionsView
from .action_link import ActionLinkInspectView, ActionLinkIssueView, ActionLinkRedeemView
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
    "ActionLinkIssueView",
    "ActionLinkInspectView",
    "ActionLinkRedeemView",
    "UserPreferencesView",
    "UserAvatarUploadView",
    "AuthSessionListView",
    "LogoutOtherSessionsView",
]
