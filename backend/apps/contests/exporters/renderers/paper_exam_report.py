"""
Paper exam report renderer for individual student reports.
Generates PDF reports with scores, question details, and TA feedback.
"""
from io import BytesIO
from pathlib import Path

from django.contrib.staticfiles import finders
from django.template.loader import render_to_string
from django.utils import timezone

from .base import BaseRenderer
from ..utils import inline_markdown, render_markdown


class PaperExamReportRenderer(BaseRenderer):
    """
    Export individual student paper exam report to PDF.
    Includes score summary, per-question details with status indicators,
    answer comparisons, correct answers, and TA feedback.
    """

    QUESTION_TYPE_LABELS = {
        'true_false': {'zh': '是非題', 'en': 'True/False'},
        'single_choice': {'zh': '單選題', 'en': 'Single Choice'},
        'multiple_choice': {'zh': '多選題', 'en': 'Multiple Choice'},
        'short_answer': {'zh': '簡答題', 'en': 'Short Answer'},
        'essay': {'zh': '問答題', 'en': 'Essay'},
    }

    OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    def __init__(self, contest, user, language='zh-TW', scale=1.0):
        super().__init__(contest, language)
        self.user = user
        self.scale = max(0.5, min(2.0, scale))
        self._questions_cache = None
        self._answers_cache = None
        self._participant_cache = None

    def export(self) -> BytesIO:
        """Generate PDF report for the student."""
        html = self.render_html()

        try:
            from weasyprint import HTML
        except (ImportError, OSError) as e:
            raise RuntimeError(
                "PDF export is not available. WeasyPrint requires system libraries. "
                f"Original error: {e}"
            )

        pdf_file = BytesIO()
        HTML(string=html).write_pdf(pdf_file)
        pdf_file.seek(0)
        return pdf_file

    def render_html(self) -> str:
        """Render the full HTML document for PDF conversion."""
        context = {
            'language': self.language,
            'contest_name': inline_markdown(self.contest.name),
            'student_name': self.user.username,
            'download_time': timezone.now().strftime('%Y/%m/%d %H:%M'),
            'report_title': self.get_label('personal_report'),
            'labels': {
                'student': self.get_label('student'),
                'generated': self.get_label('generated'),
            },
            'base_css': self._get_base_css(),
            'report_css': self._get_report_css(),
            'score_cards': self._render_score_summary(),
            'question_details': self._render_questions(),
        }
        return render_to_string('exports/paper_exam_report.html', context)

    # ----------------------------------------------------------------
    # CSS helpers
    # ----------------------------------------------------------------

    def _get_base_css(self) -> str:
        css = self._read_static_css('exports/report-base.css')
        if self.scale != 1.0:
            return self._apply_scale_to_css(css)
        return css

    def _get_report_css(self) -> str:
        css = self._read_static_css('exports/paper-exam-report.css')
        if self.scale != 1.0:
            return self._apply_scale_to_css(css)
        return css

    def _read_static_css(self, relative_path: str) -> str:
        css_path = finders.find(relative_path)
        if not css_path:
            raise FileNotFoundError(f"Static CSS not found: {relative_path}")
        return Path(css_path).read_text(encoding="utf-8")

    def _apply_scale_to_css(self, css: str) -> str:
        import re
        scale = self.scale

        def scale_px(match):
            value = float(match.group(1))
            return f"{value * scale}px"

        return re.sub(r'(\d+(?:\.\d+)?)px', scale_px, css)

    # ----------------------------------------------------------------
    # Data helpers
    # ----------------------------------------------------------------

    def _get_participant(self):
        if self._participant_cache is None:
            from apps.contests.models import ContestParticipant
            self._participant_cache = ContestParticipant.objects.get(
                contest=self.contest, user=self.user
            )
        return self._participant_cache

    def _get_questions(self):
        if self._questions_cache is None:
            from apps.contests.models import ExamQuestion
            self._questions_cache = list(
                ExamQuestion.objects.filter(contest=self.contest).order_by('order', 'id')
            )
        return self._questions_cache

    def _get_answers_map(self):
        """Return dict mapping question_id -> ExamAnswer."""
        if self._answers_cache is None:
            from apps.contests.models import ExamAnswer
            participant = self._get_participant()
            answers = ExamAnswer.objects.filter(participant=participant).select_related('question')
            self._answers_cache = {a.question_id: a for a in answers}
        return self._answers_cache

    # ----------------------------------------------------------------
    # Score summary — 2×2 grid layout
    # ----------------------------------------------------------------

    def _render_score_summary(self) -> str:
        """Render score headline + per-question overview table."""
        questions = self._get_questions()
        answers_map = self._get_answers_map()
        is_zh = self.is_chinese

        max_score = sum(q.score for q in questions)

        total_score = 0.0
        graded_count = 0
        correct_count = 0

        for q in questions:
            ans = answers_map.get(q.id)
            if ans and ans.score is not None:
                graded_count += 1
                score_val = float(ans.score)
                total_score += score_val
                if score_val >= q.score:
                    correct_count += 1

        correct_rate = (correct_count / graded_count * 100) if graded_count > 0 else 0
        score_display = int(total_score) if total_score == int(total_score) else f"{total_score:.1f}"

        rate_label = '正確率' if is_zh else 'Correct rate'

        parts = [
            f'<div class="score-headline">',
            f'<div class="score-headline-primary">{score_display}'
            f'<span class="score-headline-max"> / {max_score}</span></div>',
            f'<div class="score-headline-secondary">'
            f'{rate_label} <span class="score-rate">{correct_rate:.0f}%</span>'
            f'</div>',
            f'</div>',
            self._render_overview_table(questions, answers_map, is_zh),
        ]
        return '\n'.join(parts)

    def _render_overview_table(self, questions, answers_map, is_zh) -> str:
        """Render a compact per-question overview table."""
        col_q = '#'
        col_type = '題型' if is_zh else 'Type'
        col_status = '狀態' if is_zh else 'Status'
        col_score = '得分' if is_zh else 'Score'
        table_title = '逐題總覽' if is_zh else 'Question Overview'

        rows = []
        for idx, q in enumerate(questions, 1):
            ans = answers_map.get(q.id)
            has_answer = ans and self._has_answer(ans)
            is_graded = ans and ans.score is not None
            status = self._get_question_status(q, ans, has_answer, is_graded)

            type_label = self._get_question_type_label(q.question_type, is_zh)

            if is_graded:
                score_val = float(ans.score)
                score_str = int(score_val) if score_val == int(score_val) else f"{score_val:.1f}"
                score_display = f'{score_str} / {q.score}'
            else:
                score_display = f'- / {q.score}'

            rows.append(
                f'<tr class="overview-row">'
                f'<td class="overview-cell overview-cell-q">Q{idx}</td>'
                f'<td class="overview-cell overview-cell-type">{type_label}</td>'
                f'<td class="overview-cell overview-cell-status">'
                f'<span class="status-text {status["status_class"]}">{status["icon"]} {status["label"]}</span></td>'
                f'<td class="overview-cell overview-cell-score" style="color:{status["color"]}">'
                f'{score_display}</td>'
                f'</tr>'
            )

        return (
            f'<div class="section-title">{table_title}</div>'
            f'<table class="overview-table">'
            f'<thead><tr>'
            f'<th class="overview-th">{col_q}</th>'
            f'<th class="overview-th">{col_type}</th>'
            f'<th class="overview-th">{col_status}</th>'
            f'<th class="overview-th overview-th-score">{col_score}</th>'
            f'</tr></thead>'
            f'<tbody>{"".join(rows)}</tbody>'
            f'</table>'
        )

    # ----------------------------------------------------------------
    # Question rendering
    # ----------------------------------------------------------------

    def _render_questions(self) -> str:
        """Render per-question detail cards."""
        questions = self._get_questions()
        answers_map = self._get_answers_map()
        is_zh = self.is_chinese

        section_label = '逐題詳情' if is_zh else 'Question Details'
        parts = [f'<div class="section-title">{section_label}</div>']

        for idx, q in enumerate(questions, 1):
            ans = answers_map.get(q.id)
            parts.append(self._render_single_question(idx, q, ans, is_zh))

        return '\n'.join(parts)

    def _render_single_question(self, idx, question, answer, is_zh):
        """Render a single question block — continuous flow, no card."""
        q_type = question.question_type
        type_label = self._get_question_type_label(q_type, is_zh)
        has_answer = answer and self._has_answer(answer)
        is_graded = answer and answer.score is not None

        status = self._get_question_status(question, answer, has_answer, is_graded)

        # Score display
        if is_graded:
            score_val = float(answer.score)
            score_str = int(score_val) if score_val == int(score_val) else f"{score_val:.1f}"
            score_display = f'{score_str} / {question.score}'
            score_color = status['color']
        else:
            score_display = f'- / {question.score}'
            score_color = '#8d8d8d'

        lines = ['<div class="question-block">']

        # Single-line heading: Q1 單選題（3分）       ✔ 正確  3/3
        lines.append('<div class="question-heading">')
        lines.append(
            f'<span class="question-heading-left">'
            f'<span class="question-number">Q{idx}</span>'
            f'<span class="question-type">{type_label}</span>'
            f'<span class="question-max-score">（{question.score}分）</span>'
            f'</span>'
        )
        lines.append(
            f'<span class="question-heading-right">'
            f'<span class="status-text {status["status_class"]}">{status["icon"]} {status["label"]}</span>'
            f'&nbsp;&nbsp;'
            f'<span class="question-earned" style="color:{score_color}">{score_display}</span>'
            f'</span>'
        )
        lines.append('</div>')

        # Prompt
        prompt_html = render_markdown(question.prompt)
        lines.append(f'<div class="question-prompt">{prompt_html}</div>')

        if q_type in ('true_false', 'single_choice', 'multiple_choice'):
            lines.append(self._render_choice_question(question, answer, is_zh))
        else:
            lines.append(self._render_subjective_question(question, answer, is_zh))

        # TA feedback
        if answer and answer.feedback:
            feedback_label = 'TA 評語' if is_zh else 'TA Feedback'
            lines.append(
                f'<div class="feedback-block">'
                f'<div class="feedback-label">{feedback_label}</div>'
                f'<div class="feedback-content">{render_markdown(answer.feedback)}</div>'
                f'</div>'
            )

        lines.append('</div>')
        return '\n'.join(lines)

    def _get_question_status(self, question, answer, has_answer, is_graded):
        """Return status dict: icon, label, status_class, color."""
        is_zh = self.is_chinese

        if not has_answer:
            return {
                'icon': '⚠',
                'label': '未作答' if is_zh else 'Unanswered',
                'status_class': 'status-unanswered',
                'color': '#8d8d8d',
            }

        if not is_graded:
            return {
                'icon': '…',
                'label': '待批改' if is_zh else 'Pending',
                'status_class': 'status-ungraded',
                'color': '#8d8d8d',
            }

        score_val = float(answer.score)
        if score_val >= question.score:
            return {
                'icon': '✔',
                'label': '正確' if is_zh else 'Correct',
                'status_class': 'status-correct',
                'color': '#24a148',
            }
        elif score_val > 0:
            return {
                'icon': '△',
                'label': '部分正確' if is_zh else 'Partial',
                'status_class': 'status-partial',
                'color': '#eb6200',
            }
        else:
            return {
                'icon': '✖',
                'label': '錯誤' if is_zh else 'Wrong',
                'status_class': 'status-wrong',
                'color': '#da1e28',
            }

    def _render_choice_question(self, question, answer, is_zh):
        """Render choice options + answer summary line."""
        options = question.options or []
        correct_answer = question.correct_answer

        # Normalize student selection to set of int indices
        student_indices = set()
        if answer and answer.answer:
            sel = answer.answer.get('selected')
            if sel is not None:
                if isinstance(sel, list):
                    student_indices = set(sel)
                else:
                    student_indices = {sel}

        # Normalize correct answer to set of int indices
        correct_indices = set()
        if correct_answer is not None:
            if isinstance(correct_answer, list):
                correct_indices = set(correct_answer)
            else:
                correct_indices = {correct_answer}

        has_ans = bool(student_indices)

        lines = ['<div class="question-options">']

        for i, opt in enumerate(options):
            letter = self.OPTION_LETTERS[i] if i < len(self.OPTION_LETTERS) else str(i)
            opt_text = opt if isinstance(opt, str) else str(opt)

            is_selected = i in student_indices
            is_correct = i in correct_indices

            css_classes = ['option-row']
            if is_selected and is_correct:
                css_classes.append('option-correct-selected')
            elif is_selected and not is_correct:
                css_classes.append('option-wrong-selected')
            elif is_correct:
                css_classes.append('option-correct')

            cls_str = ' '.join(css_classes)

            # Right-aligned markers — plain text
            markers = []
            if is_selected:
                sel_label = '你的選擇' if is_zh else 'Selected'
                markers.append(f'<span class="option-marker-text marker-selected">{sel_label}</span>')
            if is_correct:
                cor_label = '正確' if is_zh else 'Correct'
                markers.append(f'<span class="option-marker-text marker-correct">{cor_label}</span>')

            marker_html = f'<span class="option-markers">{"".join(markers)}</span>' if markers else ''

            lines.append(
                f'<div class="{cls_str}">'
                f'<span class="option-letter">{letter}.</span>'
                f'<span class="option-text">{inline_markdown(opt_text)}</span>'
                f'{marker_html}'
                f'</div>'
            )

        lines.append('</div>')

        # Convert indices to letters for summary display
        student_letters = {self._index_to_letter(idx) for idx in student_indices}
        correct_letters = {self._index_to_letter(idx) for idx in correct_indices}

        # Answer summary line: "你的答案: B · 正確答案: D"
        if has_ans or correct_letters:
            lines.append(self._render_choice_answer_summary(
                student_letters, correct_letters, student_indices == correct_indices and has_ans, is_zh
            ))
        elif not has_ans:
            no_label = '未作答' if is_zh else 'Unanswered'
            lines.append(f'<span class="no-answer-text">⚠ {no_label}</span>')

        return '\n'.join(lines)

    def _render_choice_answer_summary(self, student_letters, correct_letters, is_match, is_zh):
        """Render a compact summary: Your answer: B · Correct answer: D"""
        student_str = ', '.join(sorted(student_letters)) if student_letters else '—'
        correct_str = ', '.join(sorted(correct_letters)) if correct_letters else ''

        val_class = 'choice-summary-correct' if is_match else 'choice-summary-wrong'

        your_label = '你的答案' if is_zh else 'Your answer'
        correct_label = '正確答案' if is_zh else 'Correct answer'

        parts = [f'<div class="choice-answer-summary">']
        parts.append(f'{your_label}: <strong class="{val_class}">{student_str}</strong>')
        if correct_str:
            parts.append(f' &nbsp;·&nbsp; {correct_label}: <strong class="choice-summary-correct">{correct_str}</strong>')
        parts.append('</div>')
        return ''.join(parts)

    def _index_to_letter(self, idx):
        """Convert 0-based index to letter (0→A, 1→B, ...)."""
        if isinstance(idx, int) and 0 <= idx < len(self.OPTION_LETTERS):
            return self.OPTION_LETTERS[idx]
        return str(idx)

    def _render_subjective_question(self, question, answer, is_zh):
        """Render subjective question with answer comparison."""
        lines = ['<div class="answer-compare">']

        student_text = ''
        if answer and answer.answer:
            student_text = answer.answer.get('text', '')

        if student_text:
            ans_label = '你的回答' if is_zh else 'Your Answer'
            lines.append(
                f'<div class="answer-block answer-block-student">'
                f'<div class="answer-block-label">{ans_label}</div>'
                f'<div class="answer-block-content">{render_markdown(student_text)}</div>'
                f'</div>'
            )
        else:
            no_label = '未作答' if is_zh else 'Unanswered'
            lines.append(f'<span class="no-answer-text">⚠ {no_label}</span>')

        if question.correct_answer:
            ref_label = '參考答案' if is_zh else 'Reference Answer'
            ref_text = question.correct_answer
            ref_html = render_markdown(ref_text) if isinstance(ref_text, str) else str(ref_text)
            lines.append(
                f'<div class="answer-block answer-block-reference">'
                f'<div class="answer-block-label">{ref_label}</div>'
                f'<div class="answer-block-content">{ref_html}</div>'
                f'</div>'
            )

        lines.append('</div>')
        return '\n'.join(lines)

    # ----------------------------------------------------------------
    # Utility
    # ----------------------------------------------------------------

    def _get_question_type_label(self, q_type, is_zh):
        lang_key = 'zh' if is_zh else 'en'
        entry = self.QUESTION_TYPE_LABELS.get(q_type)
        if entry:
            return entry.get(lang_key, q_type)
        return q_type

    @staticmethod
    def _has_answer(answer) -> bool:
        """Check if an ExamAnswer actually has content."""
        if not answer or not answer.answer:
            return False
        data = answer.answer
        if isinstance(data, dict):
            if 'selected' in data:
                sel = data['selected']
                if isinstance(sel, list):
                    return len(sel) > 0
                return sel is not None and sel != ''
            if 'text' in data:
                return bool(data['text'])
        return False
