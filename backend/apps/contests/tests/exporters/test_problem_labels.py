"""Problem labels remain consistent in API bindings and exported headers."""
import csv
import io
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from apps.question_bank.models import ContestQuestionBinding
from apps.question_bank.problem_labels import label_for_contest_problem_order
from apps.contests.services.export_service import build_contest_results_csv_response
from apps.contests.exporters.data_service import ContestDataService


@pytest.mark.parametrize("order, expected", [
    (0, "A"), (1, "B"), (25, "Z"), (26, "AA"), (27, "AB"),
    (51, "AZ"), (52, "BA"), (701, "ZZ"), (702, "AAA"),
])
def test_binding_and_export_labels(order, expected):
    binding = ContestQuestionBinding(order=order)
    service = ContestDataService(SimpleNamespace())
    assert label_for_contest_problem_order(order) == expected
    assert binding.label == expected
    assert service._get_label(binding) == expected
    assert service._get_label(SimpleNamespace(label="", order=order)) == expected


@pytest.mark.parametrize("include_label", [True, False])
def test_csv_headers_continue_after_z(include_label):
    orders = [25, 26, 27, 51, 52, 701, 702]
    problems = []
    for order in orders:
        problem = {"order": order, "title": "Example"}
        if include_label:
            problem["label"] = ContestQuestionBinding(order=order).label
        problems.append(problem)
    with patch("apps.contests.services.export_service._get_admin_user_ids", return_value=set()):
        response = build_contest_results_csv_response(
            SimpleNamespace(id=1), SimpleNamespace(problems=problems, standings=[]),
        )
    header = next(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert header[7:] == [f"{label} (Example)" for label in ["Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]]
