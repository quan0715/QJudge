import pytest
from rest_framework.test import APIClient
from apps.users.models import User


@pytest.fixture
def api_client():
    """Return an API client for making requests."""
    return APIClient()


@pytest.fixture
def user_factory():
    """Factory for creating test users."""
    def create_user(**kwargs):
        defaults = {
            'username': 'testuser',
            'email': 'test@example.com',
            'auth_provider': 'email',
        }
        defaults.update(kwargs)
        
        if defaults['auth_provider'] == 'email' and 'password' not in kwargs:
            user = User.objects.create_user(
                password='testpass123',
                **defaults
            )
        else:
            user = User.objects.create(**defaults)
        
        return user
    
    return create_user


@pytest.fixture
def authenticated_client(api_client, user_factory):
    """Return an authenticated API client."""
    user = user_factory()
    api_client.force_authenticate(user=user)
    return api_client, user
