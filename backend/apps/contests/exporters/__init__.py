"""
Contest exporters package.

This module provides backward-compatible exports from the refactored exporters.
New code should import directly from submodules:
    from apps.contests.exporters.renderers import MarkdownRenderer, PDFRenderer
    from apps.contests.exporters.data_service import ContestDataService
    from apps.contests.exporters.utils import sanitize_filename

Legacy imports are still supported:
    from apps.contests.exporters import MarkdownExporter, PDFExporter
"""

# ============================================================================
# Backward-compatible exports (legacy names)
# ============================================================================

# Renderers with legacy class names
from .renderers.markdown import MarkdownRenderer as MarkdownExporter
from .renderers.pdf import PDFRenderer as PDFExporter
from .renderers.student_report import StudentReportRenderer as StudentReportExporter

# Utility functions
from .utils import (
    sanitize_filename,
    render_markdown,
    inline_markdown,
    preprocess_markdown_html,
    ensure_markdown_lists,
    highlight_code,
    CHART_COLORS,
    get_chart_color,
    generate_donut_chart_svg,
    generate_empty_chart_svg,
    get_carbon_code_styles,
)

# ============================================================================
# New exports (recommended for new code)
# ============================================================================

# Renderers with new names
from .renderers import (
    BaseRenderer,
    MarkdownRenderer,
    PDFRenderer,
    StudentReportRenderer,
)

# Data service
from .data_service import ContestDataService

# DTOs
from .dto import (
    ContestDTO,
    ContestProblemDTO,
    ProblemDTO,
    SampleCaseDTO,
    ParticipantDTO,
    SubmissionDTO,
    StandingsDTO,
    UserStandingDTO,
    ProblemStatsDTO,
    DifficultyStatsDTO,
)

# Localization
from .locales import get_labels, validate_labels, is_chinese, REQUIRED_KEYS

# ============================================================================
# Public API
# ============================================================================

__all__ = [
    # Legacy exports (backward compatibility)
    'MarkdownExporter',
    'PDFExporter',
    'StudentReportExporter',
    'sanitize_filename',
    'render_markdown',
    'inline_markdown',

    # New exports (recommended)
    'BaseRenderer',
    'MarkdownRenderer',
    'PDFRenderer',
    'StudentReportRenderer',
    'ContestDataService',

    # DTOs
    'ContestDTO',
    'ContestProblemDTO',
    'ProblemDTO',
    'SampleCaseDTO',
    'ParticipantDTO',
    'SubmissionDTO',
    'StandingsDTO',
    'UserStandingDTO',
    'ProblemStatsDTO',
    'DifficultyStatsDTO',

    # Localization
    'get_labels',
    'validate_labels',
    'is_chinese',
    'REQUIRED_KEYS',

    # Utils
    'highlight_code',
    'CHART_COLORS',
    'get_chart_color',
    'generate_donut_chart_svg',
    'generate_empty_chart_svg',
    'get_carbon_code_styles',
]
