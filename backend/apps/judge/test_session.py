"""Failure boundaries of the per-submission container and runner; no Docker or database required."""
import json
from threading import Condition, Thread
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

import docker

from .io_judge import IOJudge

BUILT = {"exit": 0, "timeout": False, "ole": False, "output": ""}
SE = {"status": "SE", "output": "", "error": "Judge system error", "time": 0, "memory": 0}


def case(output="ok"):
    return {"exit": 0, "time": 1, "memory": 1, "tle": False, "ole": False, "output": output}


class FakeContainer:
    id = "container"

    def __init__(self):
        self.removed = 0

    def remove(self, **kwargs):
        self.removed += 1


def session_judge(records, language="cpp"):
    """A judge whose runner emits *records* (the build record first)."""
    judge = IOJudge(language)
    judge._ensure_docker_client = lambda: None
    containers = []

    def start(memory_limit):
        containers.append(FakeContainer())
        return containers[-1]

    judge._start_container = start
    judge._records = lambda *args: (record for record in records)
    return judge, containers


class JudgeSessionTests(TestCase):
    def test_build_failures_are_ce_and_run_no_case(self):
        for build, error in [
            ({**BUILT, "exit": 137, "timeout": True}, "Compilation time limit exceeded"),
            ({**BUILT, "exit": 1, "ole": True, "output": "x" * 10}, "Compiler output limit exceeded (1 MiB)"),
            ({**BUILT, "exit": 1, "output": "main.cpp:1: error: syntax\n"}, "main.cpp:1: error: syntax"),
        ]:
            with self.subTest(error=error):
                judge, _ = session_judge([build, case()])
                results = list(judge.run("code", [("", "ok")] * 3, 1000, 128))
                self.assertEqual(results, [{"status": "CE", "output": "", "error": error, "time": 0, "memory": 0}])

    def test_runner_that_stops_early_is_se_after_the_judged_cases(self):
        def failing():
            yield BUILT
            yield case()
            raise RuntimeError("private host details")

        for records, statuses in [
            ([], ["SE"]),
            ([BUILT, case()], ["AC", "SE"]),
            (failing(), ["AC", "SE"]),
        ]:
            with self.subTest(statuses=statuses):
                judge, _ = session_judge(records)
                results = list(judge.run("code", [("", "ok")] * 3, 1000, 128))
                self.assertEqual([r["status"] for r in results], statuses)
                self.assertEqual(results[-1], SE)

    def test_cases_share_one_container_removed_on_close(self):
        judge, containers = session_judge([BUILT, case("ok"), case("no"), case("ok")])
        with judge:
            statuses = [r["status"] for r in judge.run("code", [("", "ok")] * 3, 1000, 128)]
        self.assertEqual(statuses, ["AC", "WA", "AC"])
        self.assertEqual(len(containers), 1)
        self.assertEqual(containers[0].removed, 1)

    def test_each_run_gets_a_new_container(self):
        judge, containers = session_judge([BUILT, case()])
        with judge:
            for code in ["first", "second"]:
                self.assertEqual([r["status"] for r in judge.run(code, [("", "ok")], 1000, 128)], ["AC"])
        self.assertEqual([c.removed for c in containers], [1, 1])

    def test_no_cases_start_no_container(self):
        judge, containers = session_judge([BUILT])
        self.assertEqual(list(judge.run("code", [], 1000, 128)), [])
        self.assertEqual(containers, [])

    def test_failed_container_start_is_se(self):
        judge = IOJudge("cpp")
        judge._ensure_docker_client = lambda: None
        removed = []
        container = SimpleNamespace(
            start=lambda: (_ for _ in ()).throw(RuntimeError("start failed")),
            remove=lambda **kwargs: removed.append(kwargs),
        )
        judge._client = SimpleNamespace(containers=SimpleNamespace(create=lambda **kwargs: container))
        self.assertEqual(list(judge.run("int main(){}", [("", "")], 1000, 128)), [SE])
        self.assertEqual(removed, [{"force": True}])


