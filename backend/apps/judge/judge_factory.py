"""Judge factory — returns an IOJudge for the requested language."""
from .io_judge import IOJudge, SUPPORTED_LANGUAGES, resolve_language, _LANG_SPECS


def get_judge(language: str) -> IOJudge:
    """
    Return an IOJudge configured for *language*.

    Raises ValueError for unsupported languages so callers can surface SE.
    """
    canon = resolve_language(language)
    if canon not in _LANG_SPECS:
        supported = ", ".join(sorted(_LANG_SPECS))
        raise ValueError(
            f"Unsupported language: '{language}'. Supported: {supported}"
        )
    return IOJudge(canon)


def get_supported_languages() -> list[dict]:
    """Return the list of supported language descriptors."""
    return SUPPORTED_LANGUAGES
