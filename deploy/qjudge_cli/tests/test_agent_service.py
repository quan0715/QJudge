import io
import json
import os
import socket
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch

from qjudge_cli.agent import service as service_module
from qjudge_cli.agent import state
from qjudge_cli.agent.jobs import create_job
from qjudge_cli.agent.service import AgentService
from qjudge_cli.agent.state import read_job
from qjudge_cli.release_lock import ReleaseBusy, release_lock
from qjudge_cli.tests.test_agent_jobs import Host, fake_popen
from qjudge_cli.tests.test_check import VALID
from qjudge_cli.tests.test_release import NEW, OLD

SEPARATOR = "\x1f"
COMMITTED = 1_700_000_000  # 2023-11-14T22:13:20Z
AHEAD = "c" * 40     # a descendant of NEW: deployed from a branch that main has not merged yet
DIVERGED = "d" * 40  # shares history with NEW but is neither behind nor ahead of it
UNKNOWN = "e" * 40   # not in the local repository
KNOWN = {OLD, NEW, AHEAD, DIVERGED}
ANCESTORS = {(OLD, NEW), (OLD, AHEAD), (NEW, AHEAD), (OLD, DIVERGED)}


def container(project, service, status="running", health=None):
    state_ = {"Status": status}
    if health:
        state_["Health"] = {"Status": health}
    return {
        "Id": f"{project}-{service}",
        "Config": {"Labels": {"com.docker.compose.project": project, "com.docker.compose.service": service}},
        "State": state_,
    }


CONTAINERS = [
    container("qjudge", "frontend"),
    container("qjudge", "backend", health="healthy"),
    container("qjudge-storage", "minio", status="exited"),
    container("qjudge-agent", "agent"),
    container("other", "web"),
]


class ServiceHost(Host):
    """Host that also answers `git log` and the docker container listing; fail_on fails them too."""

    def __init__(self, *args, containers=CONTAINERS, **kwargs):
        super().__init__(*args, **kwargs)
        self.listed = containers

    def __call__(self, args, **kwargs):
        handled = (args[:2] == ["git", "-C"] and ("log" in args or "merge-base" in args)) or args[:3] in (
            ["docker", "ps", "-a"], ["docker", "container", "inspect"])
        if not handled:
            return super().__call__(args, **kwargs)
        self.calls.append((list(args), None))
        if any(part in " ".join(args) for part in self.fail_on):
            return self._result("", 128, "boom")
        if "merge-base" in args:
            return self._is_ancestor(*args[-2:])
        if args[0] == "git":
            return self._git_log(args)
        if args[1] == "ps":
            return self._result("\n".join(c["Id"] for c in self.listed))
        return self._result(json.dumps([c for c in self.listed if c["Id"] in args[3:]]))

    def _git_log(self, args):
        if "-1" in args:
            return self._result(f"Release: b{SEPARATOR}{COMMITTED}\n")
        if args[-1] == f"{OLD}..origin/main":
            return self._result(f"{NEW}{SEPARATOR}Release: b\n")
        return self._result("")

    def _is_ancestor(self, ancestor, descendant):
        """git merge-base --is-ancestor: 0 yes, 1 no, 128 when a commit is unknown."""
        if ancestor not in KNOWN or descendant not in KNOWN:
            return self._result("", 128, "fatal: Not a valid commit name")
        yes = ancestor == descendant or (ancestor, descendant) in ANCESTORS
        return self._result("", 0 if yes else 1)

    @staticmethod
    def _result(stdout, code=0, stderr=""):
        return type("Result", (), {"returncode": code, "stdout": stdout, "stderr": stderr})()


class ServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.deploy = Path(self.directory.name) / "deploy"
        self.deploy.mkdir()
        self.env_file = self.deploy / ".env"
        self.write_env(VALID)
        self.host = ServiceHost()

    def tearDown(self):
        self.directory.cleanup()

    def write_env(self, values):
        self.env_file.write_text("".join(f"{k}={v}\n" for k, v in values.items()))

    def service(self, **overrides):
        options = {"run": self.host, "popen": fake_popen([], 0), "http_status": lambda *a: 200,
                   "spawn": lambda fn: fn(), "http_get": lambda url: 200, "tcp_connect": lambda host, port: None,
                   "after_success": lambda: None}
        options.update(overrides)
        return AgentService(self.deploy, self.env_file, **options)


