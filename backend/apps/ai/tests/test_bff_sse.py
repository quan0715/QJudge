import httpx

from apps.ai.services.ai_service_client import AIServiceClient

from .test_bff_contract import ChunkStream, RUN_ID, api_client, teacher


class FailingReadStream(httpx.SyncByteStream):
    def __iter__(self):
        request = httpx.Request("GET", "https://ai-service.test/v1/runs/events")
        raise httpx.ReadError("upstream reset", request=request)
        yield b""  # pragma: no cover


def test_stream_proxy_returns_exact_upstream_chunks(
    api_client, teacher, monkeypatch
) -> None:
    chunks = [
        b"id: 7\nevent: agent_",
        b'message_delta\ndata: {"content":"hi"}\n\n',
        b": heartbeat\n\n",
    ]
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, stream=ChunkStream(chunks))

    client = AIServiceClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("apps.ai.views.get_ai_service_client", lambda: client)
    monkeypatch.setattr(
        "apps.ai.services.ai_service_client.issue_resource_token",
        lambda *args, **kwargs: "signed-token",
    )
    api_client.force_authenticate(teacher)

    response = api_client.get(
        f"/api/v1/ai/runs/{RUN_ID}/events/?after=6",
        HTTP_LAST_EVENT_ID="5",
    )

    assert b"".join(response.streaming_content) == b"".join(chunks)
    assert requests[0].url.path == f"/v1/runs/{RUN_ID}/events"
    assert requests[0].url.query == b"after=6"
    assert requests[0].headers["last-event-id"] == "5"
    assert response["Content-Type"].startswith("text/event-stream")
    assert response["Cache-Control"] == "no-cache, no-transform"
    assert response["X-Accel-Buffering"] == "no"


def test_stream_does_not_retry_after_transport_failure(
    api_client, teacher, monkeypatch
) -> None:
    attempts = 0

    def fail(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise httpx.ConnectError("offline", request=request)

    client = AIServiceClient(transport=httpx.MockTransport(fail))
    monkeypatch.setattr("apps.ai.views.get_ai_service_client", lambda: client)
    monkeypatch.setattr(
        "apps.ai.services.ai_service_client.issue_resource_token",
        lambda *args, **kwargs: "signed-token",
    )
    api_client.force_authenticate(teacher)

    response = api_client.get(f"/api/v1/ai/runs/{RUN_ID}/events/")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_SERVICE_UNAVAILABLE"
    assert attempts == 1


def test_header_only_last_event_id_is_not_overridden_by_after_zero(
    api_client, teacher, monkeypatch
) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, stream=ChunkStream([b": heartbeat\n\n"]))

    client = AIServiceClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("apps.ai.views.get_ai_service_client", lambda: client)
    monkeypatch.setattr(
        "apps.ai.services.ai_service_client.issue_resource_token",
        lambda *args, **kwargs: "signed-token",
    )
    api_client.force_authenticate(teacher)

    response = api_client.get(
        f"/api/v1/ai/runs/{RUN_ID}/events/", HTTP_LAST_EVENT_ID="7"
    )

    assert b"".join(response.streaming_content) == b": heartbeat\n\n"
    assert requests[0].url.query == b""
    assert requests[0].headers["last-event-id"] == "7"


def test_error_stream_read_failure_returns_unavailable_once(
    api_client, teacher, monkeypatch
) -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(503, stream=FailingReadStream())

    client = AIServiceClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("apps.ai.views.get_ai_service_client", lambda: client)
    monkeypatch.setattr(
        "apps.ai.services.ai_service_client.issue_resource_token",
        lambda *args, **kwargs: "signed-token",
    )
    api_client.force_authenticate(teacher)

    response = api_client.get(f"/api/v1/ai/runs/{RUN_ID}/events/")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_SERVICE_UNAVAILABLE"
    assert attempts == 1
