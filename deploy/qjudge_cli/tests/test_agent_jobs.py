import os
import stat
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from qjudge_cli.agent import state
from qjudge_cli.agent.jobs import TargetNotLatest, create_job, latest_main, run_job
from qjudge_cli.agent.state import log_tail, mark_interrupted, read_job, write_job
from qjudge_cli.release import STEP_MARKER
from qjudge_cli.release_lock import AGENT_JOB_ENV, ReleaseBusy, release_lock
from qjudge_cli.tests.test_check import VALID
from qjudge_cli.tests.test_release import NEW, OLD, FakeHost


class Host(FakeHost):
    """FakeHost whose origin/main is NEW and whose git fetch can fail or stall."""

    def __init__(self, *args, fetch_fails=False, fetch_delay=0.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.fetch_fails = fetch_fails
        self.fetch_delay = fetch_delay

    def __call__(self, args, **kwargs):
        if args[:2] == ["git", "-C"] and "fetch" in args:
            self.calls.append((list(args), None))
            time.sleep(self.fetch_delay)
            code = 1 if self.fetch_fails else 0
            return type("Result", (), {"returncode": code, "stdout": "", "stderr": "network down"})()
        if args[:2] == ["git", "-C"] and "rev-parse" in args and "origin/main" in args:
            self.calls.append((list(args), None))
            return type("Result", (), {"returncode": 0, "stdout": NEW + "\n", "stderr": ""})()
        return super().__call__(args, **kwargs)


class FakeProcess:
    def __init__(self, lines, code):
        self.stdout = iter(lines)
        self.code = code

    def wait(self):
        return self.code


def fake_popen(lines, code, seen=None):
    def popen(args, **kwargs):
        if seen is not None:
            seen["args"] = list(args)
            seen.update(kwargs)
        return FakeProcess(lines, code)
    return popen


class AgentJobTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.deploy = Path(self.directory.name) / "deploy"
        self.deploy.mkdir()
        self.env_file = self.deploy / ".env"
        self.env_file.write_text("".join(f"{k}={v}\n" for k, v in VALID.items()))
        self.host = Host()

    def tearDown(self):
        self.directory.cleanup()

    def _run(self, job, lines, code, **overrides):
        options = {"popen": fake_popen(lines, code), "run": self.host, "http_status": lambda *a: 200}
        options.update(overrides)
        return run_job(self.deploy, self.env_file, job, **options)

    def test_successful_job_records_steps_and_log(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        done = run_job(self.deploy, self.env_file, job, popen=fake_popen(
            [f"{STEP_MARKER}prepare\n", "fetching\n", f"{STEP_MARKER}verify\n", "Upgraded\n"], 0),
            run=self.host, http_status=lambda *a: 200)
        self.assertEqual((done["status"], done["step"]), ("succeeded", "verify"))
        self.assertEqual(read_job(self.deploy)["status"], "succeeded")
        self.assertIn("Upgraded", log_tail(self.deploy))

    def test_failure_before_build_records_prepare_and_site_health(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        job = create_job(self.deploy, NEW, "root", run=self.host)
        done = run_job(self.deploy, self.env_file, job, popen=fake_popen(
            [f"{STEP_MARKER}prepare\n", "error: Your local changes would be overwritten\n"], 1),
            run=self.host, http_status=lambda *a: 200)
        self.assertEqual((done["status"], done["step"], done["site_healthy"]), ("failed", "prepare", True))

    def test_stale_target_is_rejected(self):
        with self.assertRaises(TargetNotLatest) as caught:
            create_job(self.deploy, OLD, "root", run=self.host)
        self.assertEqual(caught.exception.latest, NEW)
        self.assertIsNone(read_job(self.deploy))

    def test_second_start_while_running_is_busy(self):
        create_job(self.deploy, NEW, "root", run=self.host)
        with self.assertRaises(ReleaseBusy):
            create_job(self.deploy, NEW, "other", run=self.host)

    def test_start_is_busy_while_cli_holds_the_lock(self):
        with release_lock(self.deploy), self.assertRaises(ReleaseBusy):
            create_job(self.deploy, NEW, "root", run=self.host)
        self.assertIsNone(read_job(self.deploy))

    def test_running_job_without_lock_becomes_interrupted(self):
        create_job(self.deploy, NEW, "root", run=self.host)
        mark_interrupted(self.deploy)
        job = read_job(self.deploy)
        self.assertEqual(job["status"], "interrupted")
        self.assertIsNotNone(job["finished_at"])

    def test_job_runs_the_cli_with_the_agent_marker(self):
        seen = {}
        job = create_job(self.deploy, NEW, "root", run=self.host)
        run_job(self.deploy, self.env_file, job, popen=fake_popen([], 0, seen), run=self.host,
                http_status=lambda *a: 200)
        self.assertEqual(seen["args"][-2:], ["upgrade", NEW])
        self.assertEqual(seen["args"][0], str(self.deploy / "qjudge"))
        self.assertEqual(seen["env"][AGENT_JOB_ENV], "1")

    def test_new_job_has_the_documented_fields(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        self.assertEqual(set(job), {"id", "target", "triggered_by", "started_at", "finished_at",
                                    "status", "step", "site_healthy"})
        self.assertEqual(len(job["id"]), 32)
        self.assertEqual((job["target"], job["triggered_by"], job["status"]), (NEW, "root", "running"))
        self.assertIsNone(job["finished_at"])
        self.assertIsNone(job["step"])
        self.assertIsNone(job["site_healthy"])
        self.assertRegex(job["started_at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertEqual(read_job(self.deploy), job)

    def test_start_clears_the_previous_log(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        self._run(job, ["old output\n"], 1)
        create_job(self.deploy, NEW, "root", run=self.host)
        self.assertEqual(log_tail(self.deploy), "")

    def test_finished_job_does_not_block_the_next_start(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        done = self._run(job, [], 0)
        self.assertRegex(done["finished_at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertNotEqual(create_job(self.deploy, NEW, "root", run=self.host)["id"], job["id"])

    def test_every_step_marker_is_persisted_as_it_arrives(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        seen = []

        def lines():
            for line in (f"{STEP_MARKER}prepare\n", f"{STEP_MARKER}build\n", "compiling\n"):
                yield line
                seen.append(read_job(self.deploy)["step"])

        self._run(job, lines(), 0)
        self.assertEqual(seen, ["prepare", "build", "build"])

    def test_unknown_step_names_are_ignored(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        done = self._run(job, [f"{STEP_MARKER}prepare\n", f"{STEP_MARKER}reticulate\n"], 0)
        self.assertEqual(done["step"], "prepare")

    def test_successful_job_leaves_site_health_unset(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        self.assertIsNone(self._run(job, [], 0)["site_healthy"])

    def test_failure_reports_an_unhealthy_site(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        job = create_job(self.deploy, NEW, "root", run=self.host)
        done = self._run(job, [], 1, http_status=lambda *a: 502)
        self.assertEqual((done["status"], done["site_healthy"]), ("failed", False))

    def test_failure_without_a_recorded_version_reports_an_unhealthy_site(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        self.assertFalse(self._run(job, [], 1)["site_healthy"])

    def test_site_health_failure_does_not_lose_the_job_result(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        self.env_file.unlink()
        job = create_job(self.deploy, NEW, "root", run=self.host)
        done = self._run(job, [], 1)
        self.assertEqual((done["status"], done["site_healthy"]), ("failed", False))
        self.assertEqual(read_job(self.deploy)["status"], "failed")

    def test_cli_that_cannot_start_fails_the_job(self):
        def broken(args, **kwargs):
            raise FileNotFoundError(args[0])

        job = create_job(self.deploy, NEW, "root", run=self.host)
        done = self._run(job, [], 0, popen=broken)
        self.assertEqual(done["status"], "failed")
        self.assertEqual(read_job(self.deploy)["status"], "failed")
        self.assertIn(str(self.deploy / "qjudge"), log_tail(self.deploy))

    def test_log_write_failure_keeps_draining_the_cli_output(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        consumed = []

        def lines():
            for line in ("one\n", "two\n", "three\n"):
                consumed.append(line)
                yield line

        with patch.object(state, "append_log", side_effect=OSError("disk full")):
            done = self._run(job, lines(), 0)
        self.assertEqual(consumed, ["one\n", "two\n", "three\n"])
        self.assertEqual(done["status"], "succeeded")

    def test_run_job_does_not_modify_the_job_it_was_given(self):
        job = create_job(self.deploy, NEW, "root", run=self.host)
        before = dict(job)
        self._run(job, [f"{STEP_MARKER}prepare\n"], 0)
        self.assertEqual(job, before)

    def test_fetch_failure_is_reported_instead_of_trusting_a_stale_ref(self):
        host = Host(fetch_fails=True)
        with self.assertRaises(RuntimeError):
            latest_main(self.deploy, host)
        with self.assertRaises(RuntimeError):
            create_job(self.deploy, NEW, "root", run=host)
        self.assertIsNone(read_job(self.deploy))

    def test_latest_main_fetches_main_then_resolves_origin_main(self):
        self.assertEqual(latest_main(self.deploy, self.host), NEW)
        commands = self.host.commands()
        repo = str(self.deploy.parent)
        self.assertEqual(commands, [f"git -C {repo} fetch origin main", f"git -C {repo} rev-parse origin/main"])

    def test_latest_main_bounds_both_git_calls_with_a_timeout(self):
        timeouts = []

        def run(args, **kwargs):
            timeouts.append(kwargs.get("timeout"))
            return self.host(args, **kwargs)

        latest_main(self.deploy, run)
        self.assertEqual(timeouts, [60, 60])

    def test_git_timeout_is_reported_like_any_other_git_failure(self):
        for hanging in ("fetch", "rev-parse"):
            with self.subTest(hanging=hanging):
                def run(args, **kwargs):
                    if hanging in args:
                        raise subprocess.TimeoutExpired(args, 60)
                    return self.host(args, **kwargs)

                with self.assertRaises(RuntimeError):
                    latest_main(self.deploy, run)
                with self.assertRaises(RuntimeError):
                    create_job(self.deploy, NEW, "root", run=run)
                self.assertIsNone(read_job(self.deploy))

    def test_job_child_has_unbuffered_output_and_no_stdin(self):
        seen = {}
        job = create_job(self.deploy, NEW, "root", run=self.host)
        run_job(self.deploy, self.env_file, job, popen=fake_popen([], 0, seen), run=self.host,
                http_status=lambda *a: 200)
        self.assertEqual(seen["env"]["PYTHONUNBUFFERED"], "1")
        self.assertEqual(seen["env"][AGENT_JOB_ENV], "1")
        self.assertIs(seen["stdin"], subprocess.DEVNULL)

    def test_lock_probe_errors_are_not_treated_as_free(self):
        missing = self.deploy / "missing"
        with self.assertRaises(OSError):
            create_job(missing, NEW, "root", run=self.host)

    def test_concurrent_starts_admit_exactly_one_job(self):
        host = Host(fetch_delay=0.05)
        outcomes = []
        barrier = threading.Barrier(2)

        def start(name):
            barrier.wait()
            try:
                outcomes.append(create_job(self.deploy, NEW, name, run=host)["triggered_by"])
            except ReleaseBusy:
                outcomes.append("busy")

        threads = [threading.Thread(target=start, args=(name,)) for name in ("a", "b")]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(sorted(outcomes), sorted(["busy", read_job(self.deploy)["triggered_by"]]))


class StateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.deploy = Path(self.directory.name) / "deploy"
        self.deploy.mkdir()

    def tearDown(self):
        self.directory.cleanup()

    def test_state_lives_under_the_ignored_agent_directory(self):
        self.assertEqual(state.job_path(self.deploy), self.deploy / ".agent" / "job.json")
        self.assertEqual(state.log_path(self.deploy), self.deploy / ".agent" / "job.log")

    def test_missing_job_reads_as_none(self):
        self.assertIsNone(read_job(self.deploy))

    def test_unreadable_job_file_reads_as_none(self):
        write_job(self.deploy, {"id": "x"})
        state.job_path(self.deploy).write_text("{not json")
        self.assertIsNone(read_job(self.deploy))

    def test_job_round_trips_and_is_private(self):
        job = {"id": "abc", "status": "running", "step": None, "site_healthy": None}
        write_job(self.deploy, job)
        self.assertEqual(read_job(self.deploy), job)
        mode = stat.S_IMODE(os.stat(state.job_path(self.deploy)).st_mode)
        self.assertEqual(mode, 0o600)

    def test_write_job_replaces_atomically_without_leftovers(self):
        write_job(self.deploy, {"id": "one"})
        write_job(self.deploy, {"id": "two"})
        self.assertEqual(read_job(self.deploy), {"id": "two"})
        self.assertEqual(sorted(p.name for p in (self.deploy / ".agent").iterdir()), ["job.json"])

    def test_log_tail_returns_the_last_lines(self):
        state.reset_log(self.deploy)
        state.log_path(self.deploy).write_text("".join(f"line {i}\n" for i in range(500)))
        tail = log_tail(self.deploy, lines=3)
        self.assertEqual(tail, "line 497\nline 498\nline 499\n")
        self.assertEqual(len(log_tail(self.deploy).splitlines()), 200)

    def test_log_tail_without_a_log_is_empty(self):
        self.assertEqual(log_tail(self.deploy), "")

    def test_log_tail_survives_undecodable_bytes(self):
        state.reset_log(self.deploy)
        state.log_path(self.deploy).write_bytes(b"ok\n\xff\xfe broken\n")
        self.assertIn("ok", log_tail(self.deploy))

    def test_mark_interrupted_leaves_a_job_whose_lock_is_held(self):
        write_job(self.deploy, {"id": "x", "status": "running", "finished_at": None})
        with release_lock(self.deploy):
            mark_interrupted(self.deploy)
        self.assertEqual(read_job(self.deploy)["status"], "running")

    def test_mark_interrupted_ignores_finished_and_missing_jobs(self):
        mark_interrupted(self.deploy)
        self.assertIsNone(read_job(self.deploy))
        write_job(self.deploy, {"id": "x", "status": "succeeded", "finished_at": "t"})
        mark_interrupted(self.deploy)
        self.assertEqual(read_job(self.deploy), {"id": "x", "status": "succeeded", "finished_at": "t"})


if __name__ == "__main__":
    unittest.main()
