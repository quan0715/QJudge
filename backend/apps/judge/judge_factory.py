"""Judge factory — returns an IOJudge for the requested language."""
from .io_judge import IOJudge


def get_judge(language: str) -> IOJudge:
    """
    Return a new IOJudge for one submission or test run in *language*.

    Inside a ``with`` block, pass all of that submission's cases to one ``run``
    call: one container compiles once and runs them all. Never share an
    instance across submissions.

    Raises ValueError for unsupported languages so callers can surface SE.
    """
    return IOJudge(language)
