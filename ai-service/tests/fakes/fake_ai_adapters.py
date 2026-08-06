"""Protocol-correct OAuth, MCP and model fakes for isolated Compose tests."""

from __future__ import annotations

import asyncio
import base64
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

ISSUER = "http://fake-ai-adapters:8080"
KEY_ID = "compose-test-ed25519"
MCP_TOKEN = "fake-mcp-token"
PROVIDER_TOKEN = "fake-test-provider-key"

_private_key = Ed25519PrivateKey.generate()
_public_key = _private_key.public_key()
_public_bytes = _public_key.public_bytes(
    encoding=serialization.Encoding.Raw,
    format=serialization.PublicFormat.Raw,
)
_jwk = {
    "kty": "OKP",
    "crv": "Ed25519",
    "use": "sig",
    "alg": "EdDSA",
    "kid": KEY_ID,
    "x": base64.urlsafe_b64encode(_public_bytes).rstrip(b"=").decode("ascii"),
}

app = FastAPI(title="QJudge isolated AI dependency adapters")
_state = {"token_exchanges": 0, "mcp_initializes": 0, "mcp_tool_lists": 0, "model_calls": 0}
_mcp_sessions: set[str] = set()


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    return authorization.removeprefix("Bearer ")


def _issue_ai_token(subject: str) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "iss": ISSUER,
            "sub": subject,
            "aud": "ai-service",
            "scope": "ai:chat",
            "iat": now,
            "exp": now + timedelta(minutes=10),
        },
        _private_key,
        algorithm="EdDSA",
        headers={"kid": KEY_ID},
    )


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/state")
def adapter_state() -> dict[str, int]:
    return dict(_state)


@app.get("/.well-known/jwks.json")
def jwks() -> dict[str, list[dict[str, str]]]:
    return {"keys": [_jwk]}


@app.post("/issue-ai-token")
async def issue_ai_token(request: Request) -> dict[str, str | int]:
    payload = await request.json()
    subject = str(payload.get("sub") or "compose-test-user")
    return {
        "access_token": _issue_ai_token(subject),
        "token_type": "Bearer",
        "expires_in": 600,
        "scope": "ai:chat",
    }


@app.post("/token-exchange")
async def token_exchange(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, str | int]:
    token = _bearer(authorization)
    try:
        jwt.decode(
            token,
            _public_key,
            algorithms=["EdDSA"],
            issuer=ISSUER,
            audience="ai-service",
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid subject token") from exc
    payload = await request.json()
    if payload != {"audience": "qjudge-mcp", "scope": "mcp"}:
        raise HTTPException(status_code=400, detail="Invalid exchange request")
    _state["token_exchanges"] += 1
    return {
        "access_token": MCP_TOKEN,
        "expires_in": 3600,
        "scope": "mcp",
        "token_type": "Bearer",
    }


@app.post("/mcp")
async def mcp(
    request: Request,
    authorization: str | None = Header(default=None),
    mcp_session_id: str | None = Header(default=None, alias="Mcp-Session-Id"),
) -> Response:
    if _bearer(authorization) != MCP_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid MCP token")
    payload = await request.json()
    method = payload.get("method")
    request_id = payload.get("id")
    if method == "initialize":
        session_id = str(uuid4())
        _mcp_sessions.add(session_id)
        _state["mcp_initializes"] += 1
        protocol_version = payload.get("params", {}).get(
            "protocolVersion", "2025-03-26"
        )
        body = {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": protocol_version,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "qjudge-compose-fake", "version": "1.0"},
            },
        }
        return Response(
            json.dumps(body),
            media_type="application/json",
            headers={"Mcp-Session-Id": session_id},
        )
    if not mcp_session_id or mcp_session_id not in _mcp_sessions:
        raise HTTPException(status_code=404, detail="Unknown MCP session")
    if method == "notifications/initialized":
        return Response(status_code=status.HTTP_202_ACCEPTED)
    if method == "tools/list":
        _state["mcp_tool_lists"] += 1
        return Response(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {"tools": []},
                }
            ),
            media_type="application/json",
        )
    if method == "ping":
        return Response(
            json.dumps({"jsonrpc": "2.0", "id": request_id, "result": {}}),
            media_type="application/json",
        )
    raise HTTPException(status_code=400, detail=f"Unsupported MCP method: {method}")


@app.get("/mcp")
async def mcp_stream(
    authorization: str | None = Header(default=None),
    mcp_session_id: str | None = Header(default=None, alias="Mcp-Session-Id"),
) -> StreamingResponse:
    if _bearer(authorization) != MCP_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid MCP token")
    if not mcp_session_id or mcp_session_id not in _mcp_sessions:
        raise HTTPException(status_code=404, detail="Unknown MCP session")

    async def keepalive():
        while mcp_session_id in _mcp_sessions:
            yield ": keepalive\n\n"
            await asyncio.sleep(30)

    return StreamingResponse(keepalive(), media_type="text/event-stream")


@app.delete("/mcp", status_code=status.HTTP_204_NO_CONTENT)
async def close_mcp_session(
    authorization: str | None = Header(default=None),
    mcp_session_id: str | None = Header(default=None, alias="Mcp-Session-Id"),
) -> Response:
    if _bearer(authorization) != MCP_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid MCP token")
    if not mcp_session_id or mcp_session_id not in _mcp_sessions:
        raise HTTPException(status_code=404, detail="Unknown MCP session")
    _mcp_sessions.remove(mcp_session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    authorization: str | None = Header(default=None),
) -> StreamingResponse:
    if _bearer(authorization) != PROVIDER_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid provider token")
    payload = await request.json()
    if not payload.get("stream") or not isinstance(payload.get("messages"), list):
        raise HTTPException(status_code=400, detail="Streaming chat request required")
    _state["model_calls"] += 1
    completion_id = f"chatcmpl-{uuid4().hex}"
    model = str(payload.get("model") or "gpt-5-nano")

    async def chunks():
        created = int(datetime.now(UTC).timestamp())
        first = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "role": "assistant",
                        "content": "Hello from the isolated fake model",
                    },
                    "finish_reason": None,
                }
            ],
        }
        final = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 4, "completion_tokens": 7, "total_tokens": 11},
        }
        yield f"data: {json.dumps(first)}\n\n"
        yield f"data: {json.dumps(final)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(chunks(), media_type="text/event-stream")
