"""Celery tasks for the problems app.

Judge execution requires Docker access, which only the judge workers hold.
The web process dispatches here instead of talking to Docker itself.
"""
import logging

from celery import shared_task

from .models import CodingProblem
from .test_run_service import ProblemTestRunService, TestRunSetupError

logger = logging.getLogger(__name__)


@shared_task
def run_problem_test_run(problem_id, language, source_code):
    """
    Execute a problem test run inside a judge worker.

    Returns a JSON-serialisable envelope instead of raising, so the caller
    never has to deserialise a remote exception:
    - {"ok": True, "result": {...}}
    - {"ok": False, "code": "unsupported_language" | "judge_unavailable"}
    """
    try:
        problem = CodingProblem.objects.get(id=problem_id)
    except CodingProblem.DoesNotExist:
        logger.warning("Test run requested for missing problem_id=%s", problem_id)
        return {"ok": False, "code": "judge_unavailable"}

    try:
        result = ProblemTestRunService.run(
            problem=problem,
            language=language,
            source_code=source_code,
        )
    except TestRunSetupError as exc:
        return {"ok": False, "code": exc.code}
    except Exception:
        logger.exception("Unexpected test run failure for problem_id=%s", problem_id)
        return {"ok": False, "code": "judge_unavailable"}

    return {"ok": True, "result": result}
