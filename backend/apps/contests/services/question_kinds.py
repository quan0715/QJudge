"""Question kinds shared by the exam question list and the result dashboard."""
from ..models import ExamQuestionType

OBJECTIVE_QUESTION_TYPES = frozenset({
    ExamQuestionType.TRUE_FALSE,
    ExamQuestionType.SINGLE_CHOICE,
    ExamQuestionType.MULTIPLE_CHOICE,
})
SUBJECTIVE_QUESTION_TYPES = frozenset({
    ExamQuestionType.SHORT_ANSWER,
    ExamQuestionType.ESSAY,
})
_ALIASES = {'objective': OBJECTIVE_QUESTION_TYPES, 'subjective': SUBJECTIVE_QUESTION_TYPES}


def parse_kind_filter(raw):
    """Translate ``?kind=<alias|csv of types>`` into a set of question types.

    Returns ``None`` when there is no filter; unknown tokens are ignored, so an
    unknown value gives an empty set (no matches).
    """
    tokens = {token.strip() for token in (raw or '').split(',') if token.strip()}
    if not tokens:
        return None
    kinds = set()
    for token in tokens:
        if token in _ALIASES:
            kinds |= _ALIASES[token]
        elif token in ExamQuestionType.values:
            kinds.add(token)
    return kinds
