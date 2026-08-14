from types import SimpleNamespace
from unittest.mock import patch

import pytest

from apps.problems.test_run_service import (
    ProblemTestRunService,
    TestRunSetupError as RunSetupError,
)


@pytest.mark.parametrize(
    ("failure", "expected_code"),
    [
        (ValueError("unsupported python-secret"), "unsupported_language"),
        (RuntimeError("judge host secret"), "judge_unavailable"),
    ],
)
def test_setup_error_exposes_only_typed_public_code(failure, expected_code):
    with patch(
        "apps.problems.test_run_service.judge_factory.get_judge",
        side_effect=failure,
    ):
        with pytest.raises(RunSetupError) as caught:
            ProblemTestRunService.run(
                problem=SimpleNamespace(),
                language="secret-language",
                source_code="",
            )

    assert caught.value.code == expected_code
    assert str(caught.value) == expected_code
    assert "secret" not in str(caught.value)


def test_unexpected_execution_failure_uses_fixed_public_message():
    judge = SimpleNamespace(execute=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("host secret")))
    test_case = SimpleNamespace(
        id=1,
        input_data="",
        output_data="",
        is_hidden=False,
    )
    problem = SimpleNamespace(
        test_cases=SimpleNamespace(all=lambda: [test_case]),
        time_limit=1,
        memory_limit=64,
    )

    with patch(
        "apps.problems.test_run_service.judge_factory.get_judge",
        return_value=judge,
    ):
        result = ProblemTestRunService.run(
            problem=problem,
            language="python",
            source_code="print(1)",
        )

    assert result["results"][0]["error_message"] == "Judge execution failed."
    assert "secret" not in str(result)
