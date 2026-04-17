"""Durable AI chat run orchestration helpers."""

from __future__ import annotations

import json
import logging
import asyncio
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from asgiref.sync import sync_to_async
from django.db import connections, transaction
from django.utils import timezone

from ..models import AIChatRun, AIExecutionLog, AIMessage, AISession, AIStreamEvent
from .stream_proxy import (
    ai_service_base_url,
    build_ai_service_headers,
    complete_execution_log,
    create_execution_log,
)

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = [
    AIChatRun.Status.QUEUED,
    AIChatRun.Status.RUNNING,
    AIChatRun.Status.AWAITING_APPROVAL,
]
TERMINAL_STATUSES = [
    AIChatRun.Status.COMPLETED,
    AIChatRun.Status.FAILED,
    AIChatRun.Status.CANCELLED,
]
PAUSED_STATUSES = [AIChatRun.Status.AWAITING_APPROVAL]

# Poll interval for tailing new SSE events. HITL runs can idle for arbitrary
# time waiting on human input, so we also short-circuit on PAUSED_STATUSES to
# free the underlying DB connection back to pgbouncer.
_SSE_POLL_INTERVAL_SECONDS = 1.5


def ensure_session_for_run(*, user, session_id: str) -> AISession:
    """Return an owned session, creating a placeholder if needed."""
    try:
        return AISession.objects.get(session_id=session_id, user=user)
    except AISession.DoesNotExist:
        if AISession.objects.filter(session_id=session_id).exists():
            raise
        return AISession.objects.create(session_id=session_id, user=user, context={})


def create_chat_run(*, user, session: AISession, content: str, model_id: str) -> AIChatRun:
    """Create a durable run and enqueue or dispatch it according to session state."""
    with transaction.atomic():
        has_active = AIChatRun.objects.select_for_update().filter(
            session=session,
            status__in=ACTIVE_STATUSES,
        ).exists()
        status = AIChatRun.Status.QUEUED if has_active else AIChatRun.Status.RUNNING

        user_message = AIMessage.objects.create(
            session=session,
            role=AIMessage.Role.USER,
            content=content,
            message_type=AIMessage.MessageType.TEXT,
            metadata={"run_status": status},
        )
        assistant_message = AIMessage.objects.create(
            session=session,
            role=AIMessage.Role.ASSISTANT,
            content="",
            message_type=AIMessage.MessageType.TEXT,
            metadata={"run_status": status},
        )
        run = AIChatRun.objects.create(
            session=session,
            user=user,
            user_message=user_message,
            assistant_message=assistant_message,
            status=status,
            kind=AIChatRun.Kind.CHAT,
            content=content,
            model_id=model_id,
            thread_id=session.session_id,
        )
        _sync_message_run_metadata(run)

    if status == AIChatRun.Status.RUNNING:
        dispatch_run(run)
    return run


def dispatch_run(run: AIChatRun) -> None:
    """Send a run to Celery and persist the task id."""
    from ..tasks import execute_ai_chat_run

    result = execute_ai_chat_run.delay(str(run.id))
    AIChatRun.objects.filter(pk=run.pk).update(celery_task_id=result.id)


def dispatch_next_queued_run(session: AISession) -> None:
    """Start the next queued run in a session when no other active run is executing."""
    with transaction.atomic():
        blocking = AIChatRun.objects.select_for_update().filter(
            session=session,
            status__in=[AIChatRun.Status.RUNNING, AIChatRun.Status.AWAITING_APPROVAL],
        ).exists()
        if blocking:
            return
        run = (
            AIChatRun.objects.select_for_update()
            .filter(session=session, status=AIChatRun.Status.QUEUED)
            .order_by("created_at")
            .first()
        )
        if not run:
            return
        run.status = AIChatRun.Status.RUNNING
        run.save(update_fields=["status", "updated_at"])
        _sync_message_run_metadata(run)
    dispatch_run(run)


def request_run_cancel(run: AIChatRun) -> AIChatRun:
    """Request cancellation. Queued and approval-gated runs terminate immediately."""
    run.cancel_requested = True
    run.save(update_fields=["cancel_requested", "updated_at"])
    if run.status in {AIChatRun.Status.QUEUED, AIChatRun.Status.AWAITING_APPROVAL}:
        mark_run_cancelled(run)
        dispatch_next_queued_run(run.session)
    return run


