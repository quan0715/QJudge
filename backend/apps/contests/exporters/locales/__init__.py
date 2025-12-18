"""
i18n localization for contest exporters.
Provides centralized label management for multiple languages.
"""
from typing import Dict, Set

from .zh_tw import LABELS as ZH_TW_LABELS
from .en_us import LABELS as EN_US_LABELS


_LABEL_REGISTRY: Dict[str, Dict[str, str]] = {
    'zh-TW': ZH_TW_LABELS,
    'zh': ZH_TW_LABELS,  # alias
    'en': EN_US_LABELS,
    'en-US': EN_US_LABELS,
}

# All required keys (for testing coverage)
REQUIRED_KEYS: Set[str] = {
    # Score related
    'score', 'total_score', 'solved', 'rank', 'submissions', 'ac_rate',
    'final_rank', 'current_rank',

    # Problem related
    'description', 'input_description', 'output_description', 'hint',
    'sample_cases', 'example', 'input', 'output', 'empty',

    # Difficulty
    'difficulty', 'easy', 'medium', 'hard',

    # Status
    'ac', 'wa', 'tle', 'mle', 're', 'ce', 'pending', 'judging',
    'not_attempted', 'partial',

    # Contest
    'contest_rules', 'problem_structure', 'exam_time', 'duration',
    'time_limit', 'memory_limit', 'start_time', 'end_time',

    # Report
    'personal_report', 'student', 'generated', 'problem_status',
    'difficulty_stats', 'submission_timeline', 'cumulative_solved',
    'problem_details', 'accepted_code', 'best_submission', 'last_submission',
    'problems_label', 'score_label', 'tries_label',

    # Misc
    'no_description', 'no_rules', 'time_format', 'problems',

    # Chart labels
    'no_submissions', 'failed',

    # Anti-cheat
    'qjudge_anti_cheat_title', 'qjudge_anti_cheat_desc', 'qjudge_anti_cheat_warning',

    # OJ environment
    'oj_environment', 'compiler', 'compile_command', 'io_instruction', 'grading',
}


def get_labels(language: str) -> Dict[str, str]:
    """
    Get label dictionary for the specified language.

    Args:
        language: Language code (e.g., 'zh-TW', 'en-US', 'zh', 'en')

    Returns:
        Dictionary mapping label keys to localized strings
    """
    # Try exact match
    if language in _LABEL_REGISTRY:
        return _LABEL_REGISTRY[language]

    # Try language prefix match
    prefix = language.split('-')[0].lower()
    if prefix in _LABEL_REGISTRY:
        return _LABEL_REGISTRY[prefix]

    # Default to English
    return EN_US_LABELS


def validate_labels(labels: Dict[str, str]) -> list:
    """
    Validate that a labels dictionary contains all required keys.

    Args:
        labels: Dictionary of label key-value pairs

    Returns:
        List of missing keys (empty if all keys present)
    """
    missing = REQUIRED_KEYS - set(labels.keys())
    return list(missing)


def is_chinese(language: str) -> bool:
    """Check if language code is Chinese."""
    return language.startswith('zh')
