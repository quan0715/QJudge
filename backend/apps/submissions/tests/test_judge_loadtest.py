import json
import tempfile
from contextlib import contextmanager
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.problems.models import CodingProblem
from apps.submissions.models import Submission

COMMAND = "apps.submissions.management.commands.judge_loadtest"


def judge_by_code(args, queue):
    """Stand-in for the worker: the verdict each generated program should get."""
    code = Submission.objects.get(pk=args[0]).code
    status = "CE" if code.startswith("int main( {") else "WA" if "qjudge-lt-wa" in code else "AC"
    Submission.objects.filter(pk=args[0]).update(status=status)


@contextmanager
def worker(judge=judge_by_code):
    with patch(f"{COMMAND}.judge_submission.apply_async", side_effect=judge) as dispatch, \
            patch(f"{COMMAND}.Command.worker_concurrency", return_value=4), \
            patch(f"{COMMAND}.HostSampler.sample"), \
            patch(f"{COMMAND}.time.sleep"):
        yield dispatch


def command(*args):
    call_command("judge_loadtest", *args, stdout=StringIO())


class JudgeLoadTestCommandTests(TestCase):
    def test_seed_run_and_cleanup_touch_only_load_test_data(self):
        other = get_user_model().objects.create_user(username="student", email="s@example.test")
        command("seed", "--cases", "3")
        problem = CodingProblem.objects.get(slug="lt-judge-loadtest")
        self.assertEqual(list(problem.test_cases.values_list("weight_percent", flat=True)), [34, 33, 33])
        self.assertIsNone(problem.question_asset_id, "students must not see the problem")

        with worker() as dispatch, tempfile.NamedTemporaryFile("r", suffix=".json") as out:
            command("run", "--count", "20", "--out", out.name)
            report = json.load(out)

        self.assertEqual((report["count"], report["unexpected"]), (20, 0))
        self.assertEqual(set(report["statuses"]), {"AC", "WA", "CE"})
        self.assertEqual({c.kwargs["queue"] for c in dispatch.call_args_list}, {"high_priority"})
        command("cleanup")
        self.assertFalse(CodingProblem.objects.filter(slug="lt-judge-loadtest").exists())
        self.assertFalse(Submission.objects.exists())
        self.assertTrue(get_user_model().objects.filter(pk=other.pk).exists())

    def test_wrong_verdict_fails_the_run(self):
        command("seed", "--cases", "1")
        system_error = lambda args, queue: Submission.objects.filter(pk=args[0]).update(status="SE")  # noqa: E731
        with worker(system_error), self.assertRaises(CommandError):
            command("run", "--count", "2")

    def test_recent_real_backlog_stops_submitting(self):
        command("seed", "--cases", "1")
        with worker(), patch(f"{COMMAND}.Command.real_backlog", return_value=True), \
                self.assertRaises(CommandError):
            command("run", "--count", "5")
        self.assertFalse(Submission.objects.exists())
