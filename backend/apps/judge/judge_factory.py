"""Judge factory — returns an IOJudge for the requested language."""
from .io_judge import IOJudge, SUPPORTED_LANGUAGES


def get_judge(language: str) -> IOJudge:
    """
    Return an IOJudge configured for *language*.

    Raises ValueError for unsupported languages so callers can surface SE.
    """
    return IOJudge(language)


def get_supported_languages() -> list[dict]:
    """Return the list of supported language descriptors."""
    return SUPPORTED_LANGUAGES
