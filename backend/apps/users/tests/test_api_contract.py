"""Cross-route invariants of the users-domain HTTP contract."""
import ast
from pathlib import Path

import pytest
from rest_framework.test import APIClient
from apps.users.models import User, UserProfile
from apps.users.serializers import UserPreferencesUpdateSerializer


@pytest.mark.django_db
def test_user_projection_and_nested_settings():
    user = User.objects.create_user(username='contract', email='contract@example.test', password='StrongPassword123!')
    client = APIClient()
    client.force_authenticate(user)
    body = client.get('/api/v1/users/me').json()
    assert set(body) == {'data', 'meta'}
    assert set(body['data']) == {'id', 'username', 'email', 'role', 'auth_provider', 'last_login_at', 'onboarding_completed_at', 'profile'}
    assert set(body['data']['profile']) == {'display_name', 'avatar_url'}
    assert body['data']['profile']['avatar_url'] is None
    response = client.patch('/api/v1/users/me/preferences', {
        'profile': {'display_name': 'Ada'}, 'preferences': {'editor_tab_size': 2},
    }, format='json')
    assert response.status_code == 200
    settings = response.json()['data']
    assert set(settings) == {'profile', 'preferences', 'onboarding_completed_at'}
    assert settings['profile']['display_name'] == 'Ada'
    assert settings['preferences']['editor_tab_size'] == 2
    assert settings['preferences']['preferred_language'] == 'zh-TW'
    cleared = client.patch('/api/v1/users/me/preferences', {'profile': {'avatar_url': None}}, format='json')
    assert cleared.json()['data']['profile']['avatar_url'] is None
    assert UserProfile.objects.get(user=user).display_name == 'Ada'


@pytest.mark.parametrize('data', [{'display_name': 'legacy'}, {'preferences': {'unknown': True}}, {'profile': {'solved_count': 9}}])
def test_settings_reject_unknown_or_legacy_fields(data):
    serializer = UserPreferencesUpdateSerializer(data=data)
    assert not serializer.is_valid()


@pytest.mark.django_db
def test_commands_permissions_and_validation_share_contract():
    client = APIClient()
    denied = client.get('/api/v1/users/me')
    assert denied.status_code == 401
    body = denied.json()
    assert set(body) == {'errors', 'meta'}
    assert set(body['meta']) == {'request_id', 'timestamp'}
    assert set(body['errors'][0]) == {'code', 'message', 'field', 'details'}
    user = User.objects.create_user(username='command', email='command@example.test', password='StrongPassword123!')
    client.force_authenticate(user)
    invalid = client.patch('/api/v1/users/me/preferences', {'preferences': {'editor_tab_size': 3}}, format='json')
    assert invalid.status_code == 400
    assert invalid.json()['errors'][0]['field'] == 'preferences.editor_tab_size'
    assert client.post('/api/v1/auth/logout', {}, format='json').json() == {'data': None, 'meta': {}}


def test_views_do_not_construct_legacy_response_wrappers():
    for path in (Path(__file__).parents[1] / 'views').glob('*.py'):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Dict):
                keys = {k.value for k in node.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)}
                assert 'success' not in keys, path
                assert not {'error', 'data'} & keys, path


def test_openapi_users_routes_document_wrapped_named_responses():
    from drf_spectacular.generators import SchemaGenerator
    from apps.users.urls import urlpatterns
    schema = SchemaGenerator(patterns=urlpatterns).get_schema(public=True)
    schemas = schema['components']['schemas']
    assert set(schemas['UserObject']['properties']) == {'id', 'username', 'email', 'role', 'auth_provider', 'last_login_at', 'onboarding_completed_at', 'profile'}
    assert schemas['UserObject']['properties']['onboarding_completed_at'].get('nullable') is True
    assert set(schemas['UserSettingsObject']['properties']) == {'profile', 'preferences', 'onboarding_completed_at'}
    for path in schema['paths'].values():
        for operation in path.values():
            if not isinstance(operation, dict) or 'responses' not in operation:
                continue
            for code, response in operation['responses'].items():
                body = response['content']['application/json']['schema']
                if code.startswith('2'):
                    assert set(body['properties']) == {'data', 'meta'}
                    assert set(body['required']) == {'data', 'meta'}
                else:
                    assert body == {'$ref': '#/components/schemas/ApiErrorObject'}


def test_openapi_users_auth_examples_follow_the_runtime_envelope():
    from django.urls import include, path
    from drf_spectacular.generators import SchemaGenerator
    schema = SchemaGenerator(patterns=[
        path('api/v1/users/', include('apps.users.urls')),
        path('api/v1/auth/', include('apps.users.auth_urls')),
    ]).get_schema(public=True)

    def example(route, method, status):
        body = schema['paths'][route][method]['responses'][status]['content']['application/json']
        assert body.get('examples'), (route, method, status)
        return next(iter(body['examples'].values()))['value']

    for route, method, status in [
        ('/api/v1/users/me', 'get', '200'),
        ('/api/v1/users/', 'get', '200'),
        ('/api/v1/users/{id}/role', 'patch', '200'),
        ('/api/v1/users/me/preferences', 'patch', '200'),
        ('/api/v1/auth/providers', 'get', '200'),
        ('/api/v1/auth/login/{provider}', 'post', '200'),
    ]:
        assert set(example(route, method, status)) == {'data', 'meta'}
    assert example('/api/v1/auth/password/reset-requests', 'post', '202')['data'] is None
    assert example('/api/v1/auth/logout', 'post', '200')['data'] is None
    validation = example('/api/v1/users/me/preferences', 'patch', '400')
    assert set(validation) == {'errors', 'meta'}
    assert validation['errors'][0]['field'] == 'preferences.editor_tab_size'
    credentials = example('/api/v1/auth/login/{provider}', 'post', '401')
    assert credentials['errors'][0]['code'] == 'auth_001'
    assert set(credentials['errors'][0]) == {'code', 'message', 'field', 'details'}
    assert set(credentials['meta']) == {'request_id', 'timestamp'}
    conflict = example('/api/v1/auth/login/{provider}', 'post', '409')
    assert conflict['errors'][0]['code'] == 'active_exam_session_exists'
    assert 'active_exam' in conflict['errors'][0]['details']
