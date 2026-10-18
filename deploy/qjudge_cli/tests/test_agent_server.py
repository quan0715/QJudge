import io
import json
import signal
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from qjudge_cli.agent import server
from qjudge_cli.agent.install import AGENT_TOKEN_NAME
from qjudge_cli.agent.jobs import TargetNotLatest
from qjudge_cli.agent.server import AGENT_PORT, make_server, serve
from qjudge_cli.agent.state import read_job, write_job
from qjudge_cli.release_lock import ReleaseBusy
from qjudge_cli.tests.test_release import NEW, OLD

TOKEN = "t0ken-for-tests"


class FakeService:
    """Records the calls the HTTP layer makes; `errors` maps a method name to what it raises."""

    def __init__(self):
        self.started = []
        self.errors = {}
        self.deploy_dir = self.env_file = None

    @property
    def start_error(self):
        return self.errors.get("start_upgrade")

    @start_error.setter
    def start_error(self, error):
        self.errors["start_upgrade"] = error

    def _answer(self, name, payload):
        if name in self.errors:
            raise self.errors[name]
        return payload

    def status(self):
        return self._answer("status", {"version": {"current": NEW}, "job": None, "log": "", "external_busy": False})

    def check(self):
        return self._answer("check", {"latest": {"sha": NEW}, "releases": [], "update_available": False})

    def start_upgrade(self, target, triggered_by):
        self.started.append((target, triggered_by))
        return self._answer("start_upgrade", {"id": "job1", "target": target, "status": "running"})

    def containers(self):
        return self._answer("containers", {"containers": []})

    def ingress(self):
        return self._answer("ingress", {"entries": []})


