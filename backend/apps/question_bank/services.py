"""
Services for question-bank sync and cloning.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from uuid import UUID

from django.db.models import Q, Sum

from apps.contests.models import ExamQuestion, ExamQuestionType
from apps.problems.models import Problem

from .models import QuestionBank, Question, QuestionCodingExt

PLATFORM_BANK_FILTER = (
    Q(owner__isnull=True)
    | Q(owner__is_staff=True)
    | Q(owner__role="admin")
)


@dataclass
class ExamReconstructibilityResult:
    is_reconstructible: bool
    reason: str = ""


def get_my_bank_default_name(category: str) -> str:
    if category == QuestionBank.Category.EXAM:
        return "我的考卷題庫"
    return "我的程式題庫"


def get_or_create_personal_bank(
    user,
    category: str,
    target_bank_uuid: UUID | str | None = None,
) -> QuestionBank:
    if target_bank_uuid is not None:
        bank = QuestionBank.objects.filter(
            uuid=target_bank_uuid,
            owner=user,
            is_archived=False,
        ).first()
        if not bank:
            raise ValueError("Target bank not found")
        if bank.category != category:
            raise ValueError("Target bank category mismatch")
        return bank

    bank, _ = QuestionBank.objects.get_or_create(
        owner=user,
        category=category,
        is_archived=False,
        defaults={
            "name": get_my_bank_default_name(category),
            "visibility": QuestionBank.Visibility.PRIVATE,
            "verified": False,
        },
    )
    return bank


def _pick_problem_translation(problem: Problem):
    translation = problem.translations.filter(language__in=["zh-TW", "zh-hant", "zh-Hant"]).first()
    if translation:
        return translation
    return problem.translations.first()


def _build_coding_ext_payload(problem: Problem) -> dict[str, Any]:
    return {
        "translations": list(
            problem.translations.values(
                "language",
                "title",
                "description",
                "input_description",
                "output_description",
                "hint",
            )
        ),
        "test_cases": list(
            problem.test_cases.values(
                "input_data",
                "output_data",
                "is_sample",
                "score",
                "order",
                "is_hidden",
            )
        ),
        "language_configs": list(
            problem.language_configs.values(
                "language",
                "template_code",
                "is_enabled",
                "order",
            )
        ),
        "forbidden_keywords": problem.forbidden_keywords or [],
        "required_keywords": problem.required_keywords or [],
    }


def upsert_problem_into_bank(problem: Problem, bank: QuestionBank, created_by=None) -> Question:
    translation = _pick_problem_translation(problem)
    title = (translation.title if translation else problem.title) or problem.title
    prompt = (translation.description if translation else "") or ""

    score_sum = problem.test_cases.aggregate(total=Sum("score")).get("total") or 100

    defaults = {
        "question_type": Question.QuestionType.CODING,
        "title": title,
        "prompt": prompt,
        "score": int(score_sum),
        "difficulty": problem.difficulty or "medium",
        "time_limit": problem.time_limit,
        "memory_limit": problem.memory_limit,
        "created_by": created_by or problem.created_by,
        "metadata": {
            "legacy_problem_id": problem.id,
            "display_id": problem.display_id,
            "visibility": problem.visibility,
        },
    }

    question, created = Question.objects.get_or_create(
        bank=bank,
        source_problem=problem,
        defaults=defaults,
    )
    if not created:
        for field, value in defaults.items():
            setattr(question, field, value)
        question.save(update_fields=list(defaults.keys()) + ["updated_at"])

    coding_payload = _build_coding_ext_payload(problem)
    QuestionCodingExt.objects.update_or_create(
        question=question,
        defaults=coding_payload,
    )
    return question


def sync_problem_to_question_bank(problem: Problem, actor=None) -> Question | None:
    owner = problem.created_by or actor
    if owner is None:
        return None

    bank, _ = QuestionBank.objects.get_or_create(
        owner=owner,
        category=QuestionBank.Category.CODING,
        is_archived=False,
        defaults={
            "name": get_my_bank_default_name(QuestionBank.Category.CODING),
            "visibility": QuestionBank.Visibility.PRIVATE,
            "verified": False,
        },
    )
    return upsert_problem_into_bank(problem=problem, bank=bank, created_by=owner)


def _build_exam_question_title(exam_question: ExamQuestion) -> str:
    order = exam_question.order if exam_question.order is not None else 0
    contest_name = exam_question.contest.name or "Exam"
    return f"{contest_name} - Q{order + 1}"


def upsert_exam_question_into_bank(
    exam_question: ExamQuestion,
    bank: QuestionBank,
    created_by=None,
) -> Question:
    defaults = {
        "question_type": Question.QuestionType.EXAM,
        "title": _build_exam_question_title(exam_question),
        "prompt": exam_question.prompt,
        "options": exam_question.options or [],
        "correct_answer": exam_question.correct_answer,
        "score": exam_question.score,
        "order": exam_question.order,
        "created_by": created_by or exam_question.contest.owner,
        "metadata": {
            "legacy_exam_question_id": exam_question.id,
            "legacy_contest_id": exam_question.contest_id,
            "legacy_question_type": exam_question.question_type,
        },
    }

    question, created = Question.objects.get_or_create(
        bank=bank,
        source_exam_question=exam_question,
        defaults=defaults,
    )
    if not created:
        for field, value in defaults.items():
            setattr(question, field, value)
        question.save(update_fields=list(defaults.keys()) + ["updated_at"])
    return question


def sync_exam_question_to_question_bank(exam_question: ExamQuestion, actor=None) -> Question | None:
    owner = actor or exam_question.contest.owner
    if owner is None:
        return None

    bank, _ = QuestionBank.objects.get_or_create(
        owner=owner,
        category=QuestionBank.Category.EXAM,
        is_archived=False,
        defaults={
            "name": get_my_bank_default_name(QuestionBank.Category.EXAM),
            "visibility": QuestionBank.Visibility.PRIVATE,
            "verified": False,
        },
    )

    return upsert_exam_question_into_bank(
        exam_question=exam_question,
        bank=bank,
        created_by=owner,
    )


def clone_question_to_bank(source_question: Question, target_bank: QuestionBank, user) -> Question:
    cloned = Question.objects.create(
        bank=target_bank,
        question_type=source_question.question_type,
        title=source_question.title,
        prompt=source_question.prompt,
        options=source_question.options,
        correct_answer=source_question.correct_answer,
        score=source_question.score,
        order=target_bank.questions.count(),
        difficulty=source_question.difficulty,
        time_limit=source_question.time_limit,
        memory_limit=source_question.memory_limit,
        created_by=user,
        metadata={
            **(source_question.metadata or {}),
            "cloned_from_question_id": source_question.id,
            "cloned_from_bank_id": str(source_question.bank.uuid),
            "cloned_from_bank_pk": source_question.bank_id,
        },
    )

    if source_question.question_type == Question.QuestionType.CODING and hasattr(source_question, "coding_ext"):
        ext = source_question.coding_ext
        QuestionCodingExt.objects.create(
            question=cloned,
            translations=ext.translations,
            test_cases=ext.test_cases,
            language_configs=ext.language_configs,
            forbidden_keywords=ext.forbidden_keywords,
            required_keywords=ext.required_keywords,
        )
    return cloned


def is_platform_public_bank(bank: QuestionBank) -> bool:
    if bank.visibility != QuestionBank.Visibility.PUBLIC or not bank.verified or bank.is_archived:
        return False
    if bank.owner_id is None:
        return True
    return bool(bank.owner.is_staff or getattr(bank.owner, "role", None) == "admin")


def validate_exam_question_reconstructibility(exam_question: ExamQuestion) -> ExamReconstructibilityResult:
    if not exam_question.prompt or not exam_question.prompt.strip():
        return ExamReconstructibilityResult(False, "prompt is empty")

    if exam_question.question_type in {
        ExamQuestionType.TRUE_FALSE,
        ExamQuestionType.SINGLE_CHOICE,
        ExamQuestionType.MULTIPLE_CHOICE,
    }:
        if not isinstance(exam_question.options, list) or len(exam_question.options) == 0:
            return ExamReconstructibilityResult(False, "choice question options are missing")
        if exam_question.correct_answer in (None, "", []):
            return ExamReconstructibilityResult(False, "choice question correct_answer is missing")

    return ExamReconstructibilityResult(True)
