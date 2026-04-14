"""Pending action execution for AI-assisted create/patch flows."""

from __future__ import annotations

import uuid

import jsonpatch
from django.utils.text import slugify

from apps.problems.models import Problem, TestCase
from apps.problems.services import ProblemService

PROBLEM_EXECUTION_FIELDS = {"time_limit", "memory_limit"}
CONTENT_FIELDS = {"description", "input_description", "output_description", "hint"}


def execute_create_action(action_obj):
    """Create problem from canonical payload via ProblemService."""
    payload = action_obj.payload or {}

    # Read content fields (flat format preferred, legacy translations[] as fallback)
    content_fields = {}
    translations_data = payload.get("translations")
    if isinstance(translations_data, list) and translations_data:
        # Legacy format: extract from translations[0]
        t = translations_data[0] if isinstance(translations_data[0], dict) else {}
        content_fields = {
            "description": t.get("description", ""),
            "input_description": t.get("input_description", ""),
            "output_description": t.get("output_description", ""),
            "hint": t.get("hint", ""),
        }
    elif payload.get("description") or payload.get("title"):
        # Flat format
        content_fields = {
            "description": payload.get("description", ""),
            "input_description": payload.get("input_description", ""),
            "output_description": payload.get("output_description", ""),
            "hint": payload.get("hint", ""),
        }
    else:
        raise ValueError("payload must contain description or title fields")

    # Generate unique slug from title
    title = payload.get("title", "Untitled")
    base_slug = slugify(title, allow_unicode=True) or f"problem-{uuid.uuid4().hex[:8]}"
    slug = base_slug
    counter = 1
    while Problem.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1

    test_cases_data = payload.get("test_cases", [])
    sample_cases_data = payload.get("sample_test_cases", [])
    all_tc = test_cases_data or sample_cases_data
    tc_list = []
    if all_tc and isinstance(all_tc, list):
        is_from_full = bool(test_cases_data)
        for idx, tc in enumerate(all_tc):
            tc_list.append({
                "input_data": tc.get("input", tc.get("input_data", "")),
                "output_data": tc.get("output", tc.get("output_data", "")),
                "is_sample": tc.get("is_sample", True) if is_from_full else True,
                "is_hidden": tc.get("is_hidden", False) if is_from_full else False,
                "score": tc.get("score", 0),
                "order": tc.get("order", idx),
            })

    problem = ProblemService.create_problem_adapter(
        validated_data={
            "title": title,
            "slug": slug,
            "difficulty": payload.get("difficulty", "medium"),
            "time_limit": payload.get("time_limit", 1000),
            "memory_limit": payload.get("memory_limit", 128),
            "created_by": action_obj.user,
        },
        content_fields=content_fields,
        test_cases_data=tc_list,
    )

    return problem


def execute_patch_action(action_obj):
    """Apply RFC6902 JSON patch to problem via QuestionAsset."""
    problem = Problem.objects.select_for_update().get(id=action_obj.target_problem_id)

    # Build current doc from QuestionAsset (source of truth)
    current_title = ""
    current_difficulty = "medium"
    current_content = {"description": "", "input_description": "", "output_description": "", "hint": ""}
    if problem.question_asset_id:
        try:
            from apps.question_bank.question_assets import extract_content_from_payload
            asset = problem.question_asset
            current_title = asset.title or ""
            payload = asset.payload or {}
            current_difficulty = payload.get("difficulty", "medium")
            current_content = extract_content_from_payload(payload)
        except Exception:
            pass

    current_doc = {
        "title": current_title,
        "difficulty": current_difficulty,
        "time_limit": problem.time_limit,
        "memory_limit": problem.memory_limit,
        "description": current_content["description"],
        "input_description": current_content["input_description"],
        "output_description": current_content["output_description"],
        "hint": current_content["hint"],
        "sample_test_cases": [
            {"input": tc.input_data, "output": tc.output_data, "order": tc.order}
            for tc in TestCase.objects.filter(problem=problem, is_sample=True).order_by("order")
        ],
        "test_cases": [
            {
                "input": tc.input_data,
                "output": tc.output_data,
                "is_sample": tc.is_sample,
                "is_hidden": tc.is_hidden,
                "score": tc.score,
                "order": tc.order,
            }
            for tc in TestCase.objects.filter(problem=problem).order_by("order")
        ],
    }

    patch_ops = (action_obj.payload or {}).get("json_patch_ops", [])
    patched_doc = jsonpatch.JsonPatch(patch_ops).apply(current_doc)

    # Update execution fields on the problem
    problem_changed = False
    for key in PROBLEM_EXECUTION_FIELDS:
        new_val = patched_doc.get(key)
        if new_val is not None and getattr(problem, key, None) != new_val:
            setattr(problem, key, new_val)
            problem_changed = True
    if problem_changed:
        problem.save()

    # Update test cases
    new_all_cases = patched_doc.get("test_cases")
    tc_list = None
    if new_all_cases is not None and isinstance(new_all_cases, list):
        TestCase.objects.filter(problem=problem).delete()
        for idx, tc in enumerate(new_all_cases):
            TestCase.objects.create(
                problem=problem,
                input_data=tc.get("input", ""),
                output_data=tc.get("output", ""),
                is_sample=tc.get("is_sample", False),
                is_hidden=tc.get("is_hidden", False),
                score=tc.get("score", 0),
                order=tc.get("order", idx),
            )
        tc_list = list(problem.test_cases.values(
            "input_data", "output_data", "is_sample", "score", "weight_percent", "order", "is_hidden",
        ))
    else:
        new_samples = patched_doc.get("sample_test_cases")
        if new_samples is not None and isinstance(new_samples, list):
            TestCase.objects.filter(problem=problem, is_sample=True).delete()
            for idx, tc in enumerate(new_samples):
                TestCase.objects.create(
                    problem=problem,
                    input_data=tc.get("input", ""),
                    output_data=tc.get("output", ""),
                    is_sample=True,
                    order=tc.get("order", idx),
                )
            tc_list = list(problem.test_cases.values(
                "input_data", "output_data", "is_sample", "score", "weight_percent", "order", "is_hidden",
            ))

    # Write content changes to QuestionAsset (source of truth)
    title = patched_doc.get("title", current_title)
    difficulty = patched_doc.get("difficulty", current_difficulty)
    patched_content = {
        "description": patched_doc.get("description", current_content["description"]),
        "input_description": patched_doc.get("input_description", current_content["input_description"]),
        "output_description": patched_doc.get("output_description", current_content["output_description"]),
        "hint": patched_doc.get("hint", current_content["hint"]),
    }

    if problem.question_asset_id:
        from apps.question_bank.question_assets import write_coding_content_to_asset
        owner = problem.created_by
        prompt = patched_content.get("description", "")

        question_asset, question_version = write_coding_content_to_asset(
            owner=owner,
            title=title,
            prompt=prompt,
            difficulty=difficulty,
            content_fields=patched_content,
            time_limit=problem.time_limit,
            memory_limit=problem.memory_limit,
            test_cases=tc_list or list(problem.test_cases.values(
                "input_data", "output_data", "is_sample", "score", "weight_percent", "order", "is_hidden",
            )),
            language_configs=list(problem.language_configs.values(
                "language", "template_code", "is_enabled", "order",
            )),
            forbidden_keywords=problem.forbidden_keywords or [],
            required_keywords=problem.required_keywords or [],
            legacy_problem_id=str(problem.id),
            existing_asset=problem.question_asset,
            actor=owner,
        )
        problem.question_asset = question_asset
        problem.question_version = question_version
        problem.save(update_fields=["question_asset", "question_version"])

    return problem
