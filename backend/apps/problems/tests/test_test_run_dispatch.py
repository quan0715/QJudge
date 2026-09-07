"""The web process must delegate test runs to a judge worker.

Only the judge workers mount the Docker socket, so running the judge inline in
the API process always fails with SE. These tests lock the delegation in.
"""
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from celery.exceptions import TimeoutError as CeleryTimeoutError
from django.contrib.auth import get_user_model
from django.test import TestCase as DjangoTestCase, override_settings
from rest_framework.test import APIClient

from apps.problems.models import CodingProblem, TestCase as ProblemTestCase

from apps.problems.test_run_service import ProblemTestRunService, TestRunSetupError
from apps.problems.tasks import run_problem_test_run


PROBLEM = SimpleNamespace(id="c4b8ad0b-ccd9-41e0-b9a1-8ef85ca50487")


def _async_result(payload):
    result = MagicMock()
    result.get.return_value = payload
    return result


@override_settings(JUDGE_TEST_RUN_QUEUE="default", JUDGE_TEST_RUN_TIMEOUT=42)
def test_run_via_worker_dispatches_to_the_judge_queue():
    with patch(
        "apps.problems.tasks.run_problem_test_run.apply_async",
        return_value=_async_result({"ok": True, "result": {"status": "AC"}}),
    ) as apply_async:
        result = ProblemTestRunService.run_via_worker(
            problem=PROBLEM,
            language="cpp",
            source_code="int main(){}",
        )

    assert result == {"status": "AC"}
    apply_async.assert_called_once_with(
        args=[str(PROBLEM.id), "cpp", "int main(){}"],
        queue="default",
    )
    apply_async.return_value.get.assert_called_once_with(timeout=42)


def test_run_via_worker_maps_timeout_to_judge_unavailable():
    async_result = MagicMock()
    async_result.get.side_effect = CeleryTimeoutError("no result")

    with patch(
        "apps.problems.tasks.run_problem_test_run.apply_async",
        return_value=async_result,
    ):
        with pytest.raises(TestRunSetupError) as caught:
            ProblemTestRunService.run_via_worker(
                problem=PROBLEM, language="cpp", source_code=""
            )

    assert caught.value.code == "judge_unavailable"


@pytest.mark.parametrize(
    ("payload", "expected_code"),
    [
        ({"ok": False, "code": "unsupported_language"}, "unsupported_language"),
        ({"ok": False, "code": "judge_unavailable"}, "judge_unavailable"),
        ({"ok": False, "code": "host filesystem detail"}, "judge_unavailable"),
        ("not a dict", "judge_unavailable"),
    ],
)
def test_run_via_worker_only_surfaces_typed_codes(payload, expected_code):
    with patch(
        "apps.problems.tasks.run_problem_test_run.apply_async",
        return_value=_async_result(payload),
    ):
        with pytest.raises(TestRunSetupError) as caught:
            ProblemTestRunService.run_via_worker(
                problem=PROBLEM, language="cpp", source_code=""
            )

    assert caught.value.code == expected_code


def test_task_wraps_setup_errors_in_a_serialisable_envelope(db):
    with patch(
        "apps.problems.tasks.ProblemTestRunService.run",
        side_effect=TestRunSetupError("unsupported_language"),
    ), patch("apps.problems.tasks.CodingProblem.objects.get", return_value=PROBLEM):
        envelope = run_problem_test_run(str(PROBLEM.id), "brainfuck", "")

    assert envelope == {"ok": False, "code": "unsupported_language"}
    json.dumps(envelope)


def test_task_result_is_json_serialisable(db):
    """Celery uses the JSON result serialiser; the payload must survive it."""
    test_case = SimpleNamespace(
        id=7, input_data="1 2", output_data="3", is_hidden=False
    )
    problem = SimpleNamespace(
        id=PROBLEM.id,
        test_cases=SimpleNamespace(all=lambda: [test_case]),
        time_limit=1000,
        memory_limit=128,
    )
    judge = MagicMock()
    judge.execute.return_value = {
        "status": "AC",
        "time": 12,
        "memory": 2048,
        "output": "3",
        "error": "",
    }

    with patch(
        "apps.problems.tasks.CodingProblem.objects.get", return_value=problem
    ), patch(
        "apps.problems.test_run_service.judge_factory.get_judge", return_value=judge
    ):
        envelope = run_problem_test_run(str(PROBLEM.id), "python", "print(1)")

    assert envelope["ok"] is True
    json.dumps(envelope)


