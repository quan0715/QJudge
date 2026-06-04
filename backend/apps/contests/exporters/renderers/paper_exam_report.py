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

    OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    def __init__(self, contest, user, language='zh-TW', scale=1.0, include_grading=True):
        super().__init__(contest, language)
        self.user = user
        self.scale = max(0.5, min(2.0, scale))
        self.include_grading = include_grading
        self._questions_cache = None
        self._answers_cache = None
        self._participant_cache = None
        self._scoring_context_cache = None

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
        questions = self._get_questions()
        answers_map = self._get_answers_map()
        scoring_ctx = self._get_scoring_context(answers_map)

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
            'score_line': self._render_score_line(scoring_ctx) if self.include_grading else '',
            'overview_table': self._render_overview_table(questions, answers_map, scoring_ctx),
            'question_details': self._render_questions(questions, answers_map, scoring_ctx),
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

    def _get_scoring_context(self, answers_map):
        """Compute and cache scoring context: breakdown, effective_max, has_redistribute, items_by_qid."""
        if self._scoring_context_cache is not None:
            return self._scoring_context_cache
        from apps.contests.services.exam_scoring import ExamScoringService
        scoring = ExamScoringService(self.contest)
        participant = self._get_participant()
        breakdown = scoring.get_participant_breakdown(participant, answers_map)
        effective_max = scoring.get_effective_max_scores()
        has_redistribute = any(q.is_redistribute for q in scoring.get_questions())
        items_by_qid = {item['question_id']: item for item in breakdown.items}
        self._scoring_context_cache = {
            'breakdown': breakdown,
            'effective_max': effective_max,
            'has_redistribute': has_redistribute,
            'items_by_qid': items_by_qid,
        }
        return self._scoring_context_cache

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
    # Score line — inline within header
    # ----------------------------------------------------------------

    def _render_score_line(self, scoring_ctx) -> str:
        """Render score as a single line inside the report header."""
        breakdown = scoring_ctx['breakdown']

        correct_rate = (breakdown.correct_count / breakdown.graded_count * 100) if breakdown.graded_count > 0 else 0
        total = breakdown.total_score
        score_display = int(total) if total == int(total) else f"{total:.1f}"
        max_score = int(breakdown.max_total_score) if breakdown.max_total_score == int(breakdown.max_total_score) else f"{breakdown.max_total_score:.1f}"

        score_label = self.get_label('total_score')
        rate_label = self.get_label('correct_rate')

        return (
            f'<div class="score-line">'
            f'{score_label}: <span class="score-value">{score_display} / {max_score}</span>'
            f' &nbsp;&middot;&nbsp; '
            f'{rate_label}: <span class="score-value">{correct_rate:.0f}%</span>'
            f'</div>'
        )

    def _render_overview_table(self, questions, answers_map, scoring_ctx) -> str:
        """Render a compact per-question overview table."""
        from apps.contests.models import ExamQuestionScorePolicy
        col_q = self.get_label('question_no')
        col_type = self.get_label('type_label', 'Type') # Fallback if missing
        if col_type == 'Type': col_type = '題型' if self.is_chinese else 'Type'
        col_status = self.get_label('status_label')
        col_score = self.get_label('score')
        table_title = self.get_label('question_overview')

        excluded_label = '不計分' if self.is_chinese else 'Excluded'
        full_marks_label = '送分' if self.is_chinese else 'Full Marks'
        redistribute_label = '重配分' if self.is_chinese else 'Redistributed'

        effective_max = scoring_ctx.get('effective_max', {})
        has_redistribute = scoring_ctx.get('has_redistribute', False)
        items_by_qid = scoring_ctx.get('items_by_qid', {})

        rows = []
        for idx, q in enumerate(questions, 1):
            ans = answers_map.get(q.id)
            has_answer = ans and self._has_answer(ans)
            is_graded = ans and ans.score is not None

            type_label = self.get_label(q.question_type, q.question_type)
            eff_max = effective_max.get(q.id, q.score)

            # Score policy badge
            policy_badge = ''
            if q.score_policy == ExamQuestionScorePolicy.EXCLUDED:
                policy_badge = f' <span style="color:#da1e28;font-size:0.75em;">({excluded_label})</span>'
            elif q.score_policy == ExamQuestionScorePolicy.FULL_MARKS:
                policy_badge = f' <span style="color:#198038;font-size:0.75em;">({full_marks_label})</span>'
            elif q.score_policy == ExamQuestionScorePolicy.REDISTRIBUTE:
                policy_badge = f' <span style="color:#eb6200;font-size:0.75em;">({redistribute_label})</span>'

            if self.include_grading:
                if q.score_policy == ExamQuestionScorePolicy.EXCLUDED:
                    score_display = f'<span style="text-decoration:line-through;color:#6f6f6f;">- / {q.score}</span>'
                    status = {"icon": "—", "status_class": "status-excluded", "color": "#6f6f6f"}
                elif q.score_policy == ExamQuestionScorePolicy.REDISTRIBUTE:
                    score_display = f'<span style="color:#6f6f6f;">— / —</span>'
                    status = {"icon": "→", "status_class": "status-excluded", "color": "#eb6200"}
                elif q.score_policy == ExamQuestionScorePolicy.FULL_MARKS:
                    eff_str = self._fmt_score(eff_max)
                    score_display = f'{eff_str} / {eff_str}'
                    status = {"icon": "★", "status_class": "status-full-marks", "color": "#198038"}
                else:
                    status = self._get_question_status(q, ans, has_answer, is_graded)
                    item = items_by_qid.get(q.id)
                    if item and item['score'] is not None:
                        scaled = item['score']
                        eff_str = self._fmt_score(eff_max)
                        raw_val = float(ans.score) if (ans and ans.score is not None) else None
                        if has_redistribute and raw_val is not None and eff_max != q.score:
                            raw_str = self._fmt_score(raw_val)
                            scaled_str = self._fmt_score(scaled)
                            score_display = f'{raw_str}→{scaled_str} / {eff_str}'
                        else:
                            score_str = self._fmt_score(scaled)
                            score_display = f'{score_str} / {eff_str}'
                    else:
                        score_display = f'- / {self._fmt_score(eff_max)}'
                status_cell = (
                    f'<td class="overview-cell overview-cell-status">'
                    f'<span class="status-text {status["status_class"]}">{status["icon"]}</span></td>'
                    f'<td class="overview-cell overview-cell-score" style="color:{status["color"]}">'
                    f'{score_display}</td>'
                )
            else:
                answered_icon = '✔' if has_answer else '—'
                answered_label = self.get_label('answered') if has_answer else self.get_label('unanswered')
                status_cell = (
                    f'<td class="overview-cell overview-cell-status">'
                    f'<span class="status-text">{answered_icon} {answered_label}</span></td>'
                )

            rows.append(
                f'<tr class="overview-row">'
                f'<td class="overview-cell overview-cell-q">Q{idx}{policy_badge}</td>'
                f'<td class="overview-cell overview-cell-type">{type_label}</td>'
                f'{status_cell}'
                f'</tr>'
            )

        # Build header columns
        header_cols = (
            f'<th class="overview-th">{col_q}</th>'
            f'<th class="overview-th">{col_type}</th>'
            f'<th class="overview-th">{col_status}</th>'
        )
        if self.include_grading:
            header_cols += f'<th class="overview-th overview-th-score">{col_score}</th>'

        return (
            f'<div class="section-title">{table_title}</div>'
            f'<table class="overview-table">'
            f'<thead><tr>{header_cols}</tr></thead>'
            f'<tbody>{"".join(rows)}</tbody>'
            f'</table>'
        )

    # ----------------------------------------------------------------
    # Question rendering
    # ----------------------------------------------------------------

    def _render_questions(self, questions, answers_map, scoring_ctx) -> str:
        """Render per-question detail blocks."""
        section_label = self.get_label('problem_details')
        parts = [f'<div class="section-title">{section_label}</div>']

        for idx, q in enumerate(questions, 1):
            ans = answers_map.get(q.id)
            parts.append(self._render_single_question(idx, q, ans, scoring_ctx))

        return '\n'.join(parts)

    def _render_single_question(self, idx, question, answer, scoring_ctx):
        """Render a single question block — continuous flow, no card."""
        from apps.contests.models import ExamQuestionScorePolicy
        q_type = question.question_type
        type_label = self.get_label(q_type, q_type)
        has_answer = answer and self._has_answer(answer)
        is_graded = answer and answer.score is not None

        effective_max = scoring_ctx.get('effective_max', {})
        has_redistribute = scoring_ctx.get('has_redistribute', False)
        items_by_qid = scoring_ctx.get('items_by_qid', {})
        eff_max = effective_max.get(question.id, question.score)

        lines = ['<div class="question-block">']

        points_label = self.get_label('points_unit')

        # Build policy annotation for the heading score
        excluded_label = '不計分' if self.is_chinese else 'Excluded'
        full_marks_label = '送分' if self.is_chinese else 'Full Marks'
        redistribute_label = '重配分' if self.is_chinese else 'Redistributed'

        if question.score_policy == ExamQuestionScorePolicy.EXCLUDED:
            score_annotation = (
                f'<span class="question-max-score" style="text-decoration:line-through;color:#6f6f6f;">'
                f'（{question.score}{points_label}）</span>'
                f' <span style="color:#da1e28;font-size:0.8em;">({excluded_label})</span>'
            )
        elif question.score_policy == ExamQuestionScorePolicy.REDISTRIBUTE:
            score_annotation = (
                f'<span class="question-max-score" style="color:#eb6200;">'
                f'（{question.score}{points_label} · {redistribute_label}）</span>'
            )
        elif question.score_policy == ExamQuestionScorePolicy.FULL_MARKS:
            eff_str = self._fmt_score(eff_max)
            score_annotation = (
                f'<span class="question-max-score" style="color:#198038;">'
                f'（{eff_str}{points_label} · {full_marks_label}）</span>'
            )
        elif has_redistribute and eff_max != question.score:
            eff_str = self._fmt_score(eff_max)
            score_annotation = (
                f'<span class="question-max-score">'
                f'（{question.score}→{eff_str}{points_label}）</span>'
            )
        else:
            score_annotation = (
                f'<span class="question-max-score">（{question.score}{points_label}）</span>'
            )

        lines.append('<div class="question-heading">')
        lines.append(
            f'<span class="question-heading-left">'
            f'<span class="question-number">Q{idx}</span>'
            f'<span class="question-type">{type_label}</span>'
            f'{score_annotation}'
            f'</span>'
        )

        if self.include_grading:
            if question.score_policy == ExamQuestionScorePolicy.EXCLUDED:
                score_display = f'<span style="text-decoration:line-through;color:#6f6f6f;">- / {question.score}</span>'
                score_color = '#6f6f6f'
                status = {"icon": "—", "status_class": "status-excluded", "label": excluded_label}
            elif question.score_policy == ExamQuestionScorePolicy.REDISTRIBUTE:
                score_display = f'<span style="color:#eb6200;">— / —</span>'
                score_color = '#eb6200'
                status = {"icon": "→", "status_class": "status-excluded", "label": redistribute_label}
            elif question.score_policy == ExamQuestionScorePolicy.FULL_MARKS:
                eff_str = self._fmt_score(eff_max)
                score_display = f'{eff_str} / {eff_str}'
                score_color = '#198038'
                status = {"icon": "★", "status_class": "status-full-marks", "label": full_marks_label}
            else:
                status = self._get_question_status(question, answer, has_answer, is_graded)
                item = items_by_qid.get(question.id)
                if item and item['score'] is not None:
                    scaled = item['score']
                    eff_str = self._fmt_score(eff_max)
                    raw_val = float(answer.score) if (answer and answer.score is not None) else None
                    if has_redistribute and raw_val is not None and eff_max != question.score:
                        raw_str = self._fmt_score(raw_val)
                        scaled_str = self._fmt_score(scaled)
                        score_display = f'{raw_str}→{scaled_str} / {eff_str}'
                    else:
                        score_display = f'{self._fmt_score(scaled)} / {eff_str}'
                else:
                    score_display = f'- / {self._fmt_score(eff_max)}'
                score_color = status['color']

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
            lines.append(self._render_choice_question(question, answer))
        else:
            lines.append(self._render_subjective_question(question, answer))

        # TA feedback — only when grading is included
        if self.include_grading and answer and answer.feedback:
            feedback_label = self.get_label('ta_feedback')
            lines.append(
                f'<div class="feedback-block">'
                f'<div class="feedback-label">{feedback_label}</div>'
                f'<div class="feedback-content">{render_markdown(answer.feedback)}</div>'
                f'</div>'
            )

        lines.append('</div>')
        return '\n'.join(lines)

    @staticmethod
    def _fmt_score(value) -> str:
        """Format a numeric score: int if whole, one decimal otherwise."""
        f = float(value)
        return str(int(f)) if f == int(f) else f"{f:.1f}"

    @staticmethod
    def _get_snapshot_value(answer, key, fallback=None):
        if answer and answer.question_snapshot:
            return answer.question_snapshot.get(key, fallback)
        return fallback

    def _get_question_status(self, question, answer, has_answer, is_graded):
        """Return status dict: icon, label, status_class, color."""
        if not has_answer:
            return {
                'icon': '⚠',
                'label': self.get_label('unanswered'),
                'status_class': 'status-unanswered',
                'color': '#8d8d8d',
            }

        if not is_graded:
            return {
                'icon': '…',
                'label': self.get_label('pending'),
                'status_class': 'status-ungraded',
                'color': '#8d8d8d',
            }

        score_val = float(answer.score)
        if score_val >= question.score:
            return {
                'icon': '✔',
                'label': self.get_label('correct'),
                'status_class': 'status-correct',
                'color': '#24a148',
            }
        elif score_val > 0:
            return {
                'icon': '△',
                'label': self.get_label('partial'),
                'status_class': 'status-partial',
                'color': '#eb6200',
            }
        else:
            return {
                'icon': '✖',
                'label': self.get_label('wrong'),
                'status_class': 'status-wrong',
                'color': '#da1e28',
            }

    def _render_choice_question(self, question, answer):
        """Render choice options + answer summary line."""
        options = question.options or []

        # Normalize student selection to set of int indices
        student_indices = set()
        if answer and answer.answer:
            sel = answer.answer.get('selected')
            if sel is not None:
                if isinstance(sel, list):
                    student_indices = set(sel)
                else:
                    student_indices = {sel}

        # Correct answers — only used when grading is included
        correct_indices = set()
        if self.include_grading:
            correct_answer = question.correct_answer
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
            if self.include_grading:
                if is_selected and is_correct:
                    css_classes.append('option-correct-selected')
                elif is_selected and not is_correct:
                    css_classes.append('option-wrong-selected')
                elif is_correct:
                    css_classes.append('option-correct')
            elif is_selected:
                css_classes.append('option-selected')

            cls_str = ' '.join(css_classes)

            markers = []
            if is_selected:
                sel_label = self.get_label('your_choice')
                markers.append(f'<span class="option-marker-text marker-selected">{sel_label}</span>')
            if self.include_grading and is_correct:
                cor_label = self.get_label('correct')
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

        student_letters = {self._index_to_letter(idx) for idx in student_indices}

        if self.include_grading:
            correct_letters = {self._index_to_letter(idx) for idx in correct_indices}
            if has_ans or correct_letters:
                lines.append(self._render_choice_answer_summary(
                    student_letters, correct_letters, student_indices == correct_indices and has_ans
                ))
        elif has_ans:
            # Answer-only mode: just show what the student picked
            your_label = self.get_label('your_answer')
            student_str = ', '.join(sorted(student_letters))
            lines.append(f'<div class="choice-answer-summary">{your_label}: <strong>{student_str}</strong></div>')

        explanation = self._get_snapshot_value(answer, 'explanation', question.explanation)
        if self.include_grading and explanation:
            explanation_label = self.get_label('explanation', '詳解')
            lines.append(
                f'<div class="answer-block answer-block-reference">'
                f'<div class="answer-block-label">{explanation_label}</div>'
                f'<div class="answer-block-content">{render_markdown(explanation)}</div>'
                f'</div>'
            )

        return '\n'.join(lines)

    def _render_choice_answer_summary(self, student_letters, correct_letters, is_match):
        """Render a compact summary: Your answer: B · Correct answer: D"""
        student_str = ', '.join(sorted(student_letters)) if student_letters else '—'
        correct_str = ', '.join(sorted(correct_letters)) if correct_letters else ''

        val_class = 'choice-summary-correct' if is_match else 'choice-summary-wrong'

        your_label = self.get_label('your_answer')
        correct_label = self.get_label('reference_answer') # or correct_answer

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

    def _render_subjective_question(self, question, answer):
        """Render subjective question with answer comparison."""
        lines = ['<div class="answer-compare">']

        student_text = ''
        if answer and answer.answer:
            student_text = answer.answer.get('text', '')

        if student_text:
            ans_label = self.get_label('your_answer')
            lines.append(
                f'<div class="answer-block answer-block-student">'
                f'<div class="answer-block-label">{ans_label}</div>'
                f'<div class="answer-block-content">{render_markdown(student_text)}</div>'
                f'</div>'
            )

        # Reference answer — only when grading is included
        reference_answer = self._get_snapshot_value(answer, 'correct_answer', question.correct_answer)
        if self.include_grading and reference_answer:
            ref_label = self.get_label('reference_answer')
            ref_text = reference_answer
            ref_html = render_markdown(ref_text) if isinstance(ref_text, str) else str(ref_text)
            lines.append(
                f'<div class="answer-block answer-block-reference">'
                f'<div class="answer-block-label">{ref_label}</div>'
                f'<div class="answer-block-content">{ref_html}</div>'
                f'</div>'
            )

        explanation = self._get_snapshot_value(answer, 'explanation', question.explanation)
        if self.include_grading and explanation:
            explanation_label = self.get_label('explanation', '詳解')
            lines.append(
                f'<div class="answer-block answer-block-reference">'
                f'<div class="answer-block-label">{explanation_label}</div>'
                f'<div class="answer-block-content">{render_markdown(explanation)}</div>'
                f'</div>'
            )

        lines.append('</div>')
        return '\n'.join(lines)

    # ----------------------------------------------------------------
    # Utility
    # ----------------------------------------------------------------

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
