"""Contest export/report service helpers."""

import csv
from collections import defaultdict

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


def build_student_report_response(contest, user, language: str, scale: float, include_grading: bool = True):
    """Generate downloadable participant report response."""
    REPORT_RENDERERS = {
        'coding': StudentReportRenderer,
        'paper_exam': PaperExamReportRenderer,
    }
    RendererClass = REPORT_RENDERERS.get(contest.contest_type, StudentReportRenderer)
    exporter = RendererClass(contest, user, language, scale, include_grading=include_grading)
    
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
    include_answer_area: bool = True,
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
        include_answer_area=include_answer_area,
    )
    pdf_file = exporter.export()

    safe_name = sanitize_filename(contest.name)
    suffix = "answer_sheet" if normalized_mode == "answer" else "question_paper"
    filename = f"exam_{contest.id}_{safe_name}_{suffix}.pdf"

    response = HttpResponse(pdf_file.read(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def _get_admin_user_ids(contest):
    """Return a set of user IDs that are owner or co-admin of the contest."""
    admin_ids = set(contest.admins.values_list('id', flat=True))
    if contest.owner_id:
        admin_ids.add(contest.owner_id)
    return admin_ids


def build_paper_exam_results_csv_response(contest):
    """Generate CSV response for paper-exam results."""
    from ..models import ExamAnswer, ExamQuestion, ExamQuestionType

    response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
    safe_name = sanitize_filename(contest.name)
    response['Content-Disposition'] = f'attachment; filename="exam_{contest.id}_{safe_name}_results.csv"'

    questions = list(
        ExamQuestion.objects.filter(contest=contest).order_by('order', 'id')
    )
    participants = list(
        contest.registrations
        .select_related('user')
        .order_by('rank', '-score', 'joined_at')
    )
    answers = ExamAnswer.objects.filter(participant__contest=contest)

    # Build lookup: {participant_id: {question_id: ExamAnswer}}
    answer_lookup = defaultdict(dict)
    for ans in answers:
        answer_lookup[ans.participant_id][ans.question_id] = ans

    admin_user_ids = _get_admin_user_ids(contest)
    total_questions = len(questions)
    full_score = sum(q.score for q in questions)

    # Filter out admins/co-admins — only export student participants
    students = [p for p in participants if p.user_id not in admin_user_ids]

    # Header
    writer = csv.writer(response)
    header = ['帳號', '顯示名稱', 'Email', '考試狀態', '已批改/總題數', '總分', '滿分']
    for idx, q in enumerate(questions, 1):
        type_label = ExamQuestionType(q.question_type).label
        header.append(f'Q{idx} ({type_label}, {q.score}分)')
    writer.writerow(header)

    # Data rows — collect scores for average calculation
    score_sums = [0.0] * total_questions
    score_counts = [0] * total_questions
    total_score_sum = 0.0
    participant_count = len(students)

    for p in students:
        display_name = p.nickname or p.user.username
        status_label = p.get_exam_status_display()
        p_answers = answer_lookup.get(p.id, {})
        graded_count = sum(
            1 for q in questions
            if q.id in p_answers and p_answers[q.id].score is not None
        )

        row = [
            p.user.username,
            display_name,
            p.user.email,
            status_label,
            f'{graded_count}/{total_questions}',
            p.score,
            full_score,
        ]
        total_score_sum += p.score
        for i, q in enumerate(questions):
            ans = p_answers.get(q.id)
            if ans is not None and ans.score is not None:
                row.append(ans.score)
                score_sums[i] += float(ans.score)
                score_counts[i] += 1
            else:
                row.append('-')
        writer.writerow(row)

    # Average row
    avg_row = ['', '', '', '', '平均']
    avg_row.append(f'{total_score_sum / participant_count:.2f}' if participant_count else '-')
    avg_row.append(full_score)
    for i in range(total_questions):
        if score_counts[i] > 0:
            avg_row.append(f'{score_sums[i] / score_counts[i]:.2f}')
        else:
            avg_row.append('-')
    writer.writerow(avg_row)

    return response


def build_contest_results_csv_response(contest, scoreboard_result):
    """Generate CSV response for contest scoreboard results."""
    response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
    response['Content-Disposition'] = f'attachment; filename="contest_{contest.id}_results.csv"'

    admin_user_ids = _get_admin_user_ids(contest)
    writer = csv.writer(response)

    # Header row
    header = ['帳號', '顯示名稱', 'Email', '身份', '解題數', '總分', '罰時']
    for problem in scoreboard_result.problems:
        label = problem.get('label') or chr(65 + problem['order'])
        title = problem.get('title') or ''
        header.append(f'{label} ({title})')
    writer.writerow(header)

    # Data rows
    standings = scoreboard_result.standings
    total_score_sum = 0.0
    total_solved_sum = 0
    count = len(standings)

    for item in standings:
        user_id = item['user'].get('id')
        role = '管理者' if user_id in admin_user_ids else '參賽者'
        row = [
            item['user'].get('username'),
            item['display_name'],
            item['user'].get('email'),
            role,
            item['solved'],
            item['total_score'],
            item['time']
        ]
        total_score_sum += item['total_score']
        total_solved_sum += item['solved']
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

    # Average row
    avg_row = ['', '', '', '平均']
    avg_row.append(f'{total_solved_sum / count:.2f}' if count else '-')
    avg_row.append(f'{total_score_sum / count:.2f}' if count else '-')
    avg_row.append('')  # penalty — no meaningful average
    avg_row.extend([''] * len(scoreboard_result.problems))
    writer.writerow(avg_row)

    return response
