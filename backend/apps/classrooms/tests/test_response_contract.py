"""Wire-level coverage of the single classroom JSON contract."""
import pytest
from django.urls import resolve
from rest_framework.test import APIClient, APIRequestFactory
from apps.classrooms.models import Classroom
from apps.users.models import User

ID = '11111111-1111-1111-1111-111111111111'
CASES = [
    ('get', ''), ('post', ''), ('get', f'{ID}/'), ('put', f'{ID}/'),
    ('patch', f'{ID}/'), ('delete', f'{ID}/'),
    ('get', f'{ID}/members/'), ('post', f'{ID}/members/'),
    ('patch', f'{ID}/members/1/'), ('delete', f'{ID}/members/1/'),
    ('post', f'{ID}/invite-code/'), ('get', f'{ID}/contests/'), ('post', f'{ID}/contests/'),
    ('get', f'{ID}/gradebook/'), ('get', f'{ID}/announcements/'),
    ('post', f'{ID}/announcements/'), ('patch', f'{ID}/announcements/1/'),
    ('delete', f'{ID}/announcements/1/'), ('post', f'{ID}/cover/'),
]


@pytest.mark.parametrize('method,suffix', CASES)
def test_each_json_action_has_canonical_auth_errors(method, suffix):
    path = '/api/v1/classrooms/' + suffix
    match = resolve(path)
    request = getattr(APIRequestFactory(), method)(path)
    response = match.func(request, **match.kwargs)
    assert response.status_code == 401
    assert response.data['errors'][0]['code'] == 'not_authenticated'
    assert set(response.data['meta']) == {'request_id', 'timestamp'}


def test_gradebook_download_preserves_its_error_protocol():
    path = f'/api/v1/classrooms/{ID}/gradebook/export/'
    match = resolve(path)
    response = match.func(APIRequestFactory().get(path), **match.kwargs)
    assert response.data['success'] is False


@pytest.mark.django_db
def test_classroom_lifecycle_roundtrips_canonical_contract():
    teacher = User.objects.create_user(username='contract-teacher', email='contract-teacher@example.test', role='teacher')
    client = APIClient()
    client.force_authenticate(teacher)

    created = client.post('/api/v1/classrooms/', {'name': 'Contract class'}, format='json')
    assert created.status_code == 201
    room_id = created.json()['data']['uuid']
    detail_url = f'/api/v1/classrooms/{room_id}/'
    assert client.get(detail_url).json()['data']['uuid'] == room_id
    listing = client.get('/api/v1/classrooms/').json()
    assert listing['meta']['pagination']['count'] == 1
    assert listing['data'][0]['uuid'] == room_id
    invalid = client.patch(detail_url, {'name': ''}, format='json')
    assert invalid.status_code == 400
    assert invalid.json()['errors'][0]['field'] == 'name'
    result = client.delete(detail_url)
    assert result.status_code == 200
    assert result.json() == {'data': None, 'meta': {}}
    assert Classroom.objects.get(uuid=room_id).is_archived
    assert client.get('/api/v1/classrooms/').json()['data'] == []


def test_openapi_describes_one_contract_and_preserves_download():
    from drf_spectacular.generators import SchemaGenerator
    from apps.classrooms.urls import urlpatterns
    paths = SchemaGenerator(patterns=urlpatterns).get_schema(public=True)['paths']
    listing = paths['/']['get']
    schema = listing['responses']['200']['content']['application/json']['schema']
    assert schema['required'] == ['data', 'meta']
    assert schema['properties']['data']['type'] == 'array'
    assert 'pagination' in schema['properties']['meta']['properties']
    delete = paths['/{id}/']['delete']['responses']
    assert '204' not in delete and '200' in delete
    assert delete['200']['content']['application/json']['schema']['properties']['data']['nullable'] is True
    download = paths['/{id}/gradebook/export/']['get']
    assert 'data' not in download['responses']['200'].get('content', {}).get('application/json', {}).get('schema', {}).get('properties', {})


