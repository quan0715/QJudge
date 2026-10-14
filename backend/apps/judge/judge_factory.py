"""Judge factory — returns an IOJudge for the requested language."""
from .io_judge import IOJudge


def get_judge(language: str) -> IOJudge:
    """
    Return a new IOJudge for one submission or test run in *language*.

    Use it as a context manager across that submission's cases: they share one
    container and one compilation. Never share an instance across submissions.

    Raises ValueError for unsupported languages so callers can surface SE.
    """
    return IOJudge(language)
