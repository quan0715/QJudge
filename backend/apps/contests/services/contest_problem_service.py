"""Shared helpers for importing bank questions into contests."""
from uuid import UUID

from rest_framework.exceptions import (
    NotFound,
    PermissionDenied,
    ValidationError as DRFValidationError,
)

from apps.problems.serializers import ProblemAdminSerializer
from apps.question_bank.models import (
    Question,
    QuestionBank,
    QuestionBankMembership,
)
from apps.question_bank.bank_workflows import is_publicly_accessible_bank
from apps.question_bank.question_assets import ensure_question_asset_for_bank_question
from apps.question_bank.write_workflows import (
    materialize_bank_question_adapter_for_membership,
)


def resolve_bank_question_for_import(*, user, question_bank_id, question_id):
    """Resolve a bank question for import.

    Returns ``(bank, question)`` on success.
    Raises DRF exceptions on error instead of returning a ``Response``.
    """
    try:
        normalized_bank_uuid = str(UUID(str(question_bank_id)))
    except (TypeError, ValueError):
        raise DRFValidationError({"question_bank_id": "Must be a valid UUID."})

    bank = QuestionBank.objects.filter(uuid=normalized_bank_uuid, is_archived=False).first()
    if not bank:
        raise NotFound("Question bank not found")

    if bank.owner_id != user.id and not is_publicly_accessible_bank(bank):
        raise PermissionDenied("No access to this question bank")

    try:
        normalized_question_uuid = str(UUID(str(question_id)))
    except (TypeError, ValueError):
        raise DRFValidationError({"question_id": "Must be a valid UUID."})

    membership = (
        QuestionBankMembership.objects.filter(
            bank=bank, id=normalized_question_uuid,
        )
        .select_related("question_asset", "question_asset__latest_version", "legacy_question")
        .first()
    )

    if membership:
        if membership.legacy_question_id:
            question = membership.legacy_question
        else:
            question = materialize_bank_question_adapter_for_membership(
                membership=membership, actor=user,
            )
    else:
        question = Question.objects.filter(bank=bank, id=normalized_question_uuid).first()

    if not question:
        raise NotFound("Question not found in bank")

    if question.question_type != Question.QuestionType.CODING:
        raise DRFValidationError("Only coding bank questions can be imported here")

    return bank, question


def materialize_problem_from_bank_question(*, contest, question, user, request=None):
    """Create a Problem from a bank Question's coding extension data.

    ``request`` is optional; when provided it is passed as serializer context.
    """

    def _normalize_weights(cases):
        if not cases:
            return
        raw_weights = [max(0, int(case.get('weight_percent', 0) or 0)) for case in cases]
        total = sum(raw_weights)
        if total == 100:
            return
        if total <= 0:
            base = 100 // len(cases)
            remainder = 100 % len(cases)
            for idx, case in enumerate(cases):
                weight = base + (1 if idx < remainder else 0)
                case['weight_percent'] = weight
                case['score'] = weight
            return

        scaled = []
        for weight in raw_weights:
            scaled.append((weight * 100) / total)
        floor_values = [int(value) for value in scaled]
        remainder = 100 - sum(floor_values)
        fractions = sorted(
            enumerate(value - int(value) for value in scaled),
            key=lambda item: item[1],
            reverse=True,
        )
        for idx in range(remainder):
            floor_values[fractions[idx][0]] += 1

        for idx, case in enumerate(cases):
            case['weight_percent'] = floor_values[idx]
            case['score'] = floor_values[idx]

    coding_ext = getattr(question, "coding_ext", None)
    translations = []
    test_cases = []
    language_configs = []
    forbidden_keywords = []
    required_keywords = []

    if coding_ext:
        translations = coding_ext.translations or []
        for idx, raw_tc in enumerate(coding_ext.test_cases or []):
            tc = dict(raw_tc or {})
            weight_percent = tc.get('weight_percent')
            if weight_percent is None:
                weight_percent = tc.get('score', 0)
            try:
                normalized_weight = int(weight_percent)
            except (TypeError, ValueError):
                normalized_weight = 0
            test_cases.append(
                {
                    'input_data': tc.get('input_data', ''),
                    'output_data': tc.get('output_data', ''),
                    'is_sample': bool(tc.get('is_sample', False)),
                    'score': normalized_weight,
                    'weight_percent': normalized_weight,
                    'order': int(tc.get('order', idx)),
                    'is_hidden': bool(tc.get('is_hidden', False)),
                }
            )
        language_configs = coding_ext.language_configs or []
        forbidden_keywords = coding_ext.forbidden_keywords or []
        required_keywords = coding_ext.required_keywords or []

    if not translations:
        translations = [
            {
                'language': 'zh-TW',
                'title': question.title or 'Imported Problem',
                'description': question.prompt or '',
                'input_description': '',
                'output_description': '',
                'hint': '',
            }
        ]

    if not test_cases:
        test_cases = [
            {
                'input_data': '',
                'output_data': '',
                'is_sample': True,
                'score': 100,
                'weight_percent': 100,
                'order': 0,
                'is_hidden': False,
            }
        ]
    else:
        _normalize_weights(test_cases)

    payload = {
        'title': question.title or 'Imported Problem',
        'difficulty': question.difficulty or 'medium',
        'time_limit': question.time_limit or 1000,
        'memory_limit': question.memory_limit or 128,
        'translations': translations,
        'test_cases': test_cases,
        'language_configs': language_configs,
        'forbidden_keywords': forbidden_keywords,
        'required_keywords': required_keywords,
    }

    context = {'request': request} if request else {}
    serializer = ProblemAdminSerializer(data=payload, context=context)
    serializer.is_valid(raise_exception=True)
    problem = serializer.save(created_by=user)

    question_asset, question_version = ensure_question_asset_for_bank_question(
        question=question,
        actor=user,
    )
    problem.question_asset = question_asset
    problem.question_version = question_version
    problem.save(update_fields=['question_asset', 'question_version', 'updated_at'])
    return problem
