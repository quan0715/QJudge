import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from qjudge_cli.release import APP_SERVICES, _ps_rows, http_status, read_version, rollback, upgrade
from qjudge_cli.tests.test_check import VALID

OLD = "a" * 40
NEW = "b" * 40


def app_containers(healthy=True, legacy=False):
    containers = []
    for service in APP_SERVICES:
        container = {
            "Id": f"container-{service}",
            "Config": {"Labels": {"com.docker.compose.service": service},
                       "Healthcheck": {"Test": ["CMD", "check-readiness"]}},
            "State": {"Status": "running", "Health": {"Status": "healthy" if healthy else "unhealthy"}},
        }
        if legacy and service in ("celery", "ai-worker", "integrity-reconciler"):
            container["Config"].pop("Healthcheck")
            container["State"].pop("Health")
            if service == "ai-worker":
                container["Config"]["Healthcheck"] = {"Test": ["NONE"]}
        containers.append(container)
    return containers


class FakeHost:
    """Answers docker/git commands; fail_on marks a command substring to fail."""

    def __init__(self, head=OLD, fail_on=(), healthy=True, images="", containers_by_ref=None):
        self.head = head
        self.fail_on = fail_on
        self.healthy = healthy
        self.images = images
        self.calls = []
        self.containers_by_ref = containers_by_ref or {}

    def containers(self):
        return self.containers_by_ref.get(self.head, app_containers(self.healthy))

    def __call__(self, args, **kwargs):
        self.calls.append((list(args), (kwargs.get("env") or {}).get("QJUDGE_VERSION")))
        joined = " ".join(args)
        code, out = 0, ""
        if any(part in joined for part in self.fail_on):
            code = 1
        elif args[:2] == ["git", "-C"] and "checkout" in args:
            self.head = NEW if args[-1] == "v2" else args[-1]
        elif args[:2] == ["git", "-C"] and "rev-parse" in args:
            out = self.head + "\n"
        elif "ps" in args and "--quiet" in args:
            out = "\n".join(container["Id"] for container in self.containers())
        elif args[:3] == ["docker", "container", "inspect"]:
            out = json.dumps([container for container in self.containers() if container["Id"] in args[3:]])
        elif "ps" in args and "--format" in args:
            rows = [{"Service": "postgres", "Health": "healthy" if self.healthy else "unhealthy"}]
            rows += [{"Service": c["Config"]["Labels"]["com.docker.compose.service"],
                      "State": c["State"]["Status"], "Health": c["State"].get("Health", {}).get("Status", "")}
                     for c in self.containers()]
            out = "\n".join(json.dumps(row) for row in rows)
        elif "pg_dump" in args:
            kwargs["stdout"].write(b"dump")
        elif args[:3] == ["docker", "image", "ls"]:
            out = self.images
        return type("Result", (), {"returncode": code, "stdout": out, "stderr": ""})()

    def commands(self):
        return [" ".join(args) for args, _ in self.calls]


