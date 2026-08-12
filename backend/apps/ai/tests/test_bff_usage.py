from .test_bff_contract import ai_transport, api_client, teacher


def test_usage_endpoint_is_removed(api_client, teacher, ai_transport) -> None:
    api_client.force_authenticate(teacher)

    response = api_client.get("/api/v1/ai/usage/")

    assert response.status_code == 404
    assert ai_transport.requests == []


def test_legacy_credit_route_is_removed(api_client, teacher, ai_transport) -> None:
    api_client.force_authenticate(teacher)

    response = api_client.get("/api/v1/ai/sessions/credit/")

    assert response.status_code == 404
    assert ai_transport.requests == []
