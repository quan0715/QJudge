"""Contest export/report service helpers."""

import csv
from django.http import HttpResponse

from ..exporters import (
    MarkdownRenderer,
    PDFRenderer,
    StudentReportRenderer,
    PaperExamReportRenderer,
    PaperExamSheetRenderer,
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
    REPORT_RENDERERS = {
        'coding': StudentReportRenderer,
        'paper_exam': PaperExamReportRenderer,
    }
    RendererClass = REPORT_RENDERERS.get(contest.contest_type, StudentReportRenderer)
    exporter = RendererClass(contest, user, language, scale)
    
    pdf_file = exporter.export()

    safe_contest_name = sanitize_filename(contest.name)
    safe_username = sanitize_filename(user.username)
    filename = f"report_{contest.id}_{safe_contest_name}_{safe_username}.pdf"

    response = HttpResponse(pdf_file.read(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def build_paper_exam_sheet_response(
    contest,
    *,
    mode: str = "question",
    language: str = "zh-TW",
    scale: float = 1.0,
):
    """Generate downloadable formal paper-exam sheet PDF."""
    normalized_mode = (mode or "question").lower()
    if normalized_mode not in {"question", "answer"}:
        raise ExportValidationError('Invalid mode. Choose "question" or "answer"')

    if contest.contest_type != "paper_exam":
        raise ExportValidationError("This contest is not a paper exam")

    exporter = PaperExamSheetRenderer(
        contest=contest,
        language=language,
        scale=scale,
        include_answers=(normalized_mode == "answer"),
    )
    pdf_file = exporter.export()

    safe_name = sanitize_filename(contest.name)
    suffix = "answer_sheet" if normalized_mode == "answer" else "question_paper"
    filename = f"exam_{contest.id}_{safe_name}_{suffix}.pdf"

    response = HttpResponse(pdf_file.read(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def build_contest_results_csv_response(contest, scoreboard_result):
    """Generate CSV response for contest scoreboard results."""
    response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
    response['Content-Disposition'] = f'attachment; filename="contest_{contest.id}_results.csv"'

    writer = csv.writer(response)

    # Header row
    header = ['排名', '帳號', '顯示名稱', 'Email', '解題數', '總分', '罰時']
    for problem in scoreboard_result.problems:
        label = problem.get('label') or chr(65 + problem['order'])
        title = problem.get('title') or ''
        header.append(f'{label} ({title})')
    writer.writerow(header)

    # Data rows
    for item in scoreboard_result.standings:
        row = [
            item['rank'],
            item['user'].get('username'),
            item['display_name'],
            item['user'].get('email'),
            item['solved'],
            item['total_score'],
            item['time']
        ]
        for problem in scoreboard_result.problems:
            p_stat = item['problems'].get(problem['id'], {})
            status_str = p_stat.get('status', '-')
            tries = p_stat.get('tries', 0)
            time_val = p_stat.get('time', 0)

            if status_str == 'AC':
                cell = f'AC ({tries} tries, {time_val}m)'
            elif tries > 0:
                cell = f'{status_str} ({tries} tries)'
            else:
                cell = '-'
            row.append(cell)

        writer.writerow(row)

    return response
