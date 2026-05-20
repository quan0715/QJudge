import httpx

from qjudge_paper_cli.api import QJudgeApiClient


def test_api_client_sends_bearer_token():
    seen_headers = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen_headers.update(request.headers)
        return httpx.Response(200, json={"ok": True})

    client = QJudgeApiClient(
        base_url="https://qjudge.example",
        access_token="token-123",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert client.get_json("/api/v1/auth/me") == {"ok": True}
    assert seen_headers["authorization"] == "Bearer token-123"


def test_list_classrooms_accepts_paginated_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"results": [{"id": "c1", "name": "Class"}]})

    client = QJudgeApiClient(
        base_url="https://qjudge.example",
        access_token="token-123",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert client.list_classrooms() == [{"id": "c1", "name": "Class"}]
