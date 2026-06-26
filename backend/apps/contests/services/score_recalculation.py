"""
Score recalculation service for paper-style exams.

DEPRECATED: This module is a thin compatibility shim.
All logic has been consolidated into ``exam_scoring.ExamScoringService``.
Existing call sites that import from here will continue to work.
"""
from ..models import ContestParticipant
from .exam_scoring import ExamScoringService


def recalculate_participant_score(participant: ContestParticipant) -> float:
    """Recalculate a single participant's total score respecting score policies.

    Delegates to ExamScoringService.calculate_participant_score().
    """
    service = ExamScoringService(participant.contest)
    return service.calculate_participant_score(participant)


def recalculate_all_scores(contest) -> int:
    """Recalculate scores for all participants of a contest.

    Delegates to ExamScoringService.recalculate_all().
    """
    service = ExamScoringService(contest)
    return service.recalculate_all()