class CheckTests(ServiceTestCase):
    def test_check_lists_releases_between_current_and_main(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        result = self.service().check()
        self.assertEqual(result["latest"]["sha"], NEW)
        self.assertEqual([r["subject"] for r in result["releases"]], ["Release: b"])
        self.assertTrue(result["update_available"])

    def test_check_describes_the_latest_commit(self):
        result = self.service().check()
        self.assertEqual(result["latest"], {"sha": NEW, "subject": "Release: b", "committed_at": "2023-11-14T22:13:20Z"})

    def test_release_entries_carry_sha_and_subject(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        self.assertEqual(self.service().check()["releases"], [{"sha": NEW, "subject": "Release: b"}])
        range_command = next(c for c in self.host.commands() if "--first-parent" in c)
        self.assertTrue(range_command.endswith(f"log --first-parent --format=%H%x1f%s {OLD}..origin/main"))

    def test_check_without_a_deployed_version_has_no_releases(self):
        result = self.service().check()
        self.assertEqual(result["releases"], [])
        self.assertTrue(result["update_available"])
        self.assertFalse(any("--first-parent" in c for c in self.host.commands()))

    def test_check_when_already_on_main(self):
        (self.deploy / ".version").write_text(f"current={NEW}\n")
        result = self.service().check()
        self.assertEqual(result["releases"], [])
        self.assertFalse(result["update_available"])

    def merge_base_commands(self):
        return [c for c in self.host.commands() if "merge-base" in c]

    def test_main_behind_the_deployed_commit_is_not_an_update(self):
        (self.deploy / ".version").write_text(f"current={AHEAD}\n")
        result = self.service().check()
        self.assertEqual(result["latest"]["sha"], NEW)
        self.assertEqual(result["releases"], [])
        self.assertFalse(result["update_available"])
        self.assertEqual(self.merge_base_commands(),
                         [f"git -C {self.deploy.parent} merge-base --is-ancestor {NEW} {AHEAD}"])

    def test_main_ahead_of_the_deployed_commit_is_an_update(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        self.assertTrue(self.service().check()["update_available"])
        self.assertEqual(len(self.merge_base_commands()), 1)

    def test_diverged_history_is_an_update(self):
        (self.deploy / ".version").write_text(f"current={DIVERGED}\n")
        self.assertTrue(self.service().check()["update_available"])

    def test_a_deployed_commit_missing_locally_is_an_update(self):
        (self.deploy / ".version").write_text(f"current={UNKNOWN}\n")
        result = self.service().check()
        self.assertTrue(result["update_available"])
        self.assertEqual(result["releases"], [])

    def test_no_deployed_version_is_an_update_without_asking_git(self):
        self.assertTrue(self.service().check()["update_available"])
        self.assertEqual(self.merge_base_commands(), [])

    def test_deployed_main_head_needs_no_ancestry_check(self):
        (self.deploy / ".version").write_text(f"current={NEW}\n")
        self.assertFalse(self.service().check()["update_available"])
        self.assertEqual(self.merge_base_commands(), [])

    def test_a_hung_ancestry_check_is_reported(self):
        (self.deploy / ".version").write_text(f"current={AHEAD}\n")

        def run(args, **kwargs):
            if "merge-base" in args:
                raise subprocess.TimeoutExpired(args, 60)
            return self.host(args, **kwargs)

        with self.assertRaises(RuntimeError):
            self.service(run=run).check()

    def test_failed_commit_listing_does_not_hide_the_update(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        result = self.service(run=ServiceHost(fail_on=("--first-parent",))).check()
        self.assertEqual(result["releases"], [])
        self.assertTrue(result["update_available"])

    def test_check_reports_an_unreachable_origin(self):
        with self.assertRaises(RuntimeError):
            self.service(run=ServiceHost(fetch_fails=True)).check()

    def test_check_reports_a_missing_latest_commit(self):
        with self.assertRaises(RuntimeError):
            self.service(run=ServiceHost(fail_on=("log -1",))).check()


class StatusTests(ServiceTestCase):
    def test_status_without_any_state(self):
        self.assertEqual(self.service().status(), {
            "version": {"current": None, "previous": None, "deployed_at": None},
            "job": None, "log": "", "external_busy": False,
        })

    def test_status_reports_the_recorded_version_and_when_it_was_written(self):
        version = self.deploy / ".version"
        version.write_text(f"current={NEW}\nprevious={OLD}\n")
        os.utime(version, (COMMITTED, COMMITTED))
        self.assertEqual(self.service().status()["version"],
                         {"current": NEW, "previous": OLD, "deployed_at": "2023-11-14T22:13:20Z"})

    def test_status_includes_the_job_and_its_log(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        state.append_log(self.deploy, "building\n")
        status = self.service().status()
        self.assertEqual(status["job"], job)
        self.assertEqual(status["log"], "building\n")

    def test_status_marks_cli_upgrade_as_external(self):
        with release_lock(self.deploy):
            self.assertTrue(self.service().status()["external_busy"])

    def test_agent_job_holding_the_lock_is_not_external(self):
        create_job(self.deploy, NEW, "root", run=self.host)
        with release_lock(self.deploy):
            self.assertFalse(self.service().status()["external_busy"])

    def test_cli_upgrade_after_a_finished_job_is_still_external(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        state.write_job(self.deploy, {**job, "status": "succeeded", "finished_at": state.now()})
        with release_lock(self.deploy):
            self.assertTrue(self.service().status()["external_busy"])

    def test_status_never_closes_a_running_job(self):
        create_job(self.deploy, NEW, "root", run=self.host)
        self.service().status()
        self.assertEqual(read_job(self.deploy)["status"], "running")

    def test_status_lets_a_lock_probe_failure_surface(self):
        self.deploy.joinpath(".release.lock").symlink_to(self.deploy / "elsewhere")
        with self.assertRaises(OSError):
            self.service().status()


class UpgradeTests(ServiceTestCase):
    def test_start_upgrade_restarts_the_agent_only_after_success(self):
        restarted = []
        self.service(popen=fake_popen([], 0), spawn=lambda fn: fn(),
                     after_success=lambda: restarted.append(True)).start_upgrade(NEW, "root")
        self.assertEqual(restarted, [True])
        restarted.clear()
        self.service(popen=fake_popen([], 1), spawn=lambda fn: fn(),
                     after_success=lambda: restarted.append(True)).start_upgrade(NEW, "root")
        self.assertEqual(restarted, [])

    def test_start_upgrade_returns_the_running_job_and_hands_the_work_to_spawn(self):
        spawned = []
        job = self.service(spawn=spawned.append).start_upgrade(NEW, "root")
        self.assertEqual((job["status"], job["target"], job["triggered_by"]), ("running", NEW, "root"))
        self.assertEqual(read_job(self.deploy), job)
        self.assertEqual(len(spawned), 1)
        spawned[0]()
        self.assertEqual(read_job(self.deploy)["status"], "succeeded")

    def test_start_upgrade_is_busy_while_a_job_runs(self):
        service = self.service(spawn=lambda fn: None)
        service.start_upgrade(NEW, "root")
        with self.assertRaises(ReleaseBusy):
            service.start_upgrade(NEW, "other")

    def test_a_broken_worker_still_ends_the_job_so_the_gate_reopens(self):
        restarted = []

        def popen(args, **kwargs):
            raise ValueError("bad spawn argument")

        service = self.service(popen=popen, after_success=lambda: restarted.append(True))
        service.start_upgrade(NEW, "root")
        job = read_job(self.deploy)
        self.assertEqual(job["status"], "failed")
        self.assertRegex(job["finished_at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertIn("bad spawn argument", state.log_tail(self.deploy))
        self.assertEqual(restarted, [])
        self.assertTrue(self.service().start_upgrade(NEW, "again"))

    def test_a_broken_worker_keeps_the_step_already_recorded(self):
        from qjudge_cli.release import STEP_MARKER

        class Broken:
            def __init__(self):
                self.stdout = self.lines()

            def lines(self):
                yield f"{STEP_MARKER}build\n"
                raise RuntimeError("pipe exploded")

            def wait(self):
                return 0

        self.service(popen=lambda args, **kwargs: Broken()).start_upgrade(NEW, "root")
        job = read_job(self.deploy)
        self.assertEqual((job["status"], job["step"]), ("failed", "build"))

    def test_failing_restart_does_not_change_a_succeeded_job(self):
        def restart():
            raise ValueError("compose exploded")

        with patch("sys.stderr", io.StringIO()) as log:
            self.service(after_success=restart).start_upgrade(NEW, "root")
        self.assertEqual(read_job(self.deploy)["status"], "succeeded")
        self.assertIn("compose exploded", log.getvalue())

    def test_a_worker_that_cannot_be_started_ends_the_job_and_reports_it(self):
        def spawn(work):
            raise RuntimeError("can't start new thread")

        with self.assertRaises(RuntimeError):
            self.service(spawn=spawn).start_upgrade(NEW, "root")
        self.assertEqual(read_job(self.deploy)["status"], "failed")
        self.assertTrue(self.service().start_upgrade(NEW, "again"))

    def test_default_spawn_runs_the_work_on_a_daemon_thread(self):
        done = threading.Event()
        service = AgentService(self.deploy, self.env_file, run=self.host, popen=fake_popen([], 0),
                               http_status=lambda *a: 200, after_success=done.set)
        service.start_upgrade(NEW, "root")
        self.assertTrue(done.wait(5))


class ContainerTests(ServiceTestCase):
    def test_containers_include_addon_projects_only(self):
        projects = {c["project"] for c in self.service().containers()["containers"]}
        self.assertEqual(projects, {"qjudge", "qjudge-storage", "qjudge-agent"})

    def test_container_rows_have_state_and_health(self):
        rows = self.service().containers()["containers"]
        self.assertEqual(rows, [
            {"project": "qjudge", "service": "backend", "state": "running", "health": "healthy"},
            {"project": "qjudge", "service": "frontend", "state": "running", "health": ""},
            {"project": "qjudge-agent", "service": "agent", "state": "running", "health": ""},
            {"project": "qjudge-storage", "service": "minio", "state": "exited", "health": ""},
        ])

    def test_stopped_containers_are_listed(self):
        self.service().containers()
        self.assertIn("docker ps -a -q --filter label=com.docker.compose.project", self.host.commands())

    def test_stack_name_comes_from_the_env_file(self):
        self.write_env({**VALID, "COMPOSE_PROJECT_NAME": "judge"})
        host = ServiceHost(containers=[container("judge", "backend"), container("judge-storage", "minio"),
                                       container("judgement", "x"), container("qjudge", "backend")])
        projects = {c["project"] for c in self.service(run=host).containers()["containers"]}
        self.assertEqual(projects, {"judge", "judge-storage"})

    def test_no_containers(self):
        self.assertEqual(self.service(run=ServiceHost(containers=[])).containers(), {"containers": []})

    def test_a_failing_docker_is_reported(self):
        with self.assertRaises(RuntimeError):
            self.service(run=ServiceHost(fail_on=("docker ps",))).containers()
        with self.assertRaises(RuntimeError):
            self.service(run=ServiceHost(fail_on=("container inspect",))).containers()


class IngressTests(ServiceTestCase):
    def entries(self, env=None, **overrides):
        if env is not None:
            self.write_env(env)
        return {e["id"]: e for e in self.service(**overrides).ingress()["entries"]}

    def test_ingress_reports_each_probe_without_failing_the_rest(self):
        def http_get(url):
            if "health" in url:
                return 200
            raise OSError("refused")
        entries = {e["id"]: e for e in self.service(http_get=http_get).ingress()["entries"]}
        self.assertTrue(entries["site"]["ok"])
        self.assertFalse(entries["mcp"]["ok"])
        self.assertIn("refused", entries["mcp"]["detail"])

    def test_entries_carry_the_documented_fields(self):
        entry = self.entries()["site"]
        self.assertEqual(entry, {
            "id": "site", "public": "https://judge.example.edu", "target": "http://127.0.0.1:8080",
            "probe": "https://judge.example.edu/api/health/", "ok": True, "detail": "HTTP 200",
        })

    def test_expected_200_accepts_nothing_else(self):
        for status, ok in ((200, True), (204, False), (301, False), (404, False), (503, False), (0, False)):
            with self.subTest(status=status):
                self.assertEqual(self.entries(http_get=lambda url, s=status: s)["site"]["ok"], ok)

    def test_reachable_accepts_anything_below_500(self):
        for status, ok in ((200, True), (301, True), (401, True), (404, True), (499, True), (500, False), (0, False)):
            with self.subTest(status=status):
                entry = self.entries(http_get=lambda url, s=status: s)["mcp"]
                self.assertEqual((entry["ok"], entry["detail"]), (ok, f"HTTP {status}"))

    def test_a_failing_probe_shows_the_error_cut_to_200_characters(self):
        def http_get(url):
            raise OSError("x" * 500)
        detail = self.entries(http_get=http_get)["site"]["detail"]
        self.assertEqual(len(detail), 200)

    def test_all_probes_run_at_the_same_time(self):
        barrier = threading.Barrier(3, timeout=5)

        def http_get(url):
            barrier.wait()
            return 200

        entries = self.entries(http_get=http_get)
        self.assertEqual(sorted(entries), ["mcp", "site", "storage"])
        self.assertTrue(all(entry["ok"] for entry in entries.values()))

    def test_a_stuck_probe_is_reported_without_holding_the_others(self):
        release = threading.Event()
        self.addCleanup(release.set)

        def http_get(url):
            if "health" in url:
                release.wait(10)
            return 200

        with patch.object(service_module, "PROBE_DEADLINE", 0.2):
            entries = self.entries(http_get=http_get)
        self.assertEqual((entries["site"]["ok"], entries["site"]["detail"]), (False, "timed out"))
        self.assertTrue(entries["mcp"]["ok"])
        self.assertEqual(entries["site"]["probe"], "https://judge.example.edu/api/health/")

    def test_tcp_entries_are_probed_by_connecting(self):
        env = {**VALID, "MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
               "LIVEKIT_TURN_HOST": "turn.example.edu", "LIVEKIT_NODE_IP": "192.0.2.10"}
        connected = []
        entries = self.entries(env, tcp_connect=lambda host, port: connected.append((host, port)))
        self.assertEqual(connected, [("turn.example.edu", 443)])
        self.assertEqual(entries["turn"]["ok"], True)

    def test_tcp_failure_is_reported_with_the_error(self):
        env = {**VALID, "MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
               "LIVEKIT_TURN_HOST": "turn.example.edu", "LIVEKIT_NODE_IP": "192.0.2.10"}

        def tcp_connect(host, port):
            raise ConnectionRefusedError("no route")

        entry = self.entries(env, tcp_connect=tcp_connect)["turn"]
        self.assertEqual((entry["ok"], entry["detail"]), (False, "no route"))
        self.assertTrue(self.entries(env)["site"]["ok"])

    def test_malformed_tcp_probe_is_reported(self):
        env = {**VALID, "MEDIA_MODE": "bundled", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu",
               "LIVEKIT_TURN_HOST": "", "LIVEKIT_NODE_IP": "192.0.2.10"}
        entry = self.entries(env)["turn"]
        self.assertFalse(entry["ok"])
        self.assertTrue(entry["detail"])

    def test_relative_probes_are_not_requested(self):
        requested = []

        def http_get(url):
            requested.append(url)
            return 200

        entries = self.entries({**VALID, "QJUDGE_PUBLIC_ORIGIN": "", "STORAGE_MODE": "external"}, http_get=http_get)
        self.assertEqual(requested, [])
        for name in ("site", "mcp"):
            self.assertFalse(entries[name]["ok"])
            self.assertIn("QJUDGE_PUBLIC_ORIGIN", entries[name]["detail"])

    def test_unreadable_env_is_reported(self):
        self.env_file.unlink()
        with self.assertRaises(OSError):
            self.service().ingress()


class StatusHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        code = int(self.path.strip("/"))
        self.send_response(code)
        self.send_header("Location", "/elsewhere")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass


class DefaultProbeTests(unittest.TestCase):
    def test_http_get_reports_the_status_and_does_not_follow_redirects(self):
        httpd = HTTPServer(("127.0.0.1", 0), StatusHandler)
        thread = threading.Thread(target=lambda: httpd.serve_forever(poll_interval=0.01), daemon=True)
        thread.start()
        self.addCleanup(lambda: (httpd.shutdown(), httpd.server_close(), thread.join(5)))
        base = f"http://127.0.0.1:{httpd.server_address[1]}"
        for code in (200, 301, 404, 503):
            with self.subTest(code=code):
                self.assertEqual(service_module._http_get(f"{base}/{code}"), code)

    def test_http_get_is_zero_when_nothing_answers(self):
        with socket.socket() as closed:
            closed.bind(("127.0.0.1", 0))
            port = closed.getsockname()[1]
        self.assertEqual(service_module._http_get(f"http://127.0.0.1:{port}/"), 0)

    def test_tcp_connect_reaches_a_listener_and_fails_without_one(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            service_module._tcp_connect("127.0.0.1", port)
        with self.assertRaises(OSError):
            service_module._tcp_connect("127.0.0.1", port)


if __name__ == "__main__":
    unittest.main()