def resume_approval_run(*, run: AIChatRun, decision: str) -> AIChatRun:
    """Resume an awaiting approval run with a user decision."""
    if run.status != AIChatRun.Status.AWAITING_APPROVAL:
        raise ValueError("Run is not awaiting approval")
    run.kind = AIChatRun.Kind.RESUME
    run.resume_decision = decision
    run.status = AIChatRun.Status.RUNNING
    run.approval_payload = {
        **(run.approval_payload or {}),
        "decision": decision,
    }
    run.save(update_fields=["kind", "resume_decision", "status", "approval_payload", "updated_at"])
    _sync_message_run_metadata(run)
    dispatch_run(run)
    return run


async def run_events_as_sse(*, run: AIChatRun, after: int = 0) -> AsyncGenerator[str, None]:
    """Replay and tail persisted run events as SSE.

    The stream closes on both terminal states (completed/failed/cancelled)
    and paused states (awaiting_approval). Closing on pause prevents idle
    SSE connections from pinning pgbouncer slots while the user deliberates
    on a HITL prompt — the frontend reopens the stream after submitting a
    decision via ``POST /runs/{id}/approval/``.
    """
    last_seq = max(after, 0)
    try:
        while True:
            emitted = False
            events = await sync_to_async(
                lambda: list(
                    run.events.filter(seq__gt=last_seq)
                    .order_by("seq")
                    .values("seq", "payload")[:100],
                ),
            )()
            for event in events:
                emitted = True
                last_seq = event["seq"]
                yield f"data: {json.dumps(event['payload'], ensure_ascii=False)}\n\n"

            run_status = await sync_to_async(
                lambda: AIChatRun.objects.only("status").get(pk=run.pk).status,
            )()
            if run_status in TERMINAL_STATUSES and not emitted:
                return
            if run_status in PAUSED_STATUSES and not emitted:
                return
            if not emitted:
                await asyncio.sleep(_SSE_POLL_INTERVAL_SECONDS)
    finally:
        # Release any DB connections held by the sync_to_async worker
        # threads so they return to the pgbouncer pool immediately.
        await sync_to_async(connections.close_all)()


def execute_run(run_id: str) -> None:
    """Execute a durable run in a Celery worker."""
    run = AIChatRun.objects.select_related("session", "user", "assistant_message").get(pk=run_id)
    if run.cancel_requested:
        mark_run_cancelled(run)
        dispatch_next_queued_run(run.session)
        return

    run.status = AIChatRun.Status.RUNNING
    run.started_at = run.started_at or timezone.now()
    run.save(update_fields=["status", "started_at", "updated_at"])
    _sync_message_run_metadata(run)

    log = create_execution_log(run.user, run.session, run.content or f"[resume:{run.resume_decision}]")
    endpoint = "/api/chat/resume" if run.kind == AIChatRun.Kind.RESUME else "/api/chat/stream"
    payload: dict[str, Any]
    if run.kind == AIChatRun.Kind.RESUME:
        payload = {
            "thread_id": run.thread_id or run.session.session_id,
            "decision": run.resume_decision,
        }
    else:
        payload = {
            "content": run.content,
            "conversation": [],
            "thread_id": run.thread_id or run.session.session_id,
            "model_id": run.model_id,
        }

    try:
        headers = build_ai_service_headers(run.user)
        with httpx.Client(timeout=httpx.Timeout(10.0, read=120.0)) as client:
            with client.stream(
                "POST",
                f"{ai_service_base_url()}{endpoint}",
                json=payload,
                headers=headers,
            ) as response:
                if response.status_code != 200:
                    error_text = response.read().decode("utf-8", errors="replace")
                    mark_run_failed(run, f"ai-service error: {response.status_code} {error_text}")
                    complete_execution_log(
                        log,
                        ai_response=_assistant_content(run),
                        raw_log={"error": run.error, "run_id": str(run.id)},
                        metadata={"error": run.error, "run_id": str(run.id)},
                    )
                    dispatch_next_queued_run(run.session)
                    return

                buffer = ""
                for chunk in response.iter_bytes():
                    run.refresh_from_db(fields=["cancel_requested", "status"])
                    if run.cancel_requested:
                        mark_run_cancelled(run)
                        complete_execution_log(
                            log,
                            ai_response=_assistant_content(run),
                            raw_log={"cancelled": True, "run_id": str(run.id)},
                            metadata={"cancelled": True, "run_id": str(run.id)},
                        )
                        dispatch_next_queued_run(run.session)
                        return

                    buffer += chunk.decode("utf-8", errors="replace")
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        _handle_sse_line(run, line.strip())

                if buffer.strip():
                    _handle_sse_line(run, buffer.strip())

        run.refresh_from_db()
        if run.status == AIChatRun.Status.RUNNING:
            mark_run_failed(run, "Stream ended without terminal event")

        complete_execution_log(
            log,
            ai_response=_assistant_content(run),
            raw_log=_log_payload(run),
            metadata=_log_payload(run),
        )
        if run.status != AIChatRun.Status.AWAITING_APPROVAL:
            dispatch_next_queued_run(run.session)
    except Exception as exc:
        logger.exception("AI chat run %s failed: %s", run_id, exc)
        mark_run_failed(run, str(exc))
        complete_execution_log(
            log,
            ai_response=_assistant_content(run),
            raw_log=_log_payload(run),
            metadata=_log_payload(run),
        )
        dispatch_next_queued_run(run.session)


