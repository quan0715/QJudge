from django.urls import path

from . import views

urlpatterns = [
    path(
        ".well-known/oauth-authorization-server",
        views.oauth_authorization_server_metadata,
        name="oauth-as-metadata",
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
]
