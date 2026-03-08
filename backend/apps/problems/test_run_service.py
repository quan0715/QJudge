"""Services for ad-hoc problem test runs."""

from __future__ import annotations

from dataclasses import dataclass

from apps.judge import judge_factory
from apps.problems.models import Problem, TestCase

HARD_FAILURE_STATUSES = {"CE", "SE"}
CUSTOM_FAILURE_STATUSES = {"CE", "RE", "TLE", "MLE", "SE"}


class TestRunSetupError(Exception):
    """Raised when the test-run environment cannot be prepared."""


@dataclass(slots=True)
class CustomTestRunCase:
    """In-memory custom case that matches the TestCase interface we need."""

    input_data: str
    order: int
    output_data: str = ""
    is_hidden: bool = False

    @property
    def id(self) -> str:
        return f"custom_{self.order}"


class ProblemTestRunService:
    """Runs sample/custom test cases without creating submissions."""

    @staticmethod
    def _build_test_cases(
        problem: Problem,
        *,
        use_samples: bool,
        custom_test_cases: list[dict],
    ) -> list[TestCase | CustomTestRunCase]:
        test_cases: list[TestCase | CustomTestRunCase] = []
        if use_samples:
            test_cases.extend(list(problem.test_cases.filter(is_sample=True)))

        test_cases.extend(
            CustomTestRunCase(input_data=case["input"], order=idx + 1)
            for idx, case in enumerate(custom_test_cases)
        )
        return test_cases

    @staticmethod
    def _build_case_result(tc, exec_result: dict, *, is_sample: bool) -> dict:
        raw_status = exec_result.get("status", "SE")
        expected_output = getattr(tc, "output_data", "") or ""

        if is_sample:
            verdict = raw_status
            visible_expected = expected_output
        else:
            verdict = raw_status if raw_status in CUSTOM_FAILURE_STATUSES else "info"
            visible_expected = None

        return {
            "case_id": getattr(tc, "id", None),
            "source": "sample" if is_sample else "custom",
            "status": verdict,
            "raw_status": raw_status,
            "exec_time": exec_result.get("time", 0),
            "memory_usage": exec_result.get("memory", 0),
            "output": exec_result.get("output", ""),
            "error_message": exec_result.get("error", ""),
            "input": tc.input_data,
            "expected_output": visible_expected,
            "is_hidden": getattr(tc, "is_hidden", False) if is_sample else False,
        }

    @classmethod
    def run(
        cls,
        *,
        problem: Problem,
        language: str,
        source_code: str,
        use_samples: bool,
        custom_test_cases: list[dict],
    ) -> dict:
        try:
            judge = judge_factory.get_judge(language)
        except ValueError as exc:
            raise TestRunSetupError(str(exc)) from exc
        except Exception as exc:  # pragma: no cover - safety net
            raise TestRunSetupError(f"Judge system error: {exc}") from exc

        results = []
        max_exec_time = 0
        max_memory_usage = 0
        final_status = "AC"

        for tc in cls._build_test_cases(
            problem,
            use_samples=use_samples,
            custom_test_cases=custom_test_cases,
        ):
            try:
                exec_result = judge.execute(
                    code=source_code,
                    input_data=tc.input_data,
                    expected_output=getattr(tc, "output_data", "") or "",
                    time_limit=problem.time_limit,
                    memory_limit=problem.memory_limit,
                )
            except Exception as exc:  # pragma: no cover - safety net
                exec_result = {
                    "status": "SE",
                    "time": 0,
                    "memory": 0,
                    "output": "",
                    "error": str(exc),
                }

            is_sample = isinstance(tc, TestCase)
            case_result = cls._build_case_result(tc, exec_result, is_sample=is_sample)
            results.append(case_result)

            max_exec_time = max(max_exec_time, case_result["exec_time"])
            max_memory_usage = max(max_memory_usage, case_result["memory_usage"])

            verdict = case_result["status"]
            raw_status = case_result["raw_status"]
            if verdict not in {"AC", "info"} and final_status == "AC":
                final_status = verdict
            if verdict == "info" and final_status == "AC" and raw_status in CUSTOM_FAILURE_STATUSES:
                final_status = raw_status

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
