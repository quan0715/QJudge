"""OpenAPI for application JSON actions with a single envelope contract."""
from copy import deepcopy

from drf_spectacular.openapi import AutoSchema
from drf_spectacular.plumbing import ResolvedComponent
from rest_framework import serializers



def success_schema(data, *, paginated=False):
    meta = {'type': 'object', 'additionalProperties': True}
    if paginated:
        meta = {'type': 'object', 'required': ['pagination'], 'properties': {
            'pagination': {'type': 'object', 'required': ['count', 'next', 'previous'], 'properties': {
                'count': {'type': 'integer'},
                'next': {'type': 'string', 'nullable': True},
                'previous': {'type': 'string', 'nullable': True},
            }},
        }}
    return {'type': 'object', 'required': ['data', 'meta'], 'additionalProperties': False,
            'properties': {'data': data, 'meta': meta}}


ERROR_SCHEMA = {
    'type': 'object', 'required': ['errors', 'meta'], 'additionalProperties': False,
    'properties': {
        'errors': {'type': 'array', 'minItems': 1, 'items': {
            'type': 'object', 'required': ['code', 'message', 'field', 'details'],
            'properties': {'code': {'type': 'string'}, 'message': {'type': 'string'},
                           'field': {'type': 'string', 'nullable': True},
                           'details': {'type': 'object', 'additionalProperties': True}},
        }},
        'meta': {'type': 'object', 'required': ['request_id', 'timestamp'], 'properties': {
            'request_id': {'type': 'string', 'nullable': True},
            'timestamp': {'type': 'string', 'format': 'date-time'},
        }},
    },
}


class ResponseContractSchema(AutoSchema):
    def _get_response_bodies(self, direction='response'):
        responses = super()._get_response_bodies(direction)
        if not self.view.api_contract_enabled:
            return responses
        for code, response in responses.items():
            if not code.startswith('2') or code == '204':
                continue
            for media, content in response.get('content', {}).items():
                if media != 'application/json':
                    continue
                data = deepcopy(content['schema'])
                paginated = self._is_list_view() and self._get_paginator() is not None
                if paginated:
                    serializer = self.get_response_serializers()
                    if isinstance(serializer, serializers.ListSerializer):
                        serializer = serializer.child
                    data = {'type': 'array', 'items': self.resolve_serializer(serializer, direction).ref}
                content['schema'] = success_schema(data, paginated=paginated)
            response['description'] = 'Success envelope.'
        if '204' in responses:
            del responses['204']
            responses['200'] = {
                'description': 'Successful command with null data.',
                'content': {'application/json': {'schema': success_schema({'nullable': True, 'enum': [None]})}},
            }
        error = ResolvedComponent(name='APIErrorEnvelope', type=ResolvedComponent.SCHEMA,
                                  object=ERROR_SCHEMA, schema=ERROR_SCHEMA)
        self.registry.register_on_missing(error)
        for code in ('400', '401', '403', '404', '429', '500', '503'):
            responses.setdefault(code, {
                'description': 'Error envelope. 503 may carry Retry-After and X-QJudge-Retryable.',
                'content': {'application/json': {'schema': error.ref}},
            })
        return responses
