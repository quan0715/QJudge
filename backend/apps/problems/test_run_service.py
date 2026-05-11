"""Services for ad-hoc problem test runs."""

from __future__ import annotations

from apps.judge import judge_factory
from apps.problems.models import CodingProblem, TestCase

HARD_FAILURE_STATUSES = {"CE", "SE"}


class TestRunSetupError(Exception):
    """Raised when the test-run environment cannot be prepared."""


class ProblemTestRunService:
    """Runs all stored test cases without creating submissions."""

    @staticmethod
    def _build_test_cases(problem: CodingProblem) -> list[TestCase]:
        return list(problem.test_cases.all())

    @staticmethod
    def _build_case_result(tc: TestCase, exec_result: dict) -> dict:
        raw_status = exec_result.get("status", "SE")
        expected_output = getattr(tc, "output_data", "") or ""

        return {
            "case_id": getattr(tc, "id", None),
            "source": "test_case",
            "status": raw_status,
            "raw_status": raw_status,
            "exec_time": exec_result.get("time", 0),
            "memory_usage": exec_result.get("memory", 0),
            "output": exec_result.get("output", ""),
            "error_message": exec_result.get("error", ""),
            "input": tc.input_data,
            "expected_output": expected_output,
            "is_hidden": getattr(tc, "is_hidden", False),
        }

    @classmethod
    def run(
        cls,
        *,
        problem: CodingProblem,
        language: str,
        source_code: str,
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

        for tc in cls._build_test_cases(problem):
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

            case_result = cls._build_case_result(tc, exec_result)
            results.append(case_result)

            max_exec_time = max(max_exec_time, case_result["exec_time"])
            max_memory_usage = max(max_memory_usage, case_result["memory_usage"])

            verdict = case_result["status"]
            if verdict != "AC" and final_status == "AC":
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