@pytest.mark.django_db
def test_classroom_actions_serialize_resources_and_commands_once():
    teacher = User.objects.create_user(username='contract-owner', email='contract-owner@example.test', role='teacher')
    student = User.objects.create_user(username='contract-student', email='contract-student@example.test', role='student')
    room = Classroom.objects.create(name='Class', owner=teacher)
    client = APIClient()
    client.force_authenticate(teacher)
    base = f'/api/v1/classrooms/{room.uuid}/'

    def data(response, status=200):
        assert response.status_code == status
        body = response.json()
        assert set(body) == {'data', 'meta'}
        assert isinstance(body['meta'], dict)
        return body['data']

    assert data(client.put(base, {'name': 'Renamed'}, format='json'))['name'] == 'Renamed'
    assert data(client.patch(base, {'description': 'Updated'}, format='json'))['description'] == 'Updated'
    assert data(client.get(base + 'members/')) == []
    added = data(client.post(base + 'members/', {'usernames': [student.username], 'role': 'student'}, format='json'))
    assert added['added'] == [student.username]
    assert len(data(client.get(base + 'members/'))) == 1
    data(client.patch(base + f'members/{student.pk}/', {'role': 'ta'}, format='json'))
    assert data(client.get(base + 'members/'))[0]['role'] == 'ta'
    assert data(client.delete(base + f'members/{student.pk}/')) is None
    assert data(client.post(base + 'invite-code/'))['invite_code']
    assert data(client.get(base + 'announcements/')) == []
    announcement = data(client.post(base + 'announcements/', {'title': 'News', 'content': 'Hello'}, format='json'), 201)
    ann_url = base + f"announcements/{announcement['id']}/"
    assert data(client.patch(ann_url, {'title': 'Updated'}, format='json'))['title'] == 'Updated'
    assert data(client.get(base + 'announcements/'))[0]['id'] == announcement['id']
    assert data(client.delete(ann_url)) is None
    assert data(client.get(base + 'contests/')) == []
    exam = data(client.post(base + 'contests/', {'name': 'Exam', 'contest_type': 'paper_exam'}, format='json'), 201)
    assert data(client.get(base + 'contests/'))[0]['contest_id'] == exam['contest_id']
    assert set(data(client.get(base + 'gradebook/'))) >= {'students', 'contests'}
    download = client.get(base + 'gradebook/export/')
    assert download.status_code == 200
    assert download['Content-Type'].startswith('text/csv')
    assert 'attachment' in download['Content-Disposition']


@pytest.mark.django_db
def test_classroom_forbidden_missing_and_paginated_empty_responses():
    teacher = User.objects.create_user(username='contract-pagination', email='contract-pagination@example.test', role='teacher')
    outsider = User.objects.create_user(username='contract-outsider', email='contract-outsider@example.test', role='student')
    rooms = [Classroom.objects.create(name=f'Class {n}', owner=teacher, invite_code=f'PAGE{n:04}') for n in range(21)]
    client = APIClient()
    client.force_authenticate(outsider)
    forbidden = client.get(f'/api/v1/classrooms/{rooms[0].uuid}/')
    assert forbidden.status_code == 403
    assert forbidden.json()['errors'][0]['code'] == 'permission_denied'
    client.force_authenticate(teacher)
    missing = client.get(f'/api/v1/classrooms/{ID}/')
    assert missing.status_code == 404
    assert missing.json()['errors'][0]['code'] == 'not_found'
    first = client.get('/api/v1/classrooms/?page_size=1').json()
    assert first['meta']['pagination']['count'] == 21
    # Use the server's real navigation, independent of configured page size.
    next_page = first['meta']['pagination']['next']
    seen = list(first['data'])
    while next_page:
        from urllib.parse import urlsplit
        url = urlsplit(next_page)
        body = client.get(url.path + '?' + url.query).json()
        seen.extend(body['data'])
        assert body['meta']['pagination']['previous']
        next_page = body['meta']['pagination']['next']
    assert len({row['uuid'] for row in seen}) == 21


def test_openapi_matches_custom_action_arrays_created_status_and_binary_download():
    from drf_spectacular.generators import SchemaGenerator
    from apps.classrooms.urls import urlpatterns
    paths = SchemaGenerator(patterns=urlpatterns).get_schema(public=True)['paths']
    for suffix in ('members', 'announcements', 'contests'):
        operation = paths[f'/{{id}}/{suffix}/']['get']
        payload = operation['responses']['200']['content']['application/json']['schema']['properties']['data']
        assert payload['type'] == 'array'
        assert 'pagination' not in operation['responses']['200']['content']['application/json']['schema']['properties']['meta'].get('properties', {})
    for suffix in ('announcements', 'contests'):
        assert '201' in paths[f'/{{id}}/{suffix}/']['post']['responses']
    assert 'text/csv' in paths['/{id}/gradebook/export/']['get']['responses']['200']['content']


def test_classroom_schema_validates_and_has_only_http_response_codes():
    from drf_spectacular.generators import SchemaGenerator
    from drf_spectacular.validation import validate_schema
    from apps.classrooms.urls import urlpatterns
    schema = SchemaGenerator(patterns=urlpatterns).get_schema(public=True)
    validate_schema(schema)
    for item in schema['paths'].values():
        for operation in item.values():
            assert all(code.isdigit() or code == 'default' for code in operation['responses'])
