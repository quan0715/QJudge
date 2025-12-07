import pytest
from rest_framework import status
from apps.users.models import User


@pytest.mark.django_db
def test_registration_flow(api_client):
    payload = {
        "username": "newuser",
        "email": "newuser@example.com",
        "password": "StrongPass123",
        "password_confirm": "StrongPass123",
    }

    response = api_client.post(
        "/api/v1/auth/email/register",
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]
    assert User.objects.filter(email=payload["email"]).exists()


@pytest.mark.django_db
def test_login_flow(api_client, user_factory):
    password = "LoginPass123"
    user = user_factory(password=password)

    response = api_client.post(
        "/api/v1/auth/email/login",
        {"email": user.email, "password": password},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()["data"]
    assert data["user"]["email"] == user.email
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.django_db
def test_token_refresh_flow(api_client, user_factory):
    password = "RefreshPass123"
    user = user_factory(password=password)
    login_response = api_client.post(
        "/api/v1/auth/email/login",
        {"email": user.email, "password": password},
        format="json",
    )
    refresh_token = login_response.json()["data"]["refresh_token"]

    response = api_client.post(
        "/api/v1/auth/refresh",
        {"refresh": refresh_token},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["success"] is True
    assert "access_token" in response.json()["data"]


@pytest.mark.django_db
def test_superadmin_permission_required(api_client, user_factory):
    # Non-admin should be forbidden
    response = api_client.get("/api/v1/users/search")
    assert response.status_code == status.HTTP_403_FORBIDDEN

    # Admin with correct flags should pass
    admin = user_factory(
        username="admin-user",
        email="admin@example.com",
        role="admin",
        is_staff=True,
        is_superuser=True,
    )
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/users/search")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["success"] is True
