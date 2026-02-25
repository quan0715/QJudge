"""Pending action execution for AI-assisted create/patch flows."""

from __future__ import annotations

import jsonpatch

from apps.problems.models import Problem, ProblemTranslation, TestCase

PROBLEM_FIELDS = {"title", "difficulty", "time_limit", "memory_limit"}
TRANSLATION_FIELDS = {"title", "description", "input_description", "output_description", "hint"}


def execute_create_action(action_obj):
    """Create problem and translations from canonical payload."""
    payload = action_obj.payload or {}

    translations_data = payload.get("translations")
    if not isinstance(translations_data, list) or not translations_data:
        raise ValueError("payload.translations is required and must be a non-empty list")

    problem = Problem.objects.create(
        title=payload.get("title", "Untitled"),
        difficulty=payload.get("difficulty", "medium"),
        time_limit=payload.get("time_limit", 1000),
        memory_limit=payload.get("memory_limit", 128),
        created_by=action_obj.user,
    )

    for t in translations_data:
        ProblemTranslation.objects.create(
            problem=problem,
            language=t.get("language", "zh-TW"),
            title=t.get("title", payload.get("title", "Untitled")),
            description=t.get("description", ""),
            input_description=t.get("input_description", ""),
            output_description=t.get("output_description", ""),
            hint=t.get("hint", ""),
        )

    test_cases_data = payload.get("test_cases", [])
    sample_cases_data = payload.get("sample_test_cases", [])
    all_tc = test_cases_data or sample_cases_data
    if all_tc and isinstance(all_tc, list):
        is_from_full = bool(test_cases_data)
        for idx, tc in enumerate(all_tc):
            TestCase.objects.create(
                problem=problem,
                input_data=tc.get("input", tc.get("input_data", "")),
                output_data=tc.get("output", tc.get("output_data", "")),
                is_sample=tc.get("is_sample", True) if is_from_full else True,
                is_hidden=tc.get("is_hidden", False) if is_from_full else False,
                score=tc.get("score", 0),
                order=tc.get("order", idx),
            )

    return problem


def execute_patch_action(action_obj):
    """Apply RFC6902 JSON patch to problem with canonical translation paths only."""
    problem = Problem.objects.select_for_update().get(id=action_obj.target_problem_id)
    existing_translations = list(
        ProblemTranslation.objects
        .select_for_update()
        .filter(problem=problem)
        .order_by("language")
    )

    current_doc = {
        "title": problem.title,
        "difficulty": problem.difficulty,
        "time_limit": problem.time_limit,
        "memory_limit": problem.memory_limit,
        "translations": [
            {
                "language": t.language,
                "title": t.title,
                "description": t.description,
                "input_description": t.input_description,
                "output_description": t.output_description,
                "hint": t.hint,
            }
            for t in existing_translations
        ],
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

    problem_changed = False
    for key in PROBLEM_FIELDS:
        new_val = patched_doc.get(key)
        if new_val is not None and getattr(problem, key, None) != new_val:
            setattr(problem, key, new_val)
            problem_changed = True
    if problem_changed:
        problem.save()

    patched_translations = patched_doc.get("translations")
    if patched_translations is not None and isinstance(patched_translations, list):
        existing_by_lang = {t.language: t for t in existing_translations}
        seen_langs = set()

        for t_data in patched_translations:
            lang = t_data.get("language", "zh-TW")
            seen_langs.add(lang)
            db_trans = existing_by_lang.get(lang)

            if db_trans:
                changed = False
                for key in TRANSLATION_FIELDS:
                    new_val = t_data.get(key)
                    if new_val is not None and getattr(db_trans, key, None) != new_val:
                        setattr(db_trans, key, new_val)
                        changed = True
                if changed:
                    db_trans.save()
            else:
                ProblemTranslation.objects.create(
                    problem=problem,
                    language=lang,
                    title=t_data.get("title", problem.title),
                    description=t_data.get("description", ""),
                    input_description=t_data.get("input_description", ""),
                    output_description=t_data.get("output_description", ""),
                    hint=t_data.get("hint", ""),
                )

        stale_langs = set(existing_by_lang.keys()) - seen_langs
        if stale_langs:
            ProblemTranslation.objects.filter(problem=problem, language__in=stale_langs).delete()

    new_all_cases = patched_doc.get("test_cases")
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

    return problem
