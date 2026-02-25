"""Contest export/report service helpers."""

from django.http import HttpResponse

from ..exporters import (
    MarkdownRenderer,
    PDFRenderer,
    StudentReportRenderer,
    sanitize_filename,
)


class ExportValidationError(Exception):
    """Raised when requested export parameters are invalid."""


def parse_scale(value: str | None) -> float:
    """Parse and clamp PDF scale value."""
    try:
        scale = float(value or "1.0")
    except (ValueError, TypeError):
        return 1.0
    return max(0.5, min(2.0, scale))


def build_contest_download_response(contest, file_format: str, language: str, scale: float, layout: str):
    """Generate downloadable contest file response."""
    normalized = (file_format or "markdown").lower()
    if normalized not in {"markdown", "pdf"}:
        raise ExportValidationError('Invalid format. Choose "markdown" or "pdf"')

    safe_name = sanitize_filename(contest.name)
    if normalized == "markdown":
        exporter = MarkdownRenderer(contest, language)
        content = exporter.export()
        response = HttpResponse(content, content_type="text/markdown; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="contest_{contest.id}_{safe_name}.md"'
        )
        return response

    normalized_layout = (layout or "normal").lower()
    if normalized_layout not in {"normal", "compact"}:
        normalized_layout = "normal"
    exporter = PDFRenderer(contest, language, scale=scale, layout=normalized_layout)
    pdf_file = exporter.export()
    response = HttpResponse(pdf_file.read(), content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="contest_{contest.id}_{safe_name}.pdf"'
    )
    return response


def build_student_report_response(contest, user, language: str, scale: float):
    """Generate downloadable participant report response."""
    exporter = StudentReportRenderer(contest, user, language, scale)
    pdf_file = exporter.export()

    safe_contest_name = sanitize_filename(contest.name)
    safe_username = sanitize_filename(user.username)
    filename = f"report_{contest.id}_{safe_contest_name}_{safe_username}.pdf"

    response = HttpResponse(pdf_file.read(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
