from types import SimpleNamespace
from unittest.mock import patch

import pytest

from apps.problems.test_run_service import (
    ProblemTestRunService,
    TestRunSetupError as RunSetupError,
)


def test_setup_error_exposes_only_typed_public_code():
    with patch(
        "apps.problems.test_run_service.judge_factory.get_judge",
        side_effect=ValueError("unsupported python-secret"),
    ):
        with pytest.raises(RunSetupError) as caught:
            ProblemTestRunService.run(
                problem=SimpleNamespace(),
                language="secret-language",
                source_code="",
            )

    assert caught.value.code == "unsupported_language"
    assert str(caught.value) == "unsupported_language"
    assert "secret" not in str(caught.value)

