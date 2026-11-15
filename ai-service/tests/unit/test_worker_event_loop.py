"""Celery jobs must not reuse an HTTP pool on a closed event loop."""
import asyncio
from contextvars import ContextVar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

import httpx2
from worker import tasks


class KeepAliveHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"OK")

    def log_message(self, *args):
        pass


class WorkerEventLoopTests(TestCase):
    def tearDown(self):
        close = getattr(tasks, "_close_worker_loop", None)
        if close:
            close()

    def test_consecutive_jobs_can_reuse_a_keepalive_http_client(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), KeepAliveHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        client = httpx2.AsyncClient(trust_env=False, timeout=3)
        responses = []
        loops = []

        async def execute(*args):
            loops.append(asyncio.get_running_loop())
            response = await client.get(f"http://127.0.0.1:{server.server_port}/")
            responses.append(response.text)

        try:
            with patch.object(tasks, "_execute_run", execute):
                for _ in range(3):
                    tasks.execute_run.run(str(uuid4()))
            self.assertEqual(responses, ["OK", "OK", "OK"])
        finally:
            if loops and not loops[-1].is_closed():
                loops[-1].run_until_complete(client.aclose())
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_async_context_does_not_leak_into_the_next_job(self):
        value = ContextVar("job_context", default="clean")
        seen = []

        async def execute(*args):
            seen.append(value.get())
            value.set("previous job")

        with patch.object(tasks, "_execute_run", execute):
            tasks.execute_run.run(str(uuid4()))
            tasks.execute_run.run(str(uuid4()))
        self.assertEqual(seen, ["clean", "clean"])
