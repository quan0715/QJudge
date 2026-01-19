"""
PDF renderer for contest export.
Uses WeasyPrint to generate PDF from HTML.
"""
from io import BytesIO
import re
from pathlib import Path

from django.contrib.staticfiles import finders
from django.template.loader import render_to_string
from django.utils import timezone

from .base import BaseRenderer
from ..utils import render_markdown, inline_markdown
from ..dto import ContestProblemDTO


class PDFRenderer(BaseRenderer):
    """Export contest to PDF format with frontend-matching styles."""

    def __init__(
        self,
        contest,
        language: str = 'zh-TW',
        scale: float = 1.0,
        layout: str = 'normal'
    ):
        super().__init__(contest, language)
        # Clamp scale between 0.5 and 2.0 for reasonable values
        self.scale = max(0.5, min(2.0, scale))
        # Layout mode: 'normal' or 'compact'
        self.layout = layout if layout in ('normal', 'compact') else 'normal'

    def export(self) -> BytesIO:
        """Generate PDF content for the contest."""
        html = self.render_html()

        # Generate PDF
        try:
            from weasyprint import HTML
        except (ImportError, OSError) as e:
            raise RuntimeError(
                "PDF export is not available. WeasyPrint requires system libraries "
                "(libpango, libcairo, libgobject) to be installed. "
                f"Original error: {e}"
            )

        pdf_file = BytesIO()
        HTML(string=html).write_pdf(pdf_file)
        pdf_file.seek(0)

        return pdf_file

    def render_html(self) -> str:
        """Render the full HTML document for PDF conversion."""
        contest_dto = self.data_service.get_contest_dto()

        context = {
            'language': self.language,
            'contest_name': inline_markdown(contest_dto.name),
            'contest_name_plain': contest_dto.name,
            'base_css': self.get_css_styles(),
            'exam_time_html': self._render_exam_time(),
            'exam_notice_html': self._render_exam_notice() if contest_dto.exam_mode_enabled else '',
            'rules_html': self._render_rules(contest_dto.rules),
            'problem_table_html': self._render_problem_table(),
            'problems_html': self._render_problems(),
        }

        return render_to_string('exports/contest_pdf.html', context)

    def _render_exam_notice(self) -> str:
        """Render the QJudge anti-cheating notice."""
        context = {
            'title': self.get_label('qjudge_anti_cheat_title'),
            'description': self.get_label('qjudge_anti_cheat_desc'),
            'warning': self.get_label('qjudge_anti_cheat_warning'),
        }
        return render_to_string('exports/partials/pdf/exam_notice.html', context)

    def _render_rules(self, rules: str) -> str:
        """Render the rules section."""
        if not rules:
            return ""

        context = {
            'title': self.get_label('contest_rules'),
            'content': render_markdown(rules),
        }
        return render_to_string('exports/partials/pdf/rules.html', context)

    def _render_problem_table(self) -> str:
        """Render the problem structure table."""
        contest_problems = self.data_service.get_contest_problems()
        if not contest_problems:
            return ""

        rows = []
        total_score = 0
        for cp in contest_problems:
            problem = cp.problem
            total_score += cp.score
            rows.append({
                'label': problem.label,
                'title': inline_markdown(problem.title),
                'score': cp.score,
            })

        context = {
            'title': self.get_label('problem_structure'),
            'labels': {
                'problem': self.get_label('problems', 'Problem'),
                'title': "主題" if self.is_chinese else "Title",
                'score': "配分" if self.is_chinese else "Score",
            },
            'rows': rows,
            'total_score': total_score,
        }
        return render_to_string('exports/partials/pdf/problem_table.html', context)

    def _render_problems(self) -> str:
        """Render all problem sections."""
        contest_problems = self.data_service.get_contest_problems()
        if not contest_problems:
            return ""

        problems_title = self.get_label('problems')
        problem_sections = []

        for idx, cp in enumerate(contest_problems):
            problem_sections.append(
                self._render_problem(cp, idx, len(contest_problems))
            )

        return f'<div class="page-break"></div><h1>{problems_title}</h1>{"".join(problem_sections)}'

    def _render_problem(self, cp: ContestProblemDTO, idx: int, total: int) -> str:
        """Render a single problem section."""
        problem = cp.problem

        context = {
            'problem': {
                'label': problem.label,
                'title': problem.title,
                'time_limit': problem.time_limit,
                'memory_limit': problem.memory_limit,
                'difficulty_display': problem.difficulty_display,
                'description_html': render_markdown(problem.description or ''),
                'input_html': render_markdown(problem.input_description or ''),
                'output_html': render_markdown(problem.output_description or ''),
                'hint_html': render_markdown(problem.hint or ''),
            },
            'labels': {
                'time_limit': self.get_label('time_limit'),
                'memory_limit': self.get_label('memory_limit'),
                'difficulty': self.get_label('difficulty'),
                'description': self.get_label('description'),
                'input_description': self.get_label('input_description'),
                'output_description': self.get_label('output_description'),
                'hint': self.get_label('hint'),
                'sample_cases': self.get_label('sample_cases'),
                'example': self.get_label('example'),
                'input': self.get_label('input'),
                'output': self.get_label('output'),
                'empty': self.get_label('empty'),
            },
            'sample_cases': [{'input': tc.input, 'output': tc.output} for tc in problem.sample_cases] if problem.sample_cases else [],
            'keyword_restrictions_html': self._render_keyword_restrictions(problem),
            'is_last': idx >= total - 1,
        }
        return render_to_string('exports/partials/pdf/problem.html', context)

    def _render_keyword_restrictions(self, problem) -> str:
        """Render keyword restriction tags."""
        required = problem.required_keywords or []
        forbidden = problem.forbidden_keywords or []

        if not required and not forbidden:
            return ""

        context = {
            'title': "程式碼限制" if self.is_chinese else "Code Restrictions",
            'labels': {
                'required': "必須包含的關鍵字：" if self.is_chinese else "Required Keywords:",
                'forbidden': "禁止使用的關鍵字：" if self.is_chinese else "Forbidden Keywords:",
            },
            'required_keywords': required,
            'forbidden_keywords': forbidden,
        }
        return render_to_string('exports/partials/pdf/keyword_restrictions.html', context)

    def _render_exam_time(self) -> str:
        """Render the exam time info section."""
        contest_dto = self.data_service.get_contest_dto()

        if not contest_dto.start_time or not contest_dto.end_time:
            return ""

        start = timezone.localtime(contest_dto.start_time)
        end = timezone.localtime(contest_dto.end_time)
        duration = (contest_dto.end_time - contest_dto.start_time).total_seconds() / 60

        context = {
            'labels': {
                'exam_time': self.get_label('exam_time'),
                'duration': self.get_label('duration'),
            },
            'start_str': start.strftime('%Y/%m/%d %H:%M'),
            'end_str': end.strftime('%H:%M'),
            'duration_str': f"{int(duration)} 分鐘" if self.is_chinese else f"{int(duration)} minutes",
        }
        return render_to_string('exports/partials/pdf/exam_time.html', context)

    def get_css_styles(self) -> str:
        """Get CSS styles from external file with scale applied."""
        base_css = self._read_static_css('exports/report-base.css')

        # Apply scale and layout adjustments
        if self.scale != 1.0 or self.layout == 'compact':
            return self._apply_scale_to_css(base_css)
        return base_css

    def _read_static_css(self, relative_path: str) -> str:
        """Read a static CSS asset from the configured staticfiles finders."""
        css_path = finders.find(relative_path)
        if not css_path:
            raise FileNotFoundError(f"Static CSS not found: {relative_path}")
        return Path(css_path).read_text(encoding="utf-8")

    def _apply_scale_to_css(self, css: str) -> str:
        """Apply scale factor and layout adjustments to CSS."""
        scale = self.scale
        is_compact = self.layout == 'compact'
        spacing_mult = 0.65 if is_compact else 1.0

        def scale_px(match):
            value = float(match.group(1))
            # Apply both scale and spacing multiplier for margin/padding
            return f"{value * scale * spacing_mult}px"

        # Scale px values
        scaled_css = re.sub(r'(\d+(?:\.\d+)?)px', scale_px, css)

        # Adjust page margin for compact mode
        if is_compact:
            scaled_css = scaled_css.replace('margin: 1.5cm;', 'margin: 1.0cm;')

        return scaled_css
