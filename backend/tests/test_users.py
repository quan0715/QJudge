import pytest
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from apps.users.models import User, UserProfile


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
def test_logout_blacklists_refresh_token(api_client, user_factory):
    password = "LogoutPass123"
    user = user_factory(password=password)
    login_response = api_client.post(
        "/api/v1/auth/email/login",
        {"email": user.email, "password": password},
        format="json",
    )
    refresh_token = login_response.json()["data"]["refresh_token"]
    # Capture JTI before logout blacklists the token (verify=False to skip blacklist check)
    jti = str(RefreshToken(refresh_token, verify=False)["jti"])

    api_client.force_authenticate(user=user)
    response = api_client.post(
        "/api/v1/auth/logout",
        {"refresh": refresh_token},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["success"] is True

    assert BlacklistedToken.objects.filter(token__jti=jti).exists()

    refresh_response = api_client.post(
        "/api/v1/auth/refresh",
        {"refresh": refresh_token},
        format="json",
    )
    assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_logout_without_refresh_blacklists_all_outstanding(api_client, user_factory):
    password = "LogoutPass456"
    user = user_factory(password=password)
    api_client.post(
        "/api/v1/auth/email/login",
        {"email": user.email, "password": password},
        format="json",
    )

    api_client.force_authenticate(user=user)
    response = api_client.post("/api/v1/auth/logout")
    assert response.status_code == status.HTTP_200_OK

    outstanding_tokens = OutstandingToken.objects.filter(user=user)
    assert outstanding_tokens.exists()
    assert (
        BlacklistedToken.objects.filter(token__in=outstanding_tokens).count()
        == outstanding_tokens.count()
    )


@pytest.mark.django_db
def test_superadmin_permission_required(api_client, user_factory):
    # Non-admin should be forbidden (401 for unauthenticated)
    response = api_client.get("/api/v1/auth/search")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # Admin with correct flags should pass
    admin = user_factory(
        username="admin-user",
        email="admin@example.com",
        role="admin",
        is_staff=True,
        is_superuser=True,
    )
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/auth/search")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["success"] is True


# User Preferences Tests
@pytest.mark.django_db
def test_get_user_preferences(api_client, user_factory):
    """Test getting user preferences."""
    user = user_factory(password="TestPass123")
    api_client.force_authenticate(user=user)
    
    response = api_client.get("/api/v1/auth/me/preferences")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    # Check default values
    assert data["data"]["preferred_theme"] == "system"
    assert data["data"]["preferred_language"] == "zh-TW"
    assert data["data"]["editor_font_size"] == 14
    assert data["data"]["editor_tab_size"] == 4


@pytest.mark.django_db
def test_update_user_preferences(api_client, user_factory):
    """Test updating user preferences."""
    user = user_factory(password="TestPass123")
    api_client.force_authenticate(user=user)
    
    # Update preferences
    response = api_client.patch(
        "/api/v1/auth/me/preferences",
        {
            "preferred_theme": "dark",
            "preferred_language": "en",
            "editor_font_size": 16,
            "editor_tab_size": 2,
        },
        format="json",
    )
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert data["data"]["preferred_theme"] == "dark"
    assert data["data"]["preferred_language"] == "en"
    assert data["data"]["editor_font_size"] == 16
    assert data["data"]["editor_tab_size"] == 2


@pytest.mark.django_db
def test_update_preferences_partial(api_client, user_factory):
    """Test updating only some preferences."""
    user = user_factory(password="TestPass123")
    api_client.force_authenticate(user=user)
    
    # Only update theme
    response = api_client.patch(
        "/api/v1/auth/me/preferences",
        {"preferred_theme": "light"},
        format="json",
    )
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["data"]["preferred_theme"] == "light"
    # Other fields should remain default
    assert data["data"]["preferred_language"] == "zh-TW"


@pytest.mark.django_db
def test_update_preferences_invalid_theme(api_client, user_factory):
    """Test updating with invalid theme value."""
    user = user_factory(password="TestPass123")
    api_client.force_authenticate(user=user)
    
    response = api_client.patch(
        "/api/v1/auth/me/preferences",
        {"preferred_theme": "invalid"},
        format="json",
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_update_preferences_invalid_font_size(api_client, user_factory):
    """Test updating with invalid font size."""
    user = user_factory(password="TestPass123")
    api_client.force_authenticate(user=user)
    
    # Font size too small
    response = api_client.patch(
        "/api/v1/auth/me/preferences",
        {"editor_font_size": 8},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    # Font size too large
    response = api_client.patch(
        "/api/v1/auth/me/preferences",
        {"editor_font_size": 30},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# Change Password Tests
@pytest.mark.django_db
def test_change_password_success(api_client, user_factory):
    """Test successful password change."""
    old_password = "OldPass123!"
    new_password = "NewPass456!"
    user = user_factory(password=old_password)
    api_client.force_authenticate(user=user)
    
    response = api_client.post(
        "/api/v1/auth/change-password",
        {
            "current_password": old_password,
            "new_password": new_password,
            "new_password_confirm": new_password,
        },
        format="json",
    )
    
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["success"] is True
    
    # Verify new password works
    user.refresh_from_db()
    assert user.check_password(new_password)


@pytest.mark.django_db
def test_change_password_wrong_current(api_client, user_factory):
    """Test password change with wrong current password."""
    user = user_factory(password="CorrectPass123!")
    api_client.force_authenticate(user=user)
    
    response = api_client.post(
        "/api/v1/auth/change-password",
        {
            "current_password": "WrongPass123!",
            "new_password": "NewPass456!",
            "new_password_confirm": "NewPass456!",
        },
        format="json",
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "WRONG_PASSWORD"


@pytest.mark.django_db
def test_change_password_mismatch(api_client, user_factory):
    """Test password change with mismatched new passwords."""
    user = user_factory(password="OldPass123!")
    api_client.force_authenticate(user=user)
    
    response = api_client.post(
        "/api/v1/auth/change-password",
        {
            "current_password": "OldPass123!",
            "new_password": "NewPass456!",
            "new_password_confirm": "DifferentPass789!",
        },
        format="json",
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_change_password_oauth_user(api_client, user_factory):
    """Test that OAuth users cannot change password."""
    user = user_factory(auth_provider="nycu-oauth")
    api_client.force_authenticate(user=user)
    
    response = api_client.post(
        "/api/v1/auth/change-password",
        {
            "current_password": "any",
            "new_password": "NewPass456!",
            "new_password_confirm": "NewPass456!",
        },
        format="json",
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "OAUTH_USER"


@pytest.mark.django_db
def test_preferences_unauthenticated(api_client):
    """Test that unauthenticated users cannot access preferences."""
    response = api_client.get("/api/v1/auth/me/preferences")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_change_password_unauthenticated(api_client):
    """Test that unauthenticated users cannot change password."""
    response = api_client.post(
        "/api/v1/auth/change-password",
        {
            "current_password": "any",
            "new_password": "NewPass456!",
            "new_password_confirm": "NewPass456!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
