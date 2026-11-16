"""An explicit envelope must survive the migrated JSON renderer exactly once."""
import json

import pytest
from rest_framework.response import Response

from apps.core.api.envelope import envelope, envelope_error
from apps.core.api.renderer import ContractJSONRenderer


def render(response):
    return json.loads(ContractJSONRenderer().render(
        response.data, renderer_context={"response": response},
    ))


@pytest.mark.parametrize('payload', [{'id': 7}, [], None, {'data': 1, 'meta': {'business': True}}])
def test_explicit_success_is_not_double_wrapped(payload):
    response = envelope(payload, meta={'projection': 'grading'}, status=201)
    assert render(response) == {'data': payload, 'meta': {'projection': 'grading'}}
    assert response.status_code == 201


def test_business_data_meta_keys_are_still_wrapped_as_a_resource():
    resource = {'data': [1], 'meta': {'label': 'business'}}
    assert render(Response(resource)) == {'data': resource, 'meta': {}}


def test_explicit_error_is_preserved():
    response = envelope_error('denied', 'Denied', status=403, meta={'request_id': 'r1'})
    assert render(response) == {
        'errors': [{'code': 'denied', 'message': 'Denied', 'field': None, 'details': {}}],
        'meta': {'request_id': 'r1'},
    }

from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIRequestFactory
from apps.core.api.response_contract import JSONContractMixin


class ContractProbe(JSONContractMixin, viewsets.ViewSet):
    authentication_classes = []
    permission_classes = []
    json_contract_actions = {'list', 'create', 'destroy', 'denied', 'invalid'}
    writes = 0

    def list(self, request):
        response = Response({'count': 2, 'next': '/next', 'previous': None, 'results': [1]})
        response['Vary'] = 'Cookie'
        return response

    def create(self, request):
        type(self).writes += 1
        return Response({'id': 1}, status=201)

    def destroy(self, request):
        return Response(status=204)

    def denied(self, request):
        raise PermissionDenied('Denied')

    def invalid(self, request):
        raise ValidationError({'members': {'email': ['invalid']}})

    def export(self, request):
        return HttpResponse('id\n1\n', content_type='text/csv')


def call(action, *, method='get'):
    request = getattr(APIRequestFactory(), method)('/probe')
    response = ContractProbe.as_view({method: action})(request)
    if hasattr(response, 'render'):
        response.render()
    return response


def test_pagination_preserves_navigation_and_existing_vary():
    response = call('list')
    assert json.loads(response.content) == {'data': [1], 'meta': {'pagination': {'count': 2, 'next': '/next', 'previous': None}}}
    assert 'Cookie' in response['Vary']


def test_write_runs_once_and_preserves_created_status():
    ContractProbe.writes = 0
    response = call('create', method='post')
    assert response.status_code == 201
    assert json.loads(response.content) == {'data': {'id': 1}, 'meta': {}}
    assert ContractProbe.writes == 1


def test_json_commands_convert_204():
    response = call('destroy', method='delete')
    assert response.status_code == 200
    assert json.loads(response.content) == {'data': None, 'meta': {}}


def test_errors_are_canonical_and_nested_validation_keeps_field_path():
    response = call('denied')
    assert response.status_code == 403
    body = json.loads(response.content)
    assert body['errors'][0]['code'] == 'permission_denied'
    assert set(body['meta']) == {'request_id', 'timestamp'}
    body = json.loads(call('invalid').content)
    assert body['errors'][0]['field'] == 'members.email'


def test_unregistered_download_stays_binary():
    response = call('export')
    assert response.status_code == 200
    assert response.content == b'id\n1\n'
    assert response['Content-Type'] == 'text/csv'


def test_framework_500_is_canonical():
    from apps.core.views.errors import contract_server_error
    request = APIRequestFactory().get('/probe')
    view = ContractProbe()
    view.action_map = {'get': 'list'}
    drf_request = view.initialize_request(request)
    view.initial(drf_request)
    response = contract_server_error(request)
    assert response.status_code == 500
    assert json.loads(response.content)['errors'][0]['code'] == 'internal_error'


def test_database_overload_keeps_retry_headers():
    from django.db import OperationalError
    from apps.core.exceptions import custom_exception_handler
    from types import SimpleNamespace
    response = custom_exception_handler(OperationalError('too many clients'), {
        'request': SimpleNamespace(api_contract_enabled=True, request_id='retry1'),
        'view': SimpleNamespace(api_contract_enabled=True),
    })
    assert response.status_code == 503
    assert response['Retry-After'] == '2'
    assert response['X-QJudge-Retryable'] == 'true'
    assert response.data['errors'][0]['code'] == 'db_overloaded'