class ServerTestCase(unittest.TestCase):
    def setUp(self):
        # Error answers are logged to stderr; keep them out of the test output but let tests read them.
        self.log = io.StringIO()
        patcher = patch("sys.stderr", self.log)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.fake = FakeService()
        self.server = make_server(self.fake, TOKEN, host="127.0.0.1", port=0)
        self.thread = threading.Thread(target=lambda: self.server.serve_forever(poll_interval=0.01), daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(5)

    def call(self, method, path, body=None, token=TOKEN, raw=None, headers=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        request = urllib.request.Request(f"http://127.0.0.1:{self.server.server_address[1]}{path}",
                                         data=data, method=method)
        if token is not None:
            request.add_header("Authorization", f"Bearer {token}")
        for name, value in (headers or {}).items():
            request.add_header(name, value)
        try:
            with self.opener.open(request, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())


class AuthTests(ServerTestCase):
    def test_requests_without_the_token_are_unauthorized(self):
        self.assertEqual(self.call("GET", "/v1/status", token="wrong")[0], 401)

    def test_unauthorized_body(self):
        self.assertEqual(self.call("GET", "/v1/status", token="wrong"), (401, {"error": "unauthorized"}))

    def test_missing_or_malformed_authorization_is_unauthorized(self):
        for headers in ({}, {"Authorization": "Basic " + TOKEN}, {"Authorization": TOKEN},
                        {"Authorization": "Bearer "}, {"Authorization": "Bearer"},
                        {"Authorization": "Bearer é"}):
            with self.subTest(headers=headers):
                self.assertEqual(self.call("GET", "/v1/status", token=None, headers=headers),
                                 (401, {"error": "unauthorized"}))

    def test_token_prefix_or_suffix_does_not_match(self):
        for token in (TOKEN[:-1], TOKEN + "x"):
            self.assertEqual(self.call("GET", "/v1/status", token=token)[0], 401)

    def test_authorization_is_checked_before_the_route(self):
        self.assertEqual(self.call("GET", "/nope", token="wrong")[0], 401)
        self.assertEqual(self.call("POST", "/v1/upgrade", {"target": NEW}, token="wrong")[0], 401)
        self.assertEqual(self.fake.started, [])

    def test_an_empty_token_cannot_be_served(self):
        with self.assertRaises(ValueError):
            make_server(self.fake, "", host="127.0.0.1", port=0)

    def test_the_agent_listens_on_8090_by_default(self):
        self.assertEqual(AGENT_PORT, 8090)


class RouteTests(ServerTestCase):
    def test_read_routes_return_the_service_payload(self):
        for method, path, key in (("GET", "/v1/status", "version"), ("POST", "/v1/check", "latest"),
                                  ("GET", "/v1/containers", "containers"), ("GET", "/v1/ingress", "entries")):
            with self.subTest(path=path):
                code, body = self.call(method, path)
                self.assertEqual(code, 200)
                self.assertIn(key, body)

    def test_query_string_is_ignored(self):
        self.assertEqual(self.call("GET", "/v1/status?x=1")[0], 200)

    def test_unknown_path_is_not_found(self):
        for path in ("/", "/v1", "/v1/nope", "/v1/status/", "/v2/status"):
            with self.subTest(path=path):
                self.assertEqual(self.call("GET", path), (404, {"error": "not_found"}))

    def test_known_path_with_the_wrong_method_is_not_found(self):
        for method, path in (("POST", "/v1/status"), ("GET", "/v1/check"), ("GET", "/v1/upgrade"),
                             ("DELETE", "/v1/containers"), ("PUT", "/v1/ingress")):
            with self.subTest(method=method, path=path):
                self.assertEqual(self.call(method, path), (404, {"error": "not_found"}))

    def test_check_does_not_need_a_body(self):
        self.assertEqual(self.call("POST", "/v1/check", raw=b"not json at all")[0], 200)


class UpgradeTests(ServerTestCase):
    def upgrade(self, body):
        return self.call("POST", "/v1/upgrade", body)

    def test_upgrade_maps_busy_and_stale_target(self):
        self.fake.start_error = ReleaseBusy()
        self.assertEqual(self.call("POST", "/v1/upgrade", {"target": NEW, "triggered_by": "root"}),
                         (409, {"error": "busy"}))
        self.fake.start_error = TargetNotLatest(NEW)
        self.assertEqual(self.call("POST", "/v1/upgrade", {"target": OLD, "triggered_by": "root"}),
                         (400, {"error": "not_latest", "latest": NEW}))

    def test_upgrade_returns_the_created_job(self):
        code, body = self.call("POST", "/v1/upgrade", {"target": NEW, "triggered_by": "root"})
        self.assertEqual((code, body["target"], self.fake.started), (202, NEW, [(NEW, "root")]))

    def test_triggered_by_defaults_when_omitted(self):
        self.assertEqual(self.upgrade({"target": NEW})[0], 202)
        self.assertEqual(self.fake.started, [(NEW, "unknown")])

    def test_malformed_bodies_are_bad_requests(self):
        for raw in (b"", b"{not json", b"[]", b'"text"', b"null", b'{"triggered_by": "root"}',
                    b'{"target": ""}', b'{"target": 5}', b'{"target": "x", "triggered_by": 7}',
                    b"\xff\xfe"):
            with self.subTest(raw=raw):
                self.assertEqual(self.call("POST", "/v1/upgrade", raw=raw), (400, {"error": "bad_request"}))
        self.assertEqual(self.fake.started, [])

    def test_oversized_body_is_a_bad_request(self):
        raw = json.dumps({"target": NEW, "triggered_by": "x" * 100_000}).encode()
        self.assertEqual(self.call("POST", "/v1/upgrade", raw=raw), (400, {"error": "bad_request"}))
        self.assertEqual(self.fake.started, [])

    def test_invalid_content_length_is_a_bad_request(self):
        self.assertEqual(self.call("POST", "/v1/upgrade", raw=b"{}", headers={"Content-Length": "abc"})[0], 400)


class FailureTests(ServerTestCase):
    def test_runtime_and_os_errors_are_unavailable_with_a_detail(self):
        for name, method, path in (("check", "POST", "/v1/check"), ("status", "GET", "/v1/status"),
                                   ("containers", "GET", "/v1/containers"), ("ingress", "GET", "/v1/ingress"),
                                   ("start_upgrade", "POST", "/v1/upgrade")):
            for error in (RuntimeError("git fetch origin main failed: offline"), OSError("lock is a symlink")):
                with self.subTest(name=name, error=error):
                    self.fake.errors = {name: error}
                    code, body = self.call(method, path, {"target": NEW, "triggered_by": "root"})
                    self.assertEqual((code, body), (503, {"error": "unavailable", "detail": str(error)}))

    def test_detail_is_cut_to_200_characters(self):
        self.fake.errors = {"check": RuntimeError("y" * 500)}
        code, body = self.call("POST", "/v1/check")
        self.assertEqual((code, body["detail"]), (503, "y" * 200))

    def test_unexpected_errors_still_get_an_answer_and_are_logged(self):
        self.fake.errors = {"status": ValueError("secret detail")}
        code, body = self.call("GET", "/v1/status")
        self.assertEqual((code, body), (500, {"error": "internal"}))
        self.assertIn("ValueError: secret detail", self.log.getvalue())

    def test_successful_polls_are_not_logged(self):
        self.call("GET", "/v1/status")
        self.assertEqual(self.log.getvalue(), "")
        self.call("GET", "/v1/status", token="wrong")
        self.assertIn("401", self.log.getvalue())

    def test_the_server_keeps_serving_after_an_error(self):
        self.fake.errors = {"status": ValueError("boom")}
        self.assertEqual(self.call("GET", "/v1/status")[0], 500)
        self.fake.errors = {}
        self.assertEqual(self.call("GET", "/v1/status")[0], 200)


class FakeHttpServer:
    def __init__(self):
        self.closed = False
        self.stopped = threading.Event()
        self.served = threading.Event()

    def serve_forever(self):
        self.served.set()

    def shutdown(self):
        self.stopped.set()

    def server_close(self):
        self.closed = True


class ServeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.deploy = Path(self.directory.name) / "deploy"
        (self.deploy / "secrets").mkdir(parents=True)
        self.env_file = self.deploy / ".env"
        self.env_file.write_text("")
        self.fake_server = FakeHttpServer()
        self.made = []

        def make(service, token, *args, **kwargs):
            self.made.append((service, token, args, kwargs))
            return self.fake_server

        patcher = patch.object(server, "make_server", make)
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        self.directory.cleanup()

    def write_token(self, text):
        (self.deploy / "secrets" / AGENT_TOKEN_NAME).write_text(text)

    def serve(self):
        output = io.StringIO()
        with redirect_stdout(output), patch.object(server.signal, "signal") as handlers:
            code = serve(self.deploy, self.env_file)
        return code, output.getvalue(), handlers

    def test_serves_with_the_token_from_the_secret_file(self):
        self.write_token(TOKEN + "\n")
        code, _, _ = self.serve()
        self.assertEqual(code, 0)
        service, token, _, _ = self.made[0]
        self.assertEqual(token, TOKEN)
        self.assertEqual((service.deploy_dir, service.env_file), (self.deploy, self.env_file))
        self.assertTrue(self.fake_server.served.is_set())
        self.assertTrue(self.fake_server.closed)

    def test_missing_token_prints_an_error_and_fails(self):
        code, output, _ = self.serve()
        self.assertEqual(code, 1)
        self.assertIn(AGENT_TOKEN_NAME, output)
        self.assertEqual(self.made, [])

    def test_blank_token_is_refused(self):
        self.write_token(" \n")
        code, output, _ = self.serve()
        self.assertEqual(code, 1)
        self.assertIn(AGENT_TOKEN_NAME, output)
        self.assertEqual(self.made, [])

    def test_a_job_left_running_by_a_dead_agent_is_closed_at_startup(self):
        self.write_token(TOKEN)
        write_job(self.deploy, {"id": "x", "status": "running", "finished_at": None})
        self.serve()
        self.assertEqual(read_job(self.deploy)["status"], "interrupted")

    def test_interrupted_is_marked_even_when_the_token_is_missing(self):
        write_job(self.deploy, {"id": "x", "status": "running", "finished_at": None})
        self.serve()
        self.assertEqual(read_job(self.deploy)["status"], "interrupted")

    def test_startup_fails_when_the_job_state_cannot_be_settled(self):
        self.write_token(TOKEN)
        write_job(self.deploy, {"id": "x", "status": "running", "finished_at": None})
        (self.deploy / ".release.lock").symlink_to(self.deploy / "elsewhere")
        code, output, _ = self.serve()
        self.assertEqual(code, 1)
        self.assertEqual(self.made, [])
        self.assertTrue(output.strip())

    def test_sigterm_stops_the_server(self):
        self.write_token(TOKEN)
        _, _, handlers = self.serve()
        installed = {call.args[0]: call.args[1] for call in handlers.call_args_list}
        installed[signal.SIGTERM](signal.SIGTERM, None)
        self.assertTrue(self.fake_server.stopped.wait(5))


if __name__ == "__main__":
    unittest.main()
