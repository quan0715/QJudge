import httpx
import pytest

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
        return httpx.Response(200, json={"data": [{"id": "c1", "name": "Class"}], "meta": {"pagination": {"count": 1, "next": None, "previous": None}}})

    client = QJudgeApiClient(
        base_url="https://qjudge.example",
        access_token="token-123",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert client.list_classrooms() == [{"id": "c1", "name": "Class"}]


def test_list_classroom_exams_uses_classroom_identifier_in_path():
    seen_url = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal seen_url
        seen_url = str(request.url)
        return httpx.Response(
            200,
            json={"data": [
                {
                    "contest_id": "contest-uuid",
                    "contest_name": "Midterm",
                }
            ], "meta": {}},
        )

    client = QJudgeApiClient(
        base_url="https://qjudge.example",
        access_token="token-123",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert client.list_classroom_exams("classroom-uuid") == [
        {"contest_id": "contest-uuid", "contest_name": "Midterm"}
    ]
    assert seen_url == "https://qjudge.example/api/v1/classrooms/classroom-uuid/contests/"


def test_iter_run_events_uses_frontend_compatible_headers():
    seen_headers = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen_headers.update(request.headers)
        return httpx.Response(200, content=b'data: {"type": "run_completed"}\n\n')

    client = QJudgeApiClient(
        base_url="https://qjudge.example",
        access_token="token-123",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert list(client.iter_run_events("run-123")) == [{"type": "run_completed"}]
    assert seen_headers["authorization"] == "Bearer token-123"
    assert seen_headers["x-qjudge-agent-contract"] == "v2"
    assert seen_headers["accept"] == "*/*"


def test_artifact_content_uses_frontend_compatible_headers():
    seen_headers = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen_headers.update(request.headers)
        return httpx.Response(200, text="rubric")

    client = QJudgeApiClient(
        base_url="https://qjudge.example",
        access_token="token-123",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert client.artifact_content("artifact-123") == "rubric"
    assert seen_headers["authorization"] == "Bearer token-123"
    assert seen_headers["accept"] == "*/*"


@pytest.mark.parametrize("body", [[], {"results": []}, {"data": []}, {"data": [], "meta": {}},
    {"data": [], "meta": {"pagination": {"count": "oops", "next": None, "previous": []}}},
    {"data": [], "meta": {"pagination": {"count": -1, "next": None, "previous": None}}},
    {"data": [], "meta": {"pagination": {"count": True, "next": None, "previous": None}}},
])
def test_classroom_list_rejects_missing_contract_or_pagination(body):
    client = QJudgeApiClient(base_url="https://qjudge.example", access_token="token",
        http_client=httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body))))
    with pytest.raises(ValueError, match="contract"):
        client.list_classrooms()


def test_classroom_list_reads_every_page():
    def handler(request):
        page = request.url.params.get("page", "1")
        return httpx.Response(200, json={"data": [{"uuid": page}], "meta": {"pagination": {
            "count": 2, "next": "https://qjudge.example/api/v1/classrooms/?page=2" if page == "1" else None,
            "previous": None,
        }}})
    client = QJudgeApiClient(base_url="https://qjudge.example", access_token="token",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert client.list_classrooms() == [{"uuid": "1"}, {"uuid": "2"}]
