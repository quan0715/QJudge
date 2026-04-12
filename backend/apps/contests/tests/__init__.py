"""Contest test utilities."""
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset


def bind_problem_to_contest(contest, problem, order=0, score=None):
    """
    Create a ContestQuestionBinding for a coding problem in a contest.
    Ensures the problem has a question_asset (creates one if missing).
    Returns the binding.
    """
    from apps.question_bank.question_assets import ensure_problem_question_asset
    from django.db.models import Sum

    if not problem.question_asset_id:
        ensure_problem_question_asset(
            problem=problem,
            actor=problem.created_by or contest.owner,
        )
        problem.refresh_from_db(fields=["question_asset", "question_version"])

    if score is None:
        score = max(1, int(problem.test_cases.aggregate(total=Sum('score'))['total'] or 100))

    return ContestQuestionBinding.objects.create(
        contest=contest,
        question_asset=problem.question_asset,
        question_version=problem.question_version,
        coding_problem=problem,
        binding_type=QuestionAsset.AssetType.CODING,
        order=order,
        score=score,
        source_mode="manual",
    )
