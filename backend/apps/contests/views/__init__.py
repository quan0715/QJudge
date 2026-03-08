"""
Contest views package.
Re-exports all ViewSets so that urls.py import path stays unchanged.
"""
from .contest import ContestViewSet
from .clarification import ClarificationViewSet
from .announcement import ContestAnnouncementViewSet
from .problem import ContestProblemViewSet
from .exam_question import ContestExamQuestionViewSet
from .activity import ContestActivityViewSet
from .exam_answer import ExamAnswerViewSet
from .exam_lifecycle import ExamViewSet

__all__ = [
    "ContestViewSet",
    "ClarificationViewSet",
    "ContestAnnouncementViewSet",
    "ContestProblemViewSet",
    "ContestExamQuestionViewSet",
    "ContestActivityViewSet",
    "ExamAnswerViewSet",
    "ExamViewSet",
]