class ReleaseTests(unittest.TestCase):
    def test_invalid_model_config_aborts_before_stopping_anything(self):
        host = FakeHost(fail_on=("infrastructure.agent.model_config",))
        self.assertEqual(self._upgrade(host), 1)
        self.assertEqual(host.head, OLD)
        commands = host.commands()
        self.assertFalse(any("pg_dump" in c for c in commands))
        self.assertFalse(any(" up -d " in f" {c} " for c in commands))

    def test_model_config_is_checked_right_after_build(self):
        host = FakeHost()
        self.assertEqual(self._upgrade(host), 0)
        order = host.commands()
        build = next(i for i, c in enumerate(order) if c.endswith(" build"))
        check = next(i for i, c in enumerate(order)
                     if "run --rm --no-deps ai-service python -m infrastructure.agent.model_config" in c)
        postgres = next(i for i, c in enumerate(order) if "up -d postgres" in c)
        self.assertLess(build, check)
        self.assertLess(check, postgres)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.deploy = Path(self.directory.name) / "deploy"
        self.deploy.mkdir()
        self.env_file = self.deploy / ".env"
        self.env_file.write_text("".join(f"{k}={v}\n" for k, v in VALID.items()))

    def tearDown(self):
        self.directory.cleanup()

    def _upgrade(self, host, http=200):
        with redirect_stdout(io.StringIO()):
            return upgrade(self.deploy, self.env_file, "v2", run=host, sleep=lambda s: None,
                           http_status=lambda url, host_header, proto: http)

    def _rollback(self, host):
        with redirect_stdout(io.StringIO()):
            return rollback(self.deploy, self.env_file, run=host, sleep=lambda s: None,
                            http_status=lambda url, host_header, proto: 200)

    def test_health_check_sends_the_origin_scheme(self):
        seen = []

        def status(url, host_header, proto):
            seen.append((url, host_header, proto))
            return 200

        with redirect_stdout(io.StringIO()):
            upgrade(self.deploy, self.env_file, "v2", run=FakeHost(), sleep=lambda s: None,
                    http_status=status)
        self.assertIn(("http://127.0.0.1:8080/api/health/", "judge.example.edu", "https"), seen)

    def test_failure_restores_the_deployed_version_even_if_already_checked_out(self):
        # CD checks out the target before running upgrade.
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        host = FakeHost(head=NEW, fail_on=(" build",))
        self.assertEqual(self._upgrade(host), 1)
        self.assertEqual(host.head, OLD)

    def test_failed_rollback_restores_the_current_version(self):
        (self.deploy / ".version").write_text(f"current={NEW}\nprevious={OLD}\n")
        host = FakeHost(head=NEW)
        with redirect_stdout(io.StringIO()):
            code = rollback(self.deploy, self.env_file, run=host, sleep=lambda s: None,
                            http_status=lambda url, host_header, proto: 502)
        self.assertEqual(code, 1)
        self.assertEqual(host.head, NEW)
        last_up = [v for c, v in host.calls if "--remove-orphans" in c][-1]
        self.assertEqual(last_up, "sha-" + NEW[:12])
        self.assertEqual(read_version(self.deploy), {"current": NEW, "previous": OLD})

    def test_upgrade_builds_backs_up_migrates_and_records_versions(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        host = FakeHost()
        self.assertEqual(self._upgrade(host), 0)
        versions = {v for _, v in host.calls if v}
        self.assertEqual(versions, {"sha-" + NEW[:12]})
        order = host.commands()
        build = next(i for i, c in enumerate(order) if c.endswith(" build"))
        backup = next(i for i, c in enumerate(order) if "pg_dump" in c)
        migrate = next(i for i, c in enumerate(order)
                       if "run --rm --no-deps backend python manage.py migrate --noinput" in c)
        ai_migrate = next(i for i, c in enumerate(order)
                          if "run --rm --no-deps ai-service sh -c python -m alembic upgrade head" in c)
        up_all = next(i for i, c in enumerate(order) if "--remove-orphans" in c)
        self.assertLess(build, backup)
        self.assertLess(backup, migrate)
        self.assertLess(migrate, ai_migrate)
        self.assertLess(ai_migrate, up_all)
        self.assertEqual(read_version(self.deploy), {"current": NEW, "previous": OLD})
        [backup_dir] = list((self.deploy / "backups").iterdir())
        self.assertTrue(backup_dir.name.endswith("-" + NEW[:12]))
        for name in ("online_judge.dump", "qjudge_ai.dump"):
            dump = backup_dir / name
            self.assertEqual(dump.read_bytes(), b"dump")
            self.assertEqual(dump.stat().st_mode & 0o777, 0o600)

    def test_secrets_are_bootstrapped_before_starting_the_stack(self):
        # integrity-resident bind-mounts files that only the secrets bootstrap creates, and
        # `up` creates every container before starting any, so a fresh install needs them first.
        host = FakeHost()
        self.assertEqual(self._upgrade(host), 0)
        order = host.commands()
        up_all = next(i for i, c in enumerate(order) if "--remove-orphans" in c)
        image = "qjudge/backend:sha-" + NEW[:12]
        for script in ("bootstrap_ai_oauth_keys.py", "bootstrap_integrity_secrets.py"):
            index = next(i for i, c in enumerate(order) if c.startswith("docker run") and script in c)
            self.assertIn(f" {image} python /bootstrap/{script}", order[index])
            self.assertLess(index, up_all)

    def test_migration_failure_keeps_services_on_the_previous_version(self):
        host = FakeHost(fail_on=("alembic upgrade head",))
        self.assertEqual(self._upgrade(host), 1)
        self.assertEqual(host.head, OLD)
        self.assertFalse(any("--remove-orphans" in c for c in host.commands()))

    def test_build_failure_restores_checkout_without_touching_services(self):
        host = FakeHost(fail_on=(" build",))
        self.assertEqual(self._upgrade(host), 1)
        self.assertEqual(host.head, OLD)
        self.assertFalse(any(" up " in c for c in host.commands()))
        self.assertFalse((self.deploy / ".version").exists())

    def test_health_failure_brings_back_previous_version(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        host = FakeHost()
        self.assertEqual(self._upgrade(host, http=502), 1)
        self.assertEqual(host.head, OLD)
        last_up = [v for c, v in host.calls if "--remove-orphans" in c][-1]
        self.assertEqual(last_up, "sha-" + OLD[:12])
        self.assertEqual(read_version(self.deploy), {"current": OLD})

    def test_backups_keep_ten(self):
        backups = self.deploy / "backups"
        for index in range(12):
            (backups / f"20260101T0000{index:02d}Z-old").mkdir(parents=True)
        (backups / "notes.env").write_text("kept\n")
        self.assertEqual(self._upgrade(FakeHost()), 0)
        directories = [p for p in backups.iterdir() if p.is_dir()]
        self.assertEqual(len(directories), 10)
        self.assertFalse((backups / "20260101T000000Z-old").exists())
        self.assertTrue((backups / "notes.env").exists())

    def test_images_keep_three_sha_tags_per_repository(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        rows = [f"qjudge/backend\tsha-{i:012d}\t2026-09-0{i} 10:00:00 +0000 UTC" for i in range(1, 6)]
        rows += ["qjudge/backend\tlatest\t2026-09-01 10:00:00 +0000 UTC",
                 "postgres\tsha-000000000001\t2026-09-01 10:00:00 +0000 UTC"]
        host = FakeHost(images="\n".join(rows) + "\n")
        self.assertEqual(self._upgrade(host), 0)
        removed = [c.split()[-1] for c in host.commands() if c.startswith("docker image rm")]
        self.assertEqual(sorted(removed), ["qjudge/backend:sha-000000000001", "qjudge/backend:sha-000000000002"])

    def test_ps_rows_accept_array_and_line_formats(self):
        rows = [{"Service": "backend", "Health": "healthy"}, {"Service": "redis", "Health": ""}]
        self.assertEqual(_ps_rows(json.dumps(rows)), rows)
        self.assertEqual(_ps_rows("\n".join(json.dumps(r) for r in rows) + "\n"), rows)
        self.assertEqual(_ps_rows(""), [])

    def test_rollback_swaps_versions(self):
        (self.deploy / ".version").write_text(f"current={NEW}\nprevious={OLD}\n")
        host = FakeHost(head=NEW)
        self.assertEqual(self._rollback(host), 0)
        self.assertEqual(host.head, OLD)
        last_up = [v for c, v in host.calls if "--remove-orphans" in c][-1]
        self.assertEqual(last_up, "sha-" + OLD[:12])
        self.assertEqual(read_version(self.deploy), {"current": OLD, "previous": NEW})

    def test_rollback_to_legacy_main_accepts_running_workers_without_healthchecks(self):
        # Main 23b3442 disabled ai-worker's image check; celery/reconciler had none.
        (self.deploy / ".version").write_text(f"current={NEW}\nprevious={OLD}\n")
        host = FakeHost(head=NEW, containers_by_ref={OLD: app_containers(legacy=True)})
        self.assertEqual(self._rollback(host), 0)
        self.assertEqual(host.head, OLD)
        self.assertEqual(read_version(self.deploy), {"current": OLD, "previous": NEW})

    def test_legacy_rollback_rejects_unhealthy_checked_services(self):
        for service in ("backend", "ai-service", "integrity-resident"):
            with self.subTest(service=service):
                containers = app_containers(legacy=True)
                next(c for c in containers if c["Id"] == f"container-{service}")["State"]["Health"]["Status"] = "unhealthy"
                self._assert_rollback_rejected(containers)

    def test_rollback_requires_enabled_worker_healthchecks_to_be_healthy(self):
        for service in ("celery", "ai-worker", "integrity-reconciler"):
            for health in ("unhealthy", "starting", None):
                with self.subTest(service=service, health=health):
                    containers = app_containers()
                    state = next(c for c in containers if c["Id"] == f"container-{service}")["State"]
                    if health is None:
                        state.pop("Health")
                    else:
                        state["Health"]["Status"] = health
                    self._assert_rollback_rejected(containers)

    def test_legacy_rollback_rejects_workers_that_are_missing_or_not_running(self):
        for service in ("celery", "ai-worker", "integrity-reconciler"):
            for status in ("missing", "exited", "restarting", "paused"):
                with self.subTest(service=service, status=status):
                    containers = app_containers(legacy=True)
                    container = next(c for c in containers if c["Id"] == f"container-{service}")
                    if status == "missing":
                        containers.remove(container)
                    else:
                        container["State"]["Status"] = status
                    self._assert_rollback_rejected(containers)

    def test_rollback_rejects_exited_container_even_with_last_healthy_status(self):
        containers = app_containers()
        containers[-1]["State"]["Status"] = "exited"
        self._assert_rollback_rejected(containers)

    def test_legacy_rollback_checks_healthchecks_inherited_from_images(self):
        containers = app_containers(legacy=True)
        celery = next(c for c in containers if c["Id"] == "container-celery")
        # Docker's effective Config includes image checks even when Compose omits them.
        celery["Config"]["Healthcheck"] = {"Test": ["CMD", "image-readiness"]}
        celery["State"]["Health"] = {"Status": "unhealthy"}
        self._assert_rollback_rejected(containers)

    def test_rollback_rejects_container_listing_or_inspection_errors(self):
        for command in ("ps --all --quiet", "docker container inspect"):
            with self.subTest(command=command):
                (self.deploy / ".version").write_text(f"current={NEW}\nprevious={OLD}\n")
                host = FakeHost(head=NEW, fail_on=(command,))
                self.assertEqual(self._rollback(host), 1)
                self.assertEqual(host.head, NEW)
                self.assertEqual(read_version(self.deploy), {"current": NEW, "previous": OLD})

    def _assert_rollback_rejected(self, containers):
        (self.deploy / ".version").write_text(f"current={NEW}\nprevious={OLD}\n")
        host = FakeHost(head=NEW, containers_by_ref={OLD: containers})
        self.assertEqual(self._rollback(host), 1)
        self.assertEqual(host.head, NEW)
        self.assertEqual(read_version(self.deploy), {"current": NEW, "previous": OLD})
        self.assertEqual([v for c, v in host.calls if "--remove-orphans" in c][-1], "sha-" + NEW[:12])

    def test_rollback_without_previous_fails(self):
        (self.deploy / ".version").write_text(f"current={NEW}\n")
        host = FakeHost(head=NEW)
        self.assertEqual(self._rollback(host), 1)
        self.assertEqual(host.head, NEW)



class HttpStatusTests(unittest.TestCase):
    def test_redirects_are_reported_not_followed(self):
        import http.server
        import threading

        class Redirect(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                proto = self.headers.get("X-Forwarded-Proto")
                self.send_response(200 if proto == "https" else 301)
                self.send_header("Location", "https://judge.example.edu/api/health/")
                self.end_headers()

            def log_message(self, *args):
                pass

        server = http.server.HTTPServer(("127.0.0.1", 0), Redirect)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            url = f"http://127.0.0.1:{server.server_port}/api/health/"
            self.assertEqual(http_status(url, "judge.example.edu", "http"), 301)
            self.assertEqual(http_status(url, "judge.example.edu", "https"), 200)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
