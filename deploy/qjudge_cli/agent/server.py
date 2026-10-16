"""JSON over HTTP for the host agent. The backend calls it with a shared bearer token."""

from __future__ import annotations

import hmac
import json
import signal
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from ..release_lock import ReleaseBusy
from .install import AGENT_TOKEN_NAME
from .jobs import TargetNotLatest
from .service import AgentService
from .state import mark_interrupted

AGENT_PORT = 8090
MAX_BODY = 64 * 1024
DETAIL_LIMIT = 200

_READS = {
    ("GET", "/v1/status"): "status",
    ("POST", "/v1/check"): "check",
    ("GET", "/v1/containers"): "containers",
    ("GET", "/v1/ingress"): "ingress",
}


class BadRequest(Exception):
    pass


class _AgentServer(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], service: AgentService, token: str):
        super().__init__(address, _Handler)
        self.service = service
        self.token = token.encode("utf-8")


class _Handler(BaseHTTPRequestHandler):
    server: _AgentServer
    server_version = "QJudgeAgent"
    sys_version = ""
    # Drops a client that connects and then says nothing.
    timeout = 30

    def log_request(self, code="-", size="-") -> None:
        # The backend polls status while a job runs; only failures belong in the container log.
        if int(code) >= 400:
            super().log_request(code, size)

    def _handle(self) -> None:
        try:
            code, payload = self._dispatch()
        except ReleaseBusy:
            code, payload = 409, {"error": "busy"}
        except TargetNotLatest as error:
            code, payload = 400, {"error": "not_latest", "latest": error.latest}
        except BadRequest:
            code, payload = 400, {"error": "bad_request"}
        except (RuntimeError, OSError) as error:
            code, payload = 503, {"error": "unavailable", "detail": str(error)[:DETAIL_LIMIT]}
        except Exception:
            traceback.print_exc(file=sys.stderr)
            code, payload = 500, {"error": "internal"}
        self._send(code, payload)

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _handle

    def _dispatch(self) -> tuple[int, dict]:
        if not self._authorized():
            return 401, {"error": "unauthorized"}
        route = (self.command, urlsplit(self.path).path)
        if route in _READS:
            return 200, getattr(self.server.service, _READS[route])()
        if route == ("POST", "/v1/upgrade"):
            body = self._json_body()
            target = body.get("target")
            triggered_by = body.get("triggered_by", "unknown")
            if not isinstance(target, str) or not target or not isinstance(triggered_by, str):
                raise BadRequest
            return 202, self.server.service.start_upgrade(target, triggered_by)
        return 404, {"error": "not_found"}

    def _authorized(self) -> bool:
        scheme, _, supplied = self.headers.get("Authorization", "").partition(" ")
        return scheme.lower() == "bearer" and hmac.compare_digest(supplied.encode("utf-8"), self.server.token)

    def _json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", ""))
            if not 0 < length <= MAX_BODY:
                raise BadRequest
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, OSError):
            raise BadRequest from None
        if not isinstance(body, dict):
            raise BadRequest
        return body

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def make_server(service: AgentService, token: str, host: str = "0.0.0.0", port: int = AGENT_PORT) -> ThreadingHTTPServer:
    if not token:
        # An empty token would accept the header "Bearer " from anyone.
        raise ValueError("the agent token is empty")
    return _AgentServer((host, port), service, token)


def serve(deploy_dir: Path, env_file: Path) -> int:
    try:
        # Only now, before any request: while serving, a starting job looks lockless for a moment.
        mark_interrupted(deploy_dir)
    except OSError as error:
        print(f"cannot settle the last upgrade job: {error}")
        return 1
    token_file = deploy_dir / "secrets" / AGENT_TOKEN_NAME
    try:
        token = token_file.read_text(encoding="utf-8").strip()
    except OSError as error:
        print(f"{token_file}: {error.strerror or error}")
        return 1
    if not token:
        print(f"{token_file}: empty")
        return 1
    try:
        httpd = make_server(AgentService(deploy_dir, env_file), token)
    except OSError as error:
        print(f"cannot listen on port {AGENT_PORT}: {error}")
        return 1
    # As PID 1 of a container, Python ignores SIGTERM unless a handler is set; without it every stop waits for SIGKILL.
    signal.signal(signal.SIGTERM, lambda signum, frame: threading.Thread(target=httpd.shutdown, daemon=True).start())
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0
