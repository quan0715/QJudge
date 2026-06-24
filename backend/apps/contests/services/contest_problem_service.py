"""Shared helpers for importing bank questions into contests."""

from apps.problems.models import CodingProblem
from apps.problems.services import ProblemService
from apps.question_bank.import_resolver import BankQuestionImportItem, resolve_bank_question_for_import


def _normalize_test_case_weights(cases):
    if not cases:
        return
    raw_weights = [max(0, int(case.get("weight_percent", case.get("score", 0)) or 0)) for case in cases]
    total = sum(raw_weights)
    if total == 100:
        for case, weight in zip(cases, raw_weights):
            case["weight_percent"] = weight
            case["score"] = weight
        return
    if total <= 0:
        base = 100 // len(cases)
        remainder = 100 % len(cases)
        for idx, case in enumerate(cases):
            weight = base + (1 if idx < remainder else 0)
            case["weight_percent"] = weight
            case["score"] = weight
        return

    scaled = [(weight * 100) / total for weight in raw_weights]
    floor_values = [int(value) for value in scaled]
    remainder = 100 - sum(floor_values)
    fractions = sorted(
        enumerate(value - int(value) for value in scaled),
        key=lambda item: item[1],
        reverse=True,
    )
    for idx in range(remainder):
        floor_values[fractions[idx][0]] += 1

    for case, weight in zip(cases, floor_values):
        case["weight_percent"] = weight
        case["score"] = weight


def _test_cases_from_payload(payload: dict) -> list[dict]:
    cases = []
    for idx, raw_case in enumerate(payload.get("test_cases") or []):
        raw = dict(raw_case or {})
        weight = raw.get("weight_percent", raw.get("score", 0))
        try:
            normalized_weight = int(weight)
        except (TypeError, ValueError):
            normalized_weight = 0
        cases.append(
            {
                "input_data": raw.get("input_data", ""),
                "output_data": raw.get("output_data", ""),
                "is_sample": bool(raw.get("is_sample", False)),
                "score": normalized_weight,
                "weight_percent": normalized_weight,
                "order": int(raw.get("order", idx)),
                "is_hidden": bool(raw.get("is_hidden", False)),
            }
        )
    if not cases:
        cases = [
            {
                "input_data": "",
                "output_data": "",
                "is_sample": True,
                "score": 100,
                "weight_percent": 100,
                "order": 0,
                "is_hidden": False,
            }
        ]
    else:
        _normalize_test_case_weights(cases)
    return cases


def _language_configs_from_payload(payload: dict) -> list[dict]:
    configs = []
    for idx, raw_config in enumerate(payload.get("language_configs") or []):
        raw = dict(raw_config or {})
        configs.append(
            {
                "language": raw.get("language", "cpp"),
                "template_code": raw.get("template_code", ""),
                "is_enabled": bool(raw.get("is_enabled", True)),
                "order": int(raw.get("order", idx)),
            }
        )
    return configs


def materialize_problem_from_bank_item(
    *,
    contest,
    bank_item: BankQuestionImportItem,
    user,
    request=None,
) -> CodingProblem:
    """Create a coding execution adapter from an asset-backed bank item."""
    payload = bank_item.payload
    title = bank_item.title or "Imported Problem"
    problem = CodingProblem.objects.create(
        slug=ProblemService.build_slug_from_title(title),
        created_by=user,
        time_limit=int(payload.get("time_limit") or 1000),
        memory_limit=int(payload.get("memory_limit") or 128),
        forbidden_keywords=payload.get("forbidden_keywords") or [],
        required_keywords=payload.get("required_keywords") or [],
        question_asset=bank_item.question_asset,
        question_version=bank_item.question_version,
    )
    ProblemService.replace_related(
        problem,
        test_cases_data=_test_cases_from_payload(payload),
        language_configs_data=_language_configs_from_payload(payload),
    )
    return problem
