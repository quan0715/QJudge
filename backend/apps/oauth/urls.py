from django.urls import path

from . import views

urlpatterns = [
    path(
        ".well-known/oauth-authorization-server",
        views.oauth_authorization_server_metadata,
        name="oauth-as-metadata",
    ),
    path(
        ".well-known/jwks.json",
        views.oauth_jwks,
        name="oauth-jwks",
    ),
    path(
        ".well-known/mcp/server-card.json",
        views.mcp_server_card,
        name="mcp-server-card",
    ),
    path(
        "o/register/",
        views.dynamic_client_registration,
        name="oauth-dcr",
    ),
    path(
        "o/authorize/",
        views.authorize_redirect,
        name="oauth-authorize-redirect",
    ),
    path(
        "api/oauth/approve/",
        views.ApproveAuthorizationView.as_view(),
        name="oauth-approve",
    ),
    path(
        "api/oauth/resource-token/",
        views.ResourceTokenView.as_view(),
        name="oauth-resource-token",
    ),
    path(
        "api/oauth/token-exchange/",
        views.TokenExchangeView.as_view(),
        name="oauth-token-exchange",
    ),
]
