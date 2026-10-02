"""
Contest views package.
Re-exports all ViewSets so that urls.py import path stays unchanged.
"""
from .contest import ContestViewSet
from .grade_appeal import GradeAppealViewSet
from .announcement import ContestAnnouncementViewSet
from .problem import ContestProblemViewSet
from .exam_question import ContestExamQuestionViewSet
from .exam_paper import ContestExamPaperViewSet
from .activity import ContestActivityViewSet
from .exam_answer import ExamAnswerViewSet
from .exam_lifecycle import ExamViewSet

__all__ = [
    "ContestViewSet",
    "GradeAppealViewSet",
    "ContestAnnouncementViewSet",
    "ContestProblemViewSet",
    "ContestExamQuestionViewSet",
    "ContestExamPaperViewSet",
    "ContestActivityViewSet",
    "ExamAnswerViewSet",
    "ExamViewSet",
]
