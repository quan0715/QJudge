from django.urls import path

from . import views

urlpatterns = [
    path(
        ".well-known/oauth-authorization-server",
        views.oauth_authorization_server_metadata,
        name="oauth-as-metadata",
    ),
    path(
        "o/register/",
        views.dynamic_client_registration,
        name="oauth-dcr",
    ),
]