def _handle_sse_line(run: AIChatRun, line: str) -> None:
    if not line.startswith("data: "):
        return
    try:
        event = json.loads(line[6:])
    except json.JSONDecodeError:
        return
    event_type = event.get("type", "")
    if not event_type:
        return
    record_event(run, event_type, event)
    apply_event_to_run(run, event)


def record_event(run: AIChatRun, event_type: str, payload: dict[str, Any]) -> AIStreamEvent:
    with transaction.atomic():
        locked = AIChatRun.objects.select_for_update().get(pk=run.pk)
        seq = locked.last_event_seq + 1
        payload = {**payload, "seq": seq, "run_status": locked.status}
        stream_event = AIStreamEvent.objects.create(
            run=locked,
            seq=seq,
            event_type=event_type,
            payload=payload,
        )
        locked.last_event_seq = seq
        locked.save(update_fields=["last_event_seq", "updated_at"])
        run.last_event_seq = seq
    return stream_event


def apply_event_to_run(run: AIChatRun, event: dict[str, Any]) -> None:
    event_type = event.get("type")
    run.refresh_from_db()

    if event_type == "run_started":
        run.external_run_id = event.get("run_id") or run.external_run_id
        run.thread_id = event.get("thread_id") or run.thread_id
        run.save(update_fields=["external_run_id", "thread_id", "updated_at"])
        _sync_message_run_metadata(run)
        return

    if event_type == "thinking_delta" and event.get("content"):
        _append_assistant_metadata(run, "thinking", event["content"])
        return

    if event_type == "agent_message_delta" and event.get("content"):
        if run.assistant_message_id:
            run.assistant_message.content = f"{run.assistant_message.content}{event['content']}"
            run.assistant_message.save(update_fields=["content"])
        return

    if event_type == "tool_call_started":
        metadata = _assistant_metadata(run)
        metadata["current_tool"] = {
            "tool_name": event.get("tool_name"),
            "tool_call_id": event.get("tool_call_id"),
            "input": event.get("input_data"),
        }
        _save_assistant_metadata(run, metadata)
        return

    if event_type == "tool_call_finished":
        metadata = _assistant_metadata(run)
        tool = metadata.pop("current_tool", {}) or {}
        tool.update(
            {
                "tool_call_id": event.get("tool_call_id") or tool.get("tool_call_id"),
                "result": event.get("result"),
                "is_error": event.get("is_error", False),
            }
        )
        metadata.setdefault("tools_executed", []).append(tool)
        _save_assistant_metadata(run, metadata)
        return

    if event_type == "usage_report":
        metadata = _assistant_metadata(run)
        metadata["usage"] = {
            "input_tokens": event.get("input_tokens"),
            "output_tokens": event.get("output_tokens"),
            "cost_cents": event.get("cost_cents"),
            "model_used": event.get("model_used"),
        }
        _save_assistant_metadata(run, metadata)
        return

    if event_type == "awaiting_approval":
        run.status = AIChatRun.Status.AWAITING_APPROVAL
        run.approval_payload = {
            "action_requests": event.get("action_requests", []),
            "review_configs": event.get("review_configs", []),
        }
        run.save(update_fields=["status", "approval_payload", "updated_at"])
        _sync_message_run_metadata(run)
        return

    if event_type == "run_completed":
        mark_run_completed(run)
        return

    if event_type == "run_failed":
        mark_run_failed(run, event.get("message") or "Agent execution failed", emit_event=False)


def mark_run_completed(run: AIChatRun) -> None:
    run.status = AIChatRun.Status.COMPLETED
    run.completed_at = timezone.now()
    run.save(update_fields=["status", "completed_at", "updated_at"])
    _sync_message_run_metadata(run)
    _increment_usage(run)


