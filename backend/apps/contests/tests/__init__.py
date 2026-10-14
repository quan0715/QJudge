"""Contest test utilities."""
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset


def bind_problem_to_contest(contest, problem, order=0, score=100):
    """
    Create a ContestQuestionBinding for a coding problem in a contest.
    Ensures the problem has a question_asset (creates one if missing).
    Returns the binding.
    """
    from apps.question_bank.question_assets import ensure_problem_question_asset

    if not problem.question_asset_id:
        ensure_problem_question_asset(
            problem=problem,
            actor=problem.created_by or contest.owner,
        )
        problem.refresh_from_db(fields=["question_asset"])


    return ContestQuestionBinding.objects.create(
        contest=contest,
        question_asset=problem.question_asset,
        coding_problem=problem,
        binding_type=QuestionAsset.AssetType.CODING,
        order=order,
        score=score,
        source_mode="manual",
    )
