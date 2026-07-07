"""Auth lifecycle URL configuration."""

from django.conf import settings
from django.urls import path

from .views import (
    AuthSessionListView,
    AuthOptionsView,
    DevTokenView,
    LogoutOtherSessionsView,
    LogoutView,
    OAuthCallbackView,
    ProviderLoginView,
    RegisterView,
    TokenRefreshView,
)

app_name = "auth"

urlpatterns = [
    path("providers", AuthOptionsView.as_view(), name="auth-providers"),
    path("register/password", RegisterView.as_view(), name="password-register"),
    path("login/<str:provider>", ProviderLoginView.as_view(), name="provider-login"),
    path("callback/<str:provider>", OAuthCallbackView.as_view(), name="oauth-callback"),
    path("refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path("logout", LogoutView.as_view(), name="logout"),
    path("sessions", AuthSessionListView.as_view(), name="session-list"),
    path("sessions/logout-others", LogoutOtherSessionsView.as_view(), name="session-logout-others"),
]

if settings.DEBUG:
    urlpatterns.append(path("dev/token", DevTokenView.as_view(), name="dev-token"))
