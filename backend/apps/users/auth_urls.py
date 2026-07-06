"""Auth lifecycle URL configuration."""

from django.conf import settings
from django.urls import path

from .views import (
    AuthOptionsView,
    DevTokenView,
    LoginRecordsView,
    LogoutOtherDevicesView,
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
    path("me/login-records", LoginRecordsView.as_view(), name="login-records"),
    path("me/logout-other-devices", LogoutOtherDevicesView.as_view(), name="logout-other-devices"),
]

if settings.DEBUG:
    urlpatterns.append(path("dev/token", DevTokenView.as_view(), name="dev-token"))
