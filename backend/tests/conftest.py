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
        # Extract password before updating defaults
        password = kwargs.pop('password', None)
        defaults.update(kwargs)
        
        if defaults['auth_provider'] == 'email':
            # For email auth, use create_user to properly hash password
            user = User.objects.create_user(
                password=password or 'testpass123',
                **defaults
            )
        else:
            # For OAuth providers, no password needed
            user = User.objects.create(**defaults)
        
        return user
    
    return create_user


@pytest.fixture
def authenticated_client(api_client, user_factory):
    """Return an authenticated API client."""
    user = user_factory()
    api_client.force_authenticate(user=user)
    return api_client, user
