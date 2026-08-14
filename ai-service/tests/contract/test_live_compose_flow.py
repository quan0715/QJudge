"""End-to-end proof that the disposable stack cannot call external AI services."""

from __future__ import annotations

import os
import time
from uuid import uuid4

import httpx


def test_authenticated_start_reaches_exchange_mcp_and_fake_model() -> None:
    ai_url = os.environ.get("AI_LIVE_BASE_URL", "http://ai-service:8001")
    fake_url = os.environ.get("AI_FAKE_ADAPTER_URL", "http://fake-ai-adapters:8080")

    with httpx.Client(timeout=10.0) as client:
        before_response = client.get(f"{fake_url}/state")
        before_response.raise_for_status()
        before = before_response.json()
        flow_id = uuid4().hex
        token_response = client.post(
            f"{fake_url}/issue-ai-token",
            json={"sub": f"compose-flow-owner-{flow_id}"},
        )
        token_response.raise_for_status()
        token = token_response.json()["access_token"]
        authorization = {"Authorization": f"Bearer {token}"}

        session_response = client.post(
            f"{ai_url}/v1/sessions",
            headers=authorization,
            json={"context": {"source": "compose-contract"}},
        )
        session_response.raise_for_status()
        session_id = session_response.json()["session_id"]
        run_response = client.post(
            f"{ai_url}/v1/sessions/{session_id}/runs",
            headers={**authorization, "Idempotency-Key": f"compose-live-{flow_id}"},
            json={
                "message": "Say hello using the isolated model.",
                "model_id": "openai-nano",
            },
        )
        assert run_response.status_code == 202, run_response.text
        run_id = run_response.json()["run_id"]

        terminal = None
        for _ in range(90):
            run = client.get(f"{ai_url}/v1/runs/{run_id}", headers=authorization)
            run.raise_for_status()
            terminal = run.json()
            if terminal["status"] in {"completed", "failed", "cancelled"}:
                break
            time.sleep(1)

        assert terminal is not None
        assert terminal["status"] == "completed", terminal
        session = client.get(
            f"{ai_url}/v1/sessions/{session_id}", headers=authorization
        )
        session.raise_for_status()
        assistant_messages = [
            message
            for message in session.json()["messages"]
            if message["role"] == "assistant"
        ]
        assistant_text = "\n".join(
            str(message.get("content", ""))
            for message in assistant_messages
        )
        assert "Hello from the isolated fake model" in assistant_text
        assert assistant_messages[-1]["metadata"]["usage"] == {
            "input_tokens": 4,
            "output_tokens": 7,
        }

        state = client.get(f"{fake_url}/state")
        state.raise_for_status()
        counters = state.json()
        assert counters["token_exchanges"] > before["token_exchanges"]
        assert counters["mcp_initializes"] >= before["mcp_initializes"] + 2
        assert counters["mcp_tool_lists"] >= before["mcp_tool_lists"] + 2
        assert counters["model_calls"] > before["model_calls"]