class TestRunEndpointDelegationTests(DjangoTestCase):
    """The API must hand the run to a worker instead of judging in-process."""

    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="dispatcher",
            email="dispatcher@example.com",
            password="password",
            role="teacher",
        )
        self.client.force_authenticate(user=self.user)

        self.problem = CodingProblem.objects.create(
            slug="dispatch-a-plus-b",
            time_limit=1000,
            memory_limit=128,
            created_by=self.user,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1 2",
            output_data="3",
            is_sample=True,
            score=100,
            order=1,
        )

    def _post(self):
        return self.client.post(
            f"/api/v1/management/problems/{self.problem.id}/test_run/",
            {"language": "python", "code": "print(1)"},
            format="json",
        )

    @override_settings(JUDGE_TEST_RUN_QUEUE="default")
    def test_endpoint_dispatches_the_run_to_the_judge_queue(self):
        with patch(
            "apps.problems.tasks.run_problem_test_run.apply_async",
            return_value=_async_result({"ok": True, "result": {"status": "AC", "results": []}}),
        ) as apply_async:
            response = self._post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "AC")
        args, kwargs = apply_async.call_args
        self.assertEqual(kwargs["queue"], "default")
        self.assertEqual(kwargs["args"], [str(self.problem.id), "python", "print(1)"])

    def test_endpoint_never_runs_the_judge_in_the_web_process(self):
        """get_judge is a Docker client; the API process has no Docker socket."""
        with patch(
            "apps.problems.tasks.run_problem_test_run.apply_async",
            return_value=_async_result({"ok": True, "result": {"status": "AC", "results": []}}),
        ), patch("apps.problems.test_run_service.judge_factory.get_judge") as get_judge:
            self._post()

        get_judge.assert_not_called()

    def test_worker_failure_surfaces_as_judge_system_error(self):
        async_result = MagicMock()
        async_result.get.side_effect = CeleryTimeoutError("no result")

        with patch(
            "apps.problems.tasks.run_problem_test_run.apply_async",
            return_value=async_result,
        ):
            response = self._post()

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data, {"error": "Judge system error"})

    def test_async_progress_is_scoped_to_requesting_user(self):
        task = MagicMock(id="test-task")
        with patch("apps.problems.tasks.run_problem_test_run.apply_async", return_value=task):
            response = self.client.post(
                f"/api/v1/management/problems/{self.problem.id}/test_run/",
                {"language": "python", "code": "print(1)", "asynchronous": True}, format="json",
            )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["total"], 1)
        token = response.data["run_id"]
        url = f"/api/v1/management/problems/{self.problem.id}/test_run_status/"
        with patch("celery.result.AsyncResult", return_value=SimpleNamespace(
            state="PROGRESS", info={"total": 4, "results": [{"status": "AC"}]}
        )):
            progress = self.client.get(url, {"run_id": token})
        self.assertEqual(progress.data["execution_status"], "judging")
        self.assertEqual(len(progress.data["results"]), 1)
        other = get_user_model().objects.create_user(username="other-run-user", password="password", role="teacher")
        self.client.force_authenticate(user=other)
        self.assertEqual(self.client.get(url, {"run_id": token}).status_code, 404)


def test_worker_reports_completed_cases_as_they_finish():
    cases = [SimpleNamespace(id=i, input_data=str(i), output_data=str(i), is_hidden=False) for i in range(4)]
    problem = SimpleNamespace(test_cases=SimpleNamespace(all=lambda: cases), time_limit=1000, memory_limit=128)
    judge = MagicMock()
    judge.execute.return_value = {"status": "AC", "output": "ok"}
    updates = []
    with patch("apps.problems.test_run_service.judge_factory.get_judge", return_value=judge):
        result = ProblemTestRunService.run(problem=problem, language="cpp", source_code="code", on_progress=updates.append)
    assert [len(update["results"]) for update in updates] == [0, 1, 2, 3, 4]
    assert all(update["total"] == 4 for update in updates)
    assert len(result["results"]) == 4