def mark_run_failed(run: AIChatRun, error: str, *, emit_event: bool = True) -> None:
    run.status = AIChatRun.Status.FAILED
    run.error = error
    run.completed_at = timezone.now()
    run.save(update_fields=["status", "error", "completed_at", "updated_at"])
    _sync_message_run_metadata(run)
    if emit_event:
        record_event(run, "run_failed", {"type": "run_failed", "message": error, "run_id": run.external_run_id})


def mark_run_cancelled(run: AIChatRun) -> None:
    run.status = AIChatRun.Status.CANCELLED
    run.cancel_requested = True
    run.completed_at = timezone.now()
    run.save(update_fields=["status", "cancel_requested", "completed_at", "updated_at"])
    _sync_message_run_metadata(run)
    record_event(run, "run_cancelled", {"type": "run_cancelled", "run_id": run.external_run_id})


def _assistant_metadata(run: AIChatRun) -> dict[str, Any]:
    if not run.assistant_message_id:
        return {}
    run.assistant_message.refresh_from_db()
    return dict(run.assistant_message.metadata or {})


def _save_assistant_metadata(run: AIChatRun, metadata: dict[str, Any]) -> None:
    if not run.assistant_message_id:
        return
    metadata["run_id"] = str(run.id)
    metadata["run_status"] = run.status
    metadata["last_event_seq"] = run.last_event_seq
    run.assistant_message.metadata = metadata
    run.assistant_message.save(update_fields=["metadata"])


def _append_assistant_metadata(run: AIChatRun, key: str, content: str) -> None:
    metadata = _assistant_metadata(run)
    metadata[key] = f"{metadata.get(key, '')}{content}"
    _save_assistant_metadata(run, metadata)


def _sync_message_run_metadata(run: AIChatRun) -> None:
    metadata_update = {
        "run_id": str(run.id),
        "run_status": run.status,
        "last_event_seq": run.last_event_seq,
    }
    if run.user_message_id:
        user_metadata = dict(run.user_message.metadata or {})
        run.user_message.metadata = {**user_metadata, **metadata_update}
        run.user_message.save(update_fields=["metadata"])
    if run.assistant_message_id:
        assistant_metadata = dict(run.assistant_message.metadata or {})
        if run.approval_payload:
            assistant_metadata["approval_payload"] = run.approval_payload
        run.assistant_message.metadata = {**assistant_metadata, **metadata_update}
        run.assistant_message.save(update_fields=["metadata"])


def _assistant_content(run: AIChatRun) -> str:
    if not run.assistant_message_id:
        return ""
    run.assistant_message.refresh_from_db()
    return run.assistant_message.content


def _log_payload(run: AIChatRun) -> dict[str, Any]:
    metadata = _assistant_metadata(run)
    return {
        "run_id": str(run.id),
        "session_id": run.session_id,
        "status": run.status,
        "error": run.error,
        "tools_executed": metadata.get("tools_executed", []),
        "usage": metadata.get("usage"),
    }


def _increment_usage(run: AIChatRun) -> None:
    metadata = _assistant_metadata(run)
    usage = metadata.get("usage") or {}
    input_tokens = usage.get("input_tokens") or 0
    output_tokens = usage.get("output_tokens") or 0
    cost_cents = usage.get("cost_cents") or 0
    model_used = usage.get("model_used") or run.model_id
    if not any([input_tokens, output_tokens, cost_cents]):
        return

    from django.db.models import F

    from ..credits import usage_to_credits
    from ..models import UserAICredit

    credits_delta = usage_to_credits(input_tokens, output_tokens, model_used)

    # 在同一個 transaction 內先扣 counter、再寫 metadata，避免兩者出現不一致：
    # - 若 counter update 失敗 → 整段 rollback，metadata 也不會留下 credits_used
    # - 若 metadata save 失敗 → counter 同樣 rollback，不會出現「已扣點但訊息沒紀錄」
    with transaction.atomic():
        UserAICredit.objects.get_or_create(user=run.user)
        UserAICredit.objects.filter(user=run.user).update(
            total_input_tokens=F("total_input_tokens") + input_tokens,
            total_output_tokens=F("total_output_tokens") + output_tokens,
            total_requests=F("total_requests") + 1,
            total_cost_cents=F("total_cost_cents") + cost_cents,
            total_credits=F("total_credits") + credits_delta,
        )

        usage["credits_used"] = credits_delta
        metadata["usage"] = usage
        _save_assistant_metadata(run, metadata)
