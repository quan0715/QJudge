import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from django.test import SimpleTestCase, override_settings

from apps.ai.ai_client import AIServiceClient, AIServiceError, SessionMode


def _http_status_error(status_code: int, detail: str = "error") -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "http://ai-service:8001/api/chat")
    response = httpx.Response(status_code, request=request, json={"detail": detail})
    return httpx.HTTPStatusError("boom", request=request, response=response)


@override_settings(
    AI_SERVICE_INTERNAL_TOKEN="test-token",
    AI_SERVICE_RETRY_ATTEMPTS=2,
    AI_SERVICE_RETRY_BACKOFF_SECONDS=0,
)
class TestAIServiceClientRetry(SimpleTestCase):
    def test_chat_retries_on_429_then_succeeds(self):
        client = AIServiceClient(base_url="http://ai-service:8001")

        first = MagicMock()
        first.raise_for_status.side_effect = _http_status_error(429, "rate limited")

        second = MagicMock()
        second.raise_for_status.return_value = None
        second.json.return_value = {
            "content": "ok",
            "session_context": {},
            "metadata": {},
        }

        mock_async_client = MagicMock()
        mock_async_client.post = AsyncMock(side_effect=[first, second])

        with patch("apps.ai.ai_client.httpx.AsyncClient") as async_client_cls, patch(
            "apps.ai.ai_client.asyncio.sleep", new_callable=AsyncMock
        ) as sleep_mock:
            async_client_cls.return_value.__aenter__.return_value = mock_async_client

            result = asyncio.run(
                client.chat(
                    conversation=[{"role": "user", "content": "hello"}],
                    session_mode=SessionMode.AUTO,
                )
            )

        self.assertEqual(result.content, "ok")
        self.assertEqual(mock_async_client.post.await_count, 2)
        self.assertEqual(sleep_mock.await_count, 1)

    def test_chat_retries_on_request_timeout_then_succeeds(self):
        client = AIServiceClient(base_url="http://ai-service:8001")

        request = httpx.Request("POST", "http://ai-service:8001/api/chat")
        timeout_error = httpx.ReadTimeout("timed out", request=request)

        success = MagicMock()
        success.raise_for_status.return_value = None
        success.json.return_value = {
            "content": "recovered",
            "session_context": {},
            "metadata": {},
        }

        mock_async_client = MagicMock()
        mock_async_client.post = AsyncMock(side_effect=[timeout_error, success])

        with patch("apps.ai.ai_client.httpx.AsyncClient") as async_client_cls, patch(
            "apps.ai.ai_client.asyncio.sleep", new_callable=AsyncMock
        ) as sleep_mock:
            async_client_cls.return_value.__aenter__.return_value = mock_async_client

            result = asyncio.run(
                client.chat(
                    conversation=[{"role": "user", "content": "hello"}],
                    session_mode=SessionMode.AUTO,
                )
            )

        self.assertEqual(result.content, "recovered")
        self.assertEqual(mock_async_client.post.await_count, 2)
        self.assertEqual(sleep_mock.await_count, 1)

    def test_chat_raises_after_retry_budget_exhausted(self):
        client = AIServiceClient(base_url="http://ai-service:8001")

        first = MagicMock()
        first.raise_for_status.side_effect = _http_status_error(503, "unavailable")
        second = MagicMock()
        second.raise_for_status.side_effect = _http_status_error(503, "unavailable")
        third = MagicMock()
        third.raise_for_status.side_effect = _http_status_error(503, "unavailable")

        mock_async_client = MagicMock()
        mock_async_client.post = AsyncMock(side_effect=[first, second, third])

        with patch("apps.ai.ai_client.httpx.AsyncClient") as async_client_cls, patch(
            "apps.ai.ai_client.asyncio.sleep", new_callable=AsyncMock
        ) as sleep_mock:
            async_client_cls.return_value.__aenter__.return_value = mock_async_client

            with self.assertRaises(AIServiceError) as exc:
                asyncio.run(
                    client.chat(
                        conversation=[{"role": "user", "content": "hello"}],
                        session_mode=SessionMode.AUTO,
                    )
                )

        self.assertIn("unavailable", str(exc.exception))
        self.assertEqual(mock_async_client.post.await_count, 3)
        self.assertEqual(sleep_mock.await_count, 2)
