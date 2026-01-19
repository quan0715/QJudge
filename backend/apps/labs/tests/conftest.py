import pytest
from rest_framework.test import APIClient
from apps.users.models import User


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user_factory():
    def create_user(**kwargs):
        defaults = {
            "username": "testuser",
            "email": "test@example.com",
            "auth_provider": "email",
        }
        defaults.update(kwargs)
        password = defaults.pop("password", "testpass123")

        if defaults["auth_provider"] == "email":
            user = User.objects.create_user(password=password, **defaults)
        else:
            user = User.objects.create(**defaults)

        return user

    return create_user
