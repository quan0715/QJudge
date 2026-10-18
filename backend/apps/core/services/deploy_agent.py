"""Client for the host deploy agent, which the admin-only upgrade endpoints proxy.

The agent runs `deploy/qjudge upgrade` on the host and answers JSON over HTTP with a
shared bearer token. This module turns every way the agent can be missing into one
`AgentUnavailable`, so a stack without an agent (dev, CI) reads as "unsupported"
rather than as an error.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import httpx
from django.conf import settings

QUICK_TIMEOUT_SECONDS = 5.0
# Checking for updates and starting an upgrade both fetch main from GitHub first, and the
# ingress probes hit public hosts.
SLOW_TIMEOUT_SECONDS = 30.0
DETAIL_LIMIT = 200


class AgentUnavailable(Exception):
    """The agent cannot answer: `unsupported` means none is configured, `unreachable` that it failed."""

    def __init__(self, state: Literal["unsupported", "unreachable"], detail: str = ""):
        super().__init__(detail or state)
        self.state = state
        self.detail = detail


class AgentBusy(Exception):
    """Another upgrade or release is already running."""


class AgentTargetNotLatest(Exception):
    """The requested release is no longer the newest one."""

    def __init__(self, latest: str):
        super().__init__(latest)
        self.latest = latest


def _unreachable(detail: str) -> AgentUnavailable:
    return AgentUnavailable("unreachable", detail[:DETAIL_LIMIT])


def _token() -> str:
    try:
        token = Path(settings.QJUDGE_AGENT_TOKEN_FILE).read_text(encoding="utf-8").strip()
    except OSError as error:
        raise _unreachable(f"agent token unreadable: {error.strerror or error}") from None
    if not token:
        raise _unreachable("agent token is empty")
    return token


def _failure_detail(body: object, code: int) -> str:
    if isinstance(body, dict):
        detail = body.get("detail") or body.get("error")
        if isinstance(detail, str) and detail:
            return f"agent answered {code}: {detail}"
    return f"agent answered {code}"


def _call(method: str, path: str, *, body: dict | None = None, timeout: float = QUICK_TIMEOUT_SECONDS) -> dict:
    base_url = str(settings.QJUDGE_AGENT_URL or "").rstrip("/")
    if not base_url:
        raise AgentUnavailable("unsupported", "no deploy agent is configured")
    headers = {"Authorization": f"Bearer {_token()}"}
    try:
        response = httpx.request(method, f"{base_url}{path}", headers=headers, json=body, timeout=timeout)
    except (httpx.HTTPError, httpx.InvalidURL) as error:
        raise _unreachable(f"{type(error).__name__}: {error}") from None
    try:
        answer = response.json()
    except ValueError:
        answer = None
    code = response.status_code
    if code == 409:
        raise AgentBusy
    if code == 400 and isinstance(answer, dict) and answer.get("error") == "not_latest":
        raise AgentTargetNotLatest(str(answer.get("latest", "")))
    if not 200 <= code < 300:
        # 401 is a token the agent no longer accepts; 5xx and the rest are the agent's own failure.
        raise _unreachable(_failure_detail(answer, code))
    if not isinstance(answer, dict):
        raise _unreachable("agent answered with something that is not a JSON object")
    return answer


def _list(answer: dict, key: str) -> list[dict]:
    items = answer.get(key)
    if not isinstance(items, list):
        raise _unreachable(f"agent answer has no {key} list")
    return items


def agent_status() -> dict:
    return _call("GET", "/v1/status")


def agent_check_updates() -> dict:
    return _call("POST", "/v1/check", timeout=SLOW_TIMEOUT_SECONDS)


def agent_start_upgrade(target: str, triggered_by: str) -> dict:
    return _call("POST", "/v1/upgrade", body={"target": target, "triggered_by": triggered_by},
                 timeout=SLOW_TIMEOUT_SECONDS)


def agent_containers() -> list[dict]:
    return _list(_call("GET", "/v1/containers"), "containers")


def agent_ingress() -> list[dict]:
    return _list(_call("GET", "/v1/ingress", timeout=SLOW_TIMEOUT_SECONDS), "entries")
