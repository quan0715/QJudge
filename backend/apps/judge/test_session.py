"""Failure boundaries of the per-submission container; no Docker or database required."""
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from .io_judge import IOJudge, _CE_SENTINEL, _SETUP_ERROR_SENTINEL


class FakeContainer:
    id = "container"

    def __init__(self):
        self.removed = 0

    def remove(self, **kwargs):
        self.removed += 1


def session_judge(language="cpp"):
    judge = IOJudge(language)
    judge._ensure_docker_client = lambda: None
    containers = []

    def start(memory_limit):
        containers.append(FakeContainer())
        return containers[-1]

    judge._start_container = start
    return judge, containers


class JudgeSessionTests(TestCase):
    def test_compile_failure_verdicts_are_separate_from_runtime(self):
        for raw, status in [
            ({"exit_code": 124, "output": ""}, "CE"),
            ({"exit_code": 1, "output": _CE_SENTINEL + " syntax error"}, "CE"),
            ({"exit_code": 0, "output": "", "output_limit_exceeded": True}, "CE"),
            ({"exit_code": -1, "output": "private host details"}, "SE"),
            ({"exit_code": 125, "output": ""}, "SE"),
        ]:
            with self.subTest(raw=raw):
                judge, containers = session_judge()
                raw.update(time=123, memory=456)
                with patch.object(judge, "_exec", return_value=raw):
                    result = judge._prepare("int main(){}", 128)
                self.assertEqual(result["status"], status)
                self.assertEqual(result["time"], 0)
                self.assertEqual(result["memory"], 0)
                self.assertNotIn("private", result["error"])
                self.assertEqual(containers[0].removed, 1, "no case needs the container")

    def test_cases_share_one_container_and_compilation(self):
        judge, containers = session_judge()
        commands = []

        def run(command, timeout, **kwargs):
            commands.append((command, kwargs.get("user", "")))
            return {"exit_code": 0, "output": "ok", "time": 1, "memory": 1}

        judge._exec = run
        with judge:
            for _ in range(3):
                self.assertEqual(judge.execute("code", "", "ok", 1000, 128)["status"], "AC")
        self.assertEqual(len(containers), 1)
        self.assertEqual(containers[0].removed, 1)
        self.assertEqual(sum("g++" in command for command, _ in commands), 1)
        self.assertEqual([user for command, user in commands if "g++" not in command], ["0"] * 3)
        self.assertTrue(all("setpriv --reuid=1002" in command for command, _ in commands[1:]))

    def test_compilation_error_is_cached_for_later_cases(self):
        judge, containers = session_judge()
        calls = []

        def run(command, timeout, **kwargs):
            calls.append(command)
            return {"exit_code": 1, "output": _CE_SENTINEL + " error", "time": 0, "memory": 0}

        judge._exec = run
        for _ in range(2):
            self.assertEqual(judge.execute("bad", "", "", 1000, 128)["status"], "CE")
        self.assertEqual((len(calls), len(containers)), (1, 1))

    def test_killed_case_restarts_container_for_the_next_case(self):
        judge, containers = session_judge()

        def run(command, timeout, **kwargs):
            if "setpriv" in command and len(containers) == 1:
                judge.close()  # what _exec does after a timeout or output-limit kill
                return {"exit_code": 124, "output": "", "time": 0, "memory": 0}
            return {"exit_code": 0, "output": "ok", "time": 1, "memory": 1}

        judge._exec = run
        self.assertEqual(judge.execute("code", "", "ok", 1000, 128)["status"], "TLE")
        self.assertEqual(judge.execute("code", "", "ok", 1000, 128)["status"], "AC")
        self.assertEqual(len(containers), 2)
        self.assertEqual(containers[0].removed, 1)

    def test_new_code_gets_a_new_container(self):
        judge, containers = session_judge()
        judge._exec = lambda command, timeout, **kwargs: {"exit_code": 0, "output": "ok", "time": 1, "memory": 1}
        judge.execute("first", "", "ok", 1000, 128)
        judge.execute("second", "", "ok", 1000, 128)
        self.assertEqual(len(containers), 2)
        self.assertEqual(containers[0].removed, 1)

    def test_failed_container_start_is_se(self):
        judge = IOJudge("cpp")
        judge._ensure_docker_client = lambda: None
        removed = []
        container = SimpleNamespace(
            start=lambda: (_ for _ in ()).throw(RuntimeError("start failed")),
            remove=lambda **kwargs: removed.append(kwargs),
        )
        judge._client = SimpleNamespace(containers=SimpleNamespace(create=lambda **kwargs: container))
        self.assertEqual(judge.execute("int main(){}", "", "", 1000, 128)["status"], "SE")
        self.assertEqual(removed, [{"force": True}])

    def test_setup_failure_does_not_change_student_exit_code_125(self):
        judge = IOJudge("cpp")
        for output, status in [(_SETUP_ERROR_SENTINEL, "SE"), ("student output", "RE")]:
            result = judge._interpret(dict(exit_code=125, output=output, time=0, memory=0), "", 1000)
            self.assertEqual(result["status"], status)