class RunnerProtocolTests(TestCase):
    def test_records_may_span_frames_and_stderr_is_logged(self):
        frames = [
            (1, b'{"exit": 0, "size": 6}\nab'),
            (2, b"Traceback: runner detail"),
            (1, b'c\xe4\xbd'),
            (1, b'\xa0{"exit": 1, "size": 0}\n'),
        ]
        with self.assertLogs("apps.judge.io_judge", "ERROR") as logs:
            records = list(IOJudge._parse(frames))
        self.assertEqual(records, [
            {"exit": 0, "size": 6, "output": "abc你"},
            {"exit": 1, "size": 0, "output": ""},
        ])
        self.assertIn("runner detail", logs.output[0])

    def test_source_and_inputs_go_through_stdin_not_argv(self):
        judge, sock = runner_judge("python", 2)
        results = judge_all(judge, [("1 2", "3"), ("你", "3")])
        self.assertEqual([r["status"] for r in results], ["AC", "AC"])
        argv = judge._client.api.exec_create.call_args.args[1]
        self.assertEqual(argv[:4], ["python3", "-I", "-S", "-c"])
        self.assertEqual(judge._client.api.exec_create.call_args.kwargs["user"], "0")
        self.assertEqual(b"".join(data for _, data in sock.sent), b"8\nprint(1)3\n1 23\n\xe4\xbd\xa0")
        self.assertNotIn("1 2", " ".join(argv))
        config = json.loads(argv[-1])
        self.assertEqual(config["cases"], 2)
        self.assertIsNone(config["compile"])
        self.assertEqual(config["run"], ["python3", "/tmp/build/main.py"])
        self.assertEqual((config["time_limit"], config["wall_limit"]), (1000, 3000))
        self.assertIsNone(sock.timeout)
        self.assertTrue(sock.closed)

    def test_java_runs_with_the_memory_limit(self):
        judge, _ = runner_judge("java", 0)
        judge_all(judge, [("", "")])
        config = json.loads(judge._client.api.exec_create.call_args.args[1][-1])
        self.assertEqual(config["compile"], ["javac", "Main.java"])
        self.assertIn("-Xmx256m", config["run"])

    def test_cases_get_input_only_after_the_problem_limit_applies(self):
        judge, sock = runner_judge("cpp", 1)
        self.assertEqual([r["status"] for r in judge_all(judge, [("1 2", "3")])], ["AC"])
        self.assertEqual(judge.budgets, [1024])
        self.assertEqual(judge.updates, [{"mem_limit": "256m", "memswap_limit": "256m"}])
        self.assertEqual([data for _, data in sock.sent], [b"8\n", b"print(1)", b"3\n", b"1 2"])
        self.assertEqual([updates for updates, _ in sock.sent[2:]], [1, 1])

    def test_failed_limit_drop_is_se_and_runs_no_case(self):
        def refuse(**limits):
            raise docker.errors.APIError("cannot update memory")

        judge, sock = runner_judge("cpp", 1, update=refuse)
        self.assertEqual(judge_all(judge, [("1 2", "3")]), [SE])
        self.assertEqual([data for _, data in sock.sent], [b"8\n", b"print(1)"])


BUILD_FRAME = (1, b'{"exit": 0, "timeout": false, "ole": false, "size": 0}\n')
CASE_FRAME = (1, b'{"exit": 0, "time": 1, "memory": 1, "tle": false, "ole": false, "size": 1}\n3')


class FakeSocket:
    def __init__(self, updates):
        self.updates, self.sent, self.closed = updates, [], False
        self.condition = Condition()

    def settimeout(self, timeout):
        self.timeout = timeout

    def sendall(self, data):
        if self.closed:
            raise BrokenPipeError
        with self.condition:
            self.sent.append((len(self.updates), data))
            self.condition.notify_all()

    def wait_for(self, sends):
        with self.condition:
            self.condition.wait_for(lambda: len(self.sent) >= sends, timeout=5)

    def shutdown(self, how):
        self.closed = True

    def close(self):
        self.closed = True


def runner_judge(language, case_count, update=None):
    """A judge whose Docker API is faked down to the exec socket; like the
    runner, it reports a case only once that case's input has arrived."""
    judge = IOJudge(language)
    judge._ensure_docker_client = lambda: None
    judge.budgets, judge.updates, judge.writers = [], [], []
    sock = FakeSocket(judge.updates)
    judge._client = MagicMock()
    judge._client.api.exec_create.return_value = {"Id": "exec"}
    judge._client.api.exec_start.return_value = SimpleNamespace(_sock=sock, close=lambda: None)
    container = SimpleNamespace(
        id="container", remove=lambda **kwargs: None,
        update=update or (lambda **limits: judge.updates.append(limits)),
    )
    judge._start_container = lambda memory_mb: judge.budgets.append(memory_mb) or container

    def frames():
        yield BUILD_FRAME
        for case in range(1, case_count + 1):
            sock.wait_for(2 + 2 * case)  # the source, then one input per case
            yield CASE_FRAME

    judge.frames = frames()
    return judge, sock


def judge_all(judge, cases):
    def writer(**kwargs):
        judge.writers.append(Thread(**kwargs))
        return judge.writers[-1]

    with patch("apps.judge.io_judge.Thread", writer), \
            patch("apps.judge.io_judge.frames_iter", return_value=judge.frames):
        results = list(judge.run("print(1)", cases, 1000, 256))
    for thread in judge.writers:
        thread.join(5)
    return results
