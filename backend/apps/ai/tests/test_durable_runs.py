"""Tests for durable backend-controlled AI chat runs."""

import asyncio
import inspect
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AIChatRun, AIMessage, AISession, AIStreamEvent
from apps.ai.services.run_runtime import execute_run, run_events_as_sse

User = get_user_model()


class _MockStreamResponse:
    status_code = 200

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def iter_bytes(self):
        lines = [
            'data: {"type":"run_started","run_id":"r1","thread_id":"thread-1"}\n\n',
            'data: {"type":"thinking_delta","content":"think"}\n\n',
            'data: {"type":"agent_message_delta","content":"Hello"}\n\n',
            'data: {"type":"usage_report","input_tokens":2,"output_tokens":3,"cost_cents":1}\n\n',
            'data: {"type":"run_completed","run_id":"r1"}\n\n',
        ]
        for line in lines:
            yield line.encode("utf-8")


class _MockHttpClient:
    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def stream(self, *args, **kwargs):
        return _MockStreamResponse()


class DurableRunAPITestCase(TransactionTestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="runuser",
            email="run@example.com",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="testpass123",
        )
        self.session = AISession.objects.create(
            session_id="11111111-1111-1111-1111-111111111111",
            user=self.user,
        )

    def test_create_run_returns_running_and_persists_draft_messages(self):
        self.client.force_authenticate(user=self.user)
        delay = MagicMock(return_value=MagicMock(id="celery-1"))
        with patch("apps.ai.tasks.execute_ai_chat_run.delay", delay):
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/runs/",
                {"content": "Hello"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        run = AIChatRun.objects.get(pk=response.data["id"])
        self.assertEqual(run.status, AIChatRun.Status.RUNNING)
        self.assertEqual(run.user_message.content, "Hello")
        self.assertEqual(run.assistant_message.metadata["run_status"], "running")
        delay.assert_called_once_with(str(run.id))

    def test_second_run_is_queued_for_same_session(self):
        self.client.force_authenticate(user=self.user)
        delay = MagicMock(return_value=MagicMock(id="celery-1"))
        with patch("apps.ai.tasks.execute_ai_chat_run.delay", delay):
            self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/runs/",
                {"content": "First"},
                format="json",
            )
            response = self.client.post(
                f"/api/v1/ai/sessions/{self.session.session_id}/runs/",
                {"content": "Second"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(AIChatRun.objects.get(pk=response.data["id"]).status, AIChatRun.Status.QUEUED)
        self.assertEqual(delay.call_count, 1)

    def test_active_runs_are_scoped_to_current_user(self):
        AIChatRun.objects.create(
            session=self.session,
            user=self.user,
            status=AIChatRun.Status.RUNNING,
            content="mine",
        )
        other_session = AISession.objects.create(
            session_id="22222222-2222-2222-2222-222222222222",
            user=self.other_user,
        )
        AIChatRun.objects.create(
            session=other_session,
            user=self.other_user,
            status=AIChatRun.Status.RUNNING,
            content="other",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/ai/runs/?status=active", format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["session_id"], self.session.session_id)

    def test_cancel_queued_run_preserves_assistant_draft(self):
        run = AIChatRun.objects.create(
            session=self.session,
            user=self.user,
            status=AIChatRun.Status.QUEUED,
            content="queued",
            assistant_message=AIMessage.objects.create(
                session=self.session,
                role=AIMessage.Role.ASSISTANT,
                content="partial",
                metadata={"run_status": "queued"},
            ),
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post(f"/api/v1/ai/runs/{run.id}/cancel/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        run.refresh_from_db()
        run.assistant_message.refresh_from_db()
        self.assertEqual(run.status, AIChatRun.Status.CANCELLED)
        self.assertEqual(run.assistant_message.content, "partial")
        self.assertEqual(run.assistant_message.metadata["run_status"], "cancelled")

    def test_event_subscription_uses_async_generator_and_replays_after_seq(self):
        run = AIChatRun.objects.create(
            session=self.session,
            user=self.user,
            status=AIChatRun.Status.COMPLETED,
            content="done",
            last_event_seq=2,
        )
        AIStreamEvent.objects.create(
            run=run,
            seq=1,
            event_type="thinking_delta",
            payload={"seq": 1, "type": "thinking_delta", "content": "think"},
        )
        AIStreamEvent.objects.create(
            run=run,
            seq=2,
            event_type="run_completed",
            payload={"seq": 2, "type": "run_completed"},
        )

        generator = run_events_as_sse(run=run, after=1)
        self.assertTrue(inspect.isasyncgen(generator))

        async def collect_events():
            return [chunk async for chunk in generator]

        chunks = asyncio.run(collect_events())
        self.assertEqual(chunks, ['data: {"seq": 2, "type": "run_completed"}\n\n'])

    def test_event_subscription_closes_on_awaiting_approval(self):
        run = AIChatRun.objects.create(
            session=self.session,
            user=self.user,
            status=AIChatRun.Status.AWAITING_APPROVAL,
            content="needs approval",
            approval_payload={"action_requests": [{"name": "qjudge_grading"}]},
            last_event_seq=1,
        )
        AIStreamEvent.objects.create(
            run=run,
            seq=1,
            event_type="awaiting_approval",
            payload={"seq": 1, "type": "awaiting_approval"},
        )

        generator = run_events_as_sse(run=run, after=0)

        async def collect_events():
            return [chunk async for chunk in generator]

        chunks = asyncio.run(asyncio.wait_for(collect_events(), timeout=5.0))
        self.assertEqual(
            chunks,
            ['data: {"seq": 1, "type": "awaiting_approval"}\n\n'],
        )

    def test_approval_endpoint_resumes_awaiting_run(self):
        run = AIChatRun.objects.create(
            session=self.session,
            user=self.user,
            status=AIChatRun.Status.AWAITING_APPROVAL,
            content="needs approval",
            approval_payload={"action_requests": [{"name": "tool"}]},
        )

        self.client.force_authenticate(user=self.user)
        with patch("apps.ai.services.run_runtime.dispatch_run") as dispatch_run:
            response = self.client.post(
                f"/api/v1/ai/runs/{run.id}/approval/",
                {"decision": "approve"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        run.refresh_from_db()
        self.assertEqual(run.status, AIChatRun.Status.RUNNING)
        self.assertEqual(run.kind, AIChatRun.Kind.RESUME)
        self.assertEqual(run.resume_decision, "approve")
        self.assertEqual(run.approval_payload["decision"], "approve")
        dispatch_run.assert_called_once()


class DurableRunWorkerTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="workeruser",
            email="worker@example.com",
            password="testpass123",
        )
        self.session = AISession.objects.create(
            session_id="33333333-3333-3333-3333-333333333333",
            user=self.user,
        )

    def test_execute_run_persists_result_without_subscriber(self):
        user_message = AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.USER,
            content="Hello",
        )
        assistant_message = AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.ASSISTANT,
            content="",
            metadata={"run_status": "running"},
        )
        run = AIChatRun.objects.create(
            session=self.session,
            user=self.user,
            status=AIChatRun.Status.RUNNING,
            content="Hello",
            user_message=user_message,
            assistant_message=assistant_message,
            thread_id=self.session.session_id,
        )

        with patch(
            "apps.ai.services.run_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch("apps.ai.services.run_runtime.httpx.Client", _MockHttpClient):
            execute_run(str(run.id))

        run.refresh_from_db()
        assistant_message.refresh_from_db()
        self.assertEqual(run.status, AIChatRun.Status.COMPLETED)
        self.assertEqual(assistant_message.content, "Hello")
        self.assertEqual(assistant_message.metadata["thinking"], "think")
        self.assertEqual(run.events.count(), 5)

    def test_execute_run_dispatches_next_queued_run_after_terminal_event(self):
        user_message = AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.USER,
            content="First",
        )
        assistant_message = AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.ASSISTANT,
            content="",
            metadata={"run_status": "running"},
        )
        running_run = AIChatRun.objects.create(
            session=self.session,
            user=self.user,
            status=AIChatRun.Status.RUNNING,
            content="First",
            user_message=user_message,
            assistant_message=assistant_message,
            thread_id=self.session.session_id,
        )
        queued_run = AIChatRun.objects.create(
            session=self.session,
            user=self.user,
            status=AIChatRun.Status.QUEUED,
            content="Second",
            thread_id=self.session.session_id,
        )

        with patch(
            "apps.ai.services.run_runtime.build_ai_service_headers",
            return_value={"X-AI-Internal-Token": "test"},
        ), patch("apps.ai.services.run_runtime.httpx.Client", _MockHttpClient), patch(
            "apps.ai.services.run_runtime.dispatch_run",
        ) as dispatch_run:
            execute_run(str(running_run.id))

        queued_run.refresh_from_db()
        self.assertEqual(queued_run.status, AIChatRun.Status.RUNNING)
        dispatch_run.assert_called_once()
