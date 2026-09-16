"""Refresh and logout: what happens to issued JWTs."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User


@pytest.fixture
def api_client():
    return APIClient()


def _password_user(password):
    return User.objects.create_user(
        username="token-user",
        email="token-user@example.com",
        password=password,
        auth_provider="email",
    )


def _login(api_client, user, password):
    response = api_client.post(
        "/api/v1/auth/login/password",
        {"identifier": user.email, "password": password},
        format="json",
    )
    return response.json()["data"]["refresh_token"]


@pytest.mark.django_db
def test_refresh_token_issues_a_new_access_token(api_client):
    user = _password_user("RefreshPass123")
    refresh_token = _login(api_client, user, "RefreshPass123")

    response = api_client.post("/api/v1/auth/refresh", {"refresh": refresh_token}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["success"] is True
    assert "access_token" in response.json()["data"]


@pytest.mark.django_db
def test_logout_blacklists_the_refresh_token(api_client):
    user = _password_user("LogoutPass123")
    refresh_token = _login(api_client, user, "LogoutPass123")
    # Read the JTI before logout blacklists it (verify=False skips that check).
    jti = str(RefreshToken(refresh_token, verify=False)["jti"])

    api_client.force_authenticate(user=user)
    response = api_client.post("/api/v1/auth/logout", {"refresh": refresh_token}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert BlacklistedToken.objects.filter(token__jti=jti).exists()
    refresh_response = api_client.post("/api/v1/auth/refresh", {"refresh": refresh_token}, format="json")
    assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_logout_without_a_refresh_token_blacklists_every_outstanding_token(api_client):
    user = _password_user("LogoutPass456")
    _login(api_client, user, "LogoutPass456")

    api_client.force_authenticate(user=user)
    response = api_client.post("/api/v1/auth/logout")

    assert response.status_code == status.HTTP_200_OK
    outstanding = OutstandingToken.objects.filter(user=user)
    assert outstanding.exists()
    assert BlacklistedToken.objects.filter(token__in=outstanding).count() == outstanding.count()
