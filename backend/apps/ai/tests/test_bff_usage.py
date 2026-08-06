from .test_bff_contract import ai_transport, api_client, teacher


def test_usage_endpoint_maps_only_token_usage(
    api_client, teacher, ai_transport
) -> None:
    ai_transport.respond_json(
        200,
        {
            "total_input_tokens": 10,
            "total_output_tokens": 4,
            "total_runs": 3,
            "updated_at": "2026-08-05T00:00:00Z",
        },
    )
    api_client.force_authenticate(teacher)

    response = api_client.get("/api/v1/ai/usage/")

    assert ai_transport.requests[0].url.path == "/v1/usage"
    assert response.json() == {
        "total_input_tokens": 10,
        "total_output_tokens": 4,
        "total_runs": 3,
        "updated_at": "2026-08-05T00:00:00Z",
    }


def test_legacy_credit_route_is_removed(api_client, teacher, ai_transport) -> None:
    api_client.force_authenticate(teacher)

    response = api_client.get("/api/v1/ai/sessions/credit/")

    assert response.status_code == 404
    assert ai_transport.requests == []
