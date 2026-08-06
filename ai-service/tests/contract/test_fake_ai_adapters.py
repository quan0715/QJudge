"""Behavioral contract for the isolated OAuth/MCP/model test adapter."""

from __future__ import annotations

import jwt
from fastapi.testclient import TestClient

from tests.fakes.fake_ai_adapters import app


def test_fake_issues_verifiable_ai_token_and_exchanges_it_for_mcp() -> None:
    with TestClient(app) as client:
        issued = client.post("/issue-ai-token", json={"sub": "teacher-1"})
        assert issued.status_code == 200
        token = issued.json()["access_token"]
        jwks = client.get("/.well-known/jwks.json").json()
        key = jwt.PyJWK.from_dict(jwks["keys"][0]).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["EdDSA"],
            audience="ai-service",
            issuer="http://fake-ai-adapters:8080",
        )
        assert claims["sub"] == "teacher-1"
        assert claims["scope"] == "ai:chat"

        exchanged = client.post(
            "/token-exchange",
            headers={"Authorization": f"Bearer {token}"},
            json={"audience": "qjudge-mcp", "scope": "mcp"},
        )
        assert exchanged.status_code == 200
        assert exchanged.json() == {
            "access_token": "fake-mcp-token",
            "expires_in": 3600,
            "scope": "mcp",
            "token_type": "Bearer",
        }


def test_fake_mcp_supports_streamable_json_rpc_lifecycle() -> None:
    headers = {
        "Authorization": "Bearer fake-mcp-token",
        "Accept": "application/json, text/event-stream",
    }
    with TestClient(app) as client:
        initialized = client.post(
            "/mcp",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "contract", "version": "1"},
                },
            },
        )
        assert initialized.status_code == 200
        session_id = initialized.headers["Mcp-Session-Id"]
        assert initialized.json()["result"]["protocolVersion"] == "2025-03-26"

        notification = client.post(
            "/mcp",
            headers={**headers, "Mcp-Session-Id": session_id},
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        )
        assert notification.status_code == 202
        listed = client.post(
            "/mcp",
            headers={**headers, "Mcp-Session-Id": session_id},
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        )
        assert listed.status_code == 200
        assert listed.json() == {
            "jsonrpc": "2.0",
            "id": 2,
            "result": {"tools": []},
        }
        deleted = client.delete(
            "/mcp",
            headers={**headers, "Mcp-Session-Id": session_id},
        )
        assert deleted.status_code == 204


def test_fake_model_streams_openai_compatible_completion_and_counts_calls() -> None:
    with TestClient(app) as client:
        before = client.get("/state").json()["model_calls"]
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer fake-test-provider-key"},
            json={
                "model": "gpt-5-nano",
                "stream": True,
                "messages": [{"role": "user", "content": "hello"}],
            },
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "Hello from the isolated fake model" in response.text
        assert "data: [DONE]" in response.text
        assert client.get("/state").json()["model_calls"] == before + 1
