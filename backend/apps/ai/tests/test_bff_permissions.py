import pytest

from .test_bff_contract import ai_transport, api_client, student


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/ai/sessions/"),
        ("post", "/api/v1/ai/sessions/new_session/"),
        ("get", "/api/v1/ai/runs/?status=active"),
        ("get", "/api/v1/ai/models/"),
        ("get", "/api/v1/ai/usage/"),
        (
            "get",
            "/api/v1/ai/artifacts/?session_id=11111111-1111-1111-1111-111111111111",
        ),
    ],
)
def test_student_permission_short_circuits_before_upstream(
    api_client, student, ai_transport, method, path
) -> None:
    api_client.force_authenticate(student)

    response = getattr(api_client, method)(path, {}, format="json")

    assert response.status_code == 403
    assert ai_transport.requests == []


def test_unauthenticated_request_short_circuits_before_upstream(
    api_client, ai_transport
) -> None:
    response = api_client.get("/api/v1/ai/sessions/")

    assert response.status_code in (401, 403)
    assert ai_transport.requests == []


def test_internal_artifact_ownership_route_is_removed(api_client, ai_transport) -> None:
    response = api_client.get("/api/v1/ai/_internal/artifacts/")

    assert response.status_code == 404
    assert ai_transport.requests == []
