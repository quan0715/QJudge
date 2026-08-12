import asyncio
import threading

import httpx

from apps.ai.services.ai_service_client import AIServiceClient

from .test_bff_contract import ChunkStream, RUN_ID, api_client, teacher


class FailingReadStream(httpx.SyncByteStream):
    def __iter__(self):
        request = httpx.Request("GET", "https://ai-service.test/v1/runs/events")
        raise httpx.ReadError("upstream reset", request=request)
        yield b""  # pragma: no cover


class BlockingSecondChunkStream(httpx.SyncByteStream):
    """Makes accidental pre-consumption of the whole upstream stream visible."""

    def __init__(self) -> None:
        self.second_chunk_requested = threading.Event()
        self.allow_second_chunk = threading.Event()

    def __iter__(self):
        yield b"data: first\n\n"
        self.second_chunk_requested.set()
        assert self.allow_second_chunk.wait(timeout=1)
        yield b"data: second\n\n"


async def _collect_async_chunks(response) -> list[bytes]:
    return [chunk async for chunk in response.streaming_content]


def _stream_body(response) -> bytes:
    if response.is_async:
        return b"".join(asyncio.run(_collect_async_chunks(response)))
    return b"".join(response.streaming_content)


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

    assert _stream_body(response) == b"".join(chunks)
    assert requests[0].url.path == f"/v1/runs/{RUN_ID}/events"
    assert requests[0].url.query == b"after=6"
    assert requests[0].headers["last-event-id"] == "5"
    assert response["Content-Type"].startswith("text/event-stream")
    assert response["Cache-Control"] == "no-cache, no-transform"
    assert response["X-Accel-Buffering"] == "no"


def test_stream_proxy_exposes_an_async_iterator_to_django_asgi(
    api_client, teacher, monkeypatch
) -> None:
    """Django ASGI must relay each upstream chunk without sync-iterator buffering."""
    chunks = [b"data: first\n\n", b"data: second\n\n"]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=ChunkStream(chunks))

    client = AIServiceClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("apps.ai.views.get_ai_service_client", lambda: client)
    monkeypatch.setattr(
        "apps.ai.services.ai_service_client.issue_resource_token",
        lambda *args, **kwargs: "signed-token",
    )
    api_client.force_authenticate(teacher)

    response = api_client.get(f"/api/v1/ai/runs/{RUN_ID}/events/")

    assert response.is_async is True
    assert asyncio.run(_collect_async_chunks(response)) == chunks


def test_stream_proxy_yields_first_chunk_before_upstream_stream_finishes(
    api_client, teacher, monkeypatch
) -> None:
    upstream = BlockingSecondChunkStream()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=upstream)

    client = AIServiceClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("apps.ai.views.get_ai_service_client", lambda: client)
    monkeypatch.setattr(
        "apps.ai.services.ai_service_client.issue_resource_token",
        lambda *args, **kwargs: "signed-token",
    )
    api_client.force_authenticate(teacher)

    response = api_client.get(f"/api/v1/ai/runs/{RUN_ID}/events/")

    async def read_first_chunk() -> bytes:
        stream = response.streaming_content
        try:
            return await asyncio.wait_for(anext(stream), timeout=0.2)
        finally:
            await stream.aclose()

    assert asyncio.run(read_first_chunk()) == b"data: first\n\n"
    assert upstream.second_chunk_requested.is_set() is False


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

    assert _stream_body(response) == b": heartbeat\n\n"
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
