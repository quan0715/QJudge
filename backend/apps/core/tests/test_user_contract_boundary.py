"""The users slice owns a strict boundary; other protocols remain unchanged."""
import json
from types import SimpleNamespace

import pytest
from django.db import OperationalError
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory

from apps.core.api.renderer import ContractJSONRenderer
from apps.core.exceptions import custom_exception_handler
from apps.core.views.errors import contract_server_error


def render(payload, code=200):
    response = Response(payload, status=code)
    body = ContractJSONRenderer().render(payload, renderer_context={"response": response})
    return json.loads(body), response.status_code


@pytest.mark.parametrize("payload", [{"id": 7}, [1, 2], None, "ok"])
def test_success_is_always_a_required_data_and_meta_pair(payload):
    assert render(payload)[0] == {"data": payload, "meta": {}}


def test_pagination_preserves_resource_and_navigation():
    assert render({"count": 3, "next": "/next", "previous": None, "results": [{"id": 7}]})[0] == {
        "data": [{"id": 7}], "meta": {"pagination": {"count": 3, "next": "/next", "previous": None}}
    }


def test_no_content_commands_become_json_200():
    assert render(None, 204) == ({"data": None, "meta": {}}, 200)


@pytest.mark.parametrize("exc", [PermissionDenied("denied"), ValidationError({"email": ["invalid"]}), OperationalError("too many clients")])
def test_users_exceptions_have_structured_errors_and_request_metadata(exc):
    request = SimpleNamespace(request_id="req-user")
    response = custom_exception_handler(exc, {"request": request, "view": SimpleNamespace(api_contract_enabled=True)})
    body, code = render(response.data, response.status_code)
    assert code >= 400
    assert set(body) == {"errors", "meta"}
    assert body["meta"]["request_id"] == "req-user"
    assert body["meta"]["timestamp"]
    for error in body["errors"]:
        assert set(error) == {"code", "message", "field", "details"}
        assert error["code"] == error["code"].lower()
        assert isinstance(error["details"], dict)


def test_other_domains_keep_their_own_error_contract():
    response = custom_exception_handler(PermissionDenied("denied"), {"view": SimpleNamespace()})
    assert response.data["success"] is False


def test_unhandled_user_error_is_canonical_in_production(settings):
    settings.DEBUG = False
    request = APIRequestFactory().get("/api/v1/users/me")
    request.request_id = "req-500"
    response = contract_server_error(request)
    assert response.status_code == 500
    assert json.loads(response.content)["errors"][0]["code"] == "internal_error"
