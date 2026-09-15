"""Services for ad-hoc problem test runs."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal, Sequence

from celery.exceptions import TimeoutError as CeleryTimeoutError
from django.conf import settings

from apps.judge import judge_factory
from apps.problems.models import CodingProblem, TestCase

HARD_FAILURE_STATUSES = {"CE", "SE"}
# A custom case without an expected output has nothing to compare against, so
# only these statuses say something about it; anything else is just "info".
CUSTOM_FAILURE_STATUSES = {"CE", "RE", "TLE", "MLE", "SE"}
logger = logging.getLogger(__name__)

TestRunSetupErrorCode = Literal["unsupported_language", "judge_unavailable"]
SETUP_ERROR_CODES = frozenset({"unsupported_language", "judge_unavailable"})


class TestRunSetupError(Exception):
    """Raised when the test-run environment cannot be prepared."""

    def __init__(self, code: TestRunSetupErrorCode) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class CustomTestRunCase:
    """A solver-written case; never stored."""

    id: str
    input_data: str
    output_data: str


def build_custom_cases(custom_test_cases: Sequence[dict]) -> list[CustomTestRunCase]:
    return [
        CustomTestRunCase(
            id=f"custom_{index}",
            input_data=case.get("input", ""),
            output_data=case.get("expected_output", "") or "",
        )
        for index, case in enumerate(custom_test_cases, start=1)
    ]


class ProblemTestRunService:
    """Runs the public sample cases plus custom cases, without a submission.

    Hidden and non-sample cases never run here: their verdicts, inputs and
    expected outputs are only for formal submissions.
    """

    @classmethod
    def run_via_worker(
        cls,
        *,
        problem: CodingProblem,
        language: str,
        source_code: str,
        custom_test_cases: Sequence[dict] = (),
    ) -> dict:
        """Run the test cases in a judge worker and wait for the verdict.

        Only the judge workers can reach the Docker daemon, so the web process
        must not call :meth:`run` directly. The HTTP contract stays synchronous:
        this blocks until the worker reports back, or raises
        :class:`TestRunSetupError` so the caller can map it to a response.
        """
        from apps.problems.tasks import run_problem_test_run

        async_result = run_problem_test_run.apply_async(
            args=[str(problem.id), language, source_code],
            kwargs={"custom_test_cases": list(custom_test_cases)},
            queue=settings.JUDGE_TEST_RUN_QUEUE,
        )

        try:
            payload = async_result.get(timeout=settings.JUDGE_TEST_RUN_TIMEOUT)
        except CeleryTimeoutError as exc:
            logger.error(
                "Test run timed out after %ss for problem_id=%s",
                settings.JUDGE_TEST_RUN_TIMEOUT,
                problem.id,
            )
            raise TestRunSetupError("judge_unavailable") from exc
        except Exception as exc:
            logger.exception("Test run worker failed for problem_id=%s", problem.id)
            raise TestRunSetupError("judge_unavailable") from exc
        finally:
            try:
                async_result.forget()
            except Exception:  # pragma: no cover - result backend best effort
                logger.debug("Could not forget test run result", exc_info=True)

        if not isinstance(payload, dict) or not payload.get("ok"):
            code = payload.get("code") if isinstance(payload, dict) else None
            if code not in SETUP_ERROR_CODES:
                code = "judge_unavailable"
            raise TestRunSetupError(code)

        return payload["result"]

    @staticmethod
    def build_test_cases(
        problem: CodingProblem,
        custom_test_cases: Sequence[dict] = (),
    ) -> list[TestCase | CustomTestRunCase]:
        """Samples first, then custom cases: the order the solver UI lists them."""
        return [*problem.public_sample_cases(), *build_custom_cases(custom_test_cases)]

    @staticmethod
    def _build_case_result(tc: TestCase | CustomTestRunCase, exec_result: dict) -> dict:
        raw_status = exec_result.get("status", "SE")
        is_custom = isinstance(tc, CustomTestRunCase)
        expected_output = tc.output_data or ""
        compares = not is_custom or expected_output.strip() != ""
        if compares:
            verdict = raw_status
        else:
            verdict = raw_status if raw_status in CUSTOM_FAILURE_STATUSES else "info"

        return {
            "case_id": tc.id,
            "source": "custom" if is_custom else "sample",
            "status": verdict,
            "raw_status": raw_status,
            "exec_time": exec_result.get("time", 0),
            "memory_usage": exec_result.get("memory", 0),
            "output": exec_result.get("output", ""),
            "error_message": exec_result.get("error", ""),
            "input": tc.input_data,
            "expected_output": expected_output if compares else None,
            "is_hidden": False,
        }

    @classmethod
    def run(
        cls,
        *,
        problem: CodingProblem,
        language: str,
        source_code: str,
        custom_test_cases: Sequence[dict] = (),
        on_progress=None,
    ) -> dict:
        try:
            judge = judge_factory.get_judge(language)
        except ValueError as exc:
            raise TestRunSetupError("unsupported_language") from exc
        except Exception as exc:  # pragma: no cover - safety net
            raise TestRunSetupError("judge_unavailable") from exc

        results = []
        max_exec_time = 0
        max_memory_usage = 0
        final_status = "AC"

        test_cases = cls.build_test_cases(problem, custom_test_cases)
        if on_progress:
            on_progress({"total": len(test_cases), "results": []})
        for tc in test_cases:
            try:
                exec_result = judge.execute(
                    code=source_code,
                    input_data=tc.input_data,
                    expected_output=tc.output_data or "",
                    time_limit=problem.time_limit,
                    memory_limit=problem.memory_limit,
                )
            except Exception:  # pragma: no cover - safety net
                logger.exception("Unexpected judge execution failure")
                exec_result = {
                    "status": "SE",
                    "time": 0,
                    "memory": 0,
                    "output": "",
                    "error": "Judge execution failed.",
                }

            case_result = cls._build_case_result(tc, exec_result)
            results.append(case_result)
            if on_progress:
                on_progress({"total": len(test_cases), "results": [dict(case) for case in results]})

            max_exec_time = max(max_exec_time, case_result["exec_time"])
            max_memory_usage = max(max_memory_usage, case_result["memory_usage"])

            verdict = case_result["status"]
            if verdict not in {"AC", "info"} and final_status == "AC":
                final_status = verdict

            raw_status = case_result["raw_status"]
            if raw_status in HARD_FAILURE_STATUSES:
                break

        for case in results:
            case.pop("raw_status", None)

        return {
            "status": final_status,
            "exec_time": max_exec_time,
            "memory_usage": max_memory_usage,
            "results": results,
        }
