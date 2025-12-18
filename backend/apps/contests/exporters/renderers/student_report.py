"""
Student report renderer for individual exam reports.
Generates PDF reports with scores, charts, and code submissions.
"""
from io import BytesIO
from pathlib import Path
from typing import List, Optional

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

from .base import BaseRenderer
from ..dto import SubmissionDTO, ContestProblemDTO
from ..utils import inline_markdown, highlight_code as _highlight_code, CHART_COLORS


class StudentReportRenderer(BaseRenderer):
    """
    Export individual student exam report to PDF.
    Includes score summary, difficulty stats, problem details with AC code,
    ranking, and submission trend charts.
    """

    def __init__(
        self,
        contest,
        user,
        language: str = 'zh-TW',
        scale: float = 1.0
    ):
        super().__init__(contest, language)
        self.user = user
        self.scale = max(0.5, min(2.0, scale))
        self._submissions_cache = None
        self._standings_cache = None

    # ================================================================
    # Backward-compatible proxy methods
    # ================================================================

    def highlight_code(self, code: str, language: str = 'cpp') -> str:
        """Proxy to utils.highlight_code for backward compatibility."""
        return _highlight_code(code, language)

    def get_user_submissions(self):
        """Proxy to data_service for backward compatibility."""
        return self._get_user_submissions()

    def calculate_standings(self):
        """Proxy to data_service for backward compatibility. Returns dict format."""
        standings = self._get_standings()
        user_stats = standings.user_stats
        return {
            'rank': standings.rank,
            'total_participants': standings.total_participants,
            'user_stats': {
                'solved': user_stats.solved if user_stats else 0,
                'total_score': user_stats.total_score if user_stats else 0,
                'penalty': user_stats.penalty if user_stats else 0,
            } if user_stats else None,
            'standings': [
                {
                    'user_id': s.user_id,
                    'username': s.username,
                    'solved': s.solved,
                    'total_score': s.total_score,
                    'penalty': s.penalty,
                    'rank': s.rank,
                }
                for s in standings.standings
            ],
        }

    def get_difficulty_stats(self):
        """Proxy to data_service for backward compatibility. Returns dict format."""
        stats = self.data_service.get_difficulty_stats(self.user.id)
        return {
            'easy': stats.easy,
            'medium': stats.medium,
            'hard': stats.hard,
        }

    def get_last_ac_submission(self, problem_id: int):
        """Proxy to data_service for backward compatibility."""
        return self.data_service.get_user_last_ac_submission(self.user.id, problem_id)

    def get_best_submission(self, problem_id: int):
        """Proxy to data_service for backward compatibility."""
        return self.data_service.get_user_best_submission(self.user.id, problem_id)

    def get_contest_problems(self):
        """Proxy to data_service for backward compatibility."""
        return self.data_service.get_contest_problems()

    def generate_scatter_chart_svg(self, submissions=None, contest_problems=None):
        """Generate scatter chart (backward compatible wrapper)."""
        if submissions is None:
            submissions = self._get_user_submissions()
        if contest_problems is None:
            contest_problems = self.data_service.get_contest_problems()
        return self._generate_scatter_chart_svg(submissions, contest_problems)

    def generate_cumulative_chart_svg(self, submissions=None):
        """Generate cumulative chart (backward compatible wrapper)."""
        if submissions is None:
            submissions = self._get_user_submissions()
        return self._generate_cumulative_chart_svg(submissions)

    def render_score_cards(self):
        """Public wrapper for backward compatibility."""
        return self._render_score_cards()

    def render_difficulty_stats(self):
        """Public wrapper for backward compatibility."""
        return self._render_difficulty_stats()

    def render_problem_details(self):
        """Public wrapper for backward compatibility."""
        return self._render_problem_details()

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
        """Render the full HTML document for PDF conversion using Django template."""
        # Prepare context
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
            # CSS
            'base_css': self._get_base_css(),
            'report_css': self._get_report_css(),
            # Report sections (rendered as HTML strings)
            'score_cards': self._render_score_cards(),
            'difficulty_stats': self._render_difficulty_stats(),
            'problem_grid': self._render_problem_grid(),
            'trend_charts': self._render_trend_charts(),
            'problem_details': self._render_problem_details(),
        }

        return render_to_string('exports/student_report.html', context)

    def _get_base_css(self) -> str:
        """Get base CSS from external file with scale applied."""
        css_path = Path(settings.BASE_DIR) / 'static' / 'exports' / 'report-base.css'
        base_css = css_path.read_text()
        if self.scale != 1.0:
            return self._apply_scale_to_css(base_css)
        return base_css

    def _get_report_css(self) -> str:
        """Get report-specific CSS from external file."""
        css_path = Path(settings.BASE_DIR) / 'static' / 'exports' / 'student-report.css'
        base_css = css_path.read_text()
        # Apply scale to CSS values if scale != 1.0
        if self.scale != 1.0:
            return self._apply_scale_to_css(base_css)
        return base_css

    def _apply_scale_to_css(self, css: str) -> str:
        """Apply scale factor to CSS pixel values."""
        import re
        scale = self.scale

        def scale_px(match):
            value = float(match.group(1))
            return f"{value * scale}px"

        # Scale px values (but not percentages or other units)
        return re.sub(r'(\d+(?:\.\d+)?)px', scale_px, css)

    def _get_user_submissions(self) -> List[SubmissionDTO]:
        """Get all submissions for this user in this contest."""
        if self._submissions_cache is None:
            self._submissions_cache = self.data_service.get_submissions(self.user.id)
        return self._submissions_cache

    def _get_standings(self):
        """Get standings with user stats."""
        if self._standings_cache is None:
            self._standings_cache = self.data_service.calculate_standings(self.user.id)
        return self._standings_cache

    def _render_score_cards(self) -> str:
        """Render the 4-column score cards section."""
        standings = self._get_standings()
        user_stats = standings.user_stats

        total_score = user_stats.total_score if user_stats else 0
        solved = user_stats.solved if user_stats else 0
        rank = standings.rank or '-'
        total_participants = standings.total_participants

        # Count total problems
        contest_problems = self.data_service.get_contest_problems()
        total_problems = len(contest_problems)

        # Calculate effective submissions and AC count
        submissions = self._get_user_submissions()
        ac_problems = set()
        effective_submissions = 0
        effective_ac_count = 0

        for sub in submissions:
            if sub.problem_id in ac_problems:
                continue
            effective_submissions += 1
            if sub.status == 'AC':
                effective_ac_count += 1
                ac_problems.add(sub.problem_id)

        # Calculate AC rate and max score
        ac_rate = (effective_ac_count / effective_submissions * 100) if effective_submissions > 0 else 0
        max_score = sum(cp.score for cp in contest_problems)

        # Determine rank label
        is_finished = self.contest.end_time and timezone.now() > self.contest.end_time
        rank_label = self.get_label('final_rank') if is_finished else self.get_label('current_rank')

        context = {
            'cards': [
                {'label': self.get_label('total_score'), 'value': total_score, 'max_value': max_score},
                {'label': self.get_label('solved'), 'value': solved, 'max_value': total_problems},
                {'label': rank_label, 'value': f'#{rank}', 'max_value': total_participants},
                {'label': self.get_label('submissions'), 'value': effective_ac_count, 'max_value': effective_submissions, 'sub_text': f'AC {ac_rate:.0f}%'},
            ]
        }

        return render_to_string('exports/partials/student_report/score_cards.html', context)

    def _render_difficulty_stats(self) -> str:
        """Render difficulty statistics with 3 donut charts."""
        scale = self.scale
        stats = self.data_service.get_difficulty_stats(self.user.id)

        difficulty_config = {
            'easy': (self.get_label('easy'), '#24a148', '#a7f0ba'),
            'medium': (self.get_label('medium'), '#f1c21b', '#fddc69'),
            'hard': (self.get_label('hard'), '#da1e28', '#ffb3b8'),
        }

        items = []
        for difficulty in ['easy', 'medium', 'hard']:
            name, color, bg_color = difficulty_config[difficulty]
            diff_data = getattr(stats, difficulty)
            solved = diff_data['solved']
            total = diff_data['total']
            user_score = diff_data['score']
            max_score = diff_data['max_score']
            percentage = (solved / total * 100) if total > 0 else 0

            donut_svg = self._generate_donut_svg(size=80*scale, percentage=percentage, color=color, bg_color=bg_color, label=f'{solved}/{total}')

            items.append({
                'label': name,
                'color': color,
                'chart_svg': donut_svg,
                'details': [
                    {'label': self.get_label('problems_label'), 'value': f'{solved}/{total}'},
                    {'label': self.get_label('score_label'), 'value': f'{user_score}/{max_score}'},
                ]
            })

        context = {
            'title': self.get_label('difficulty_stats'),
            'items': items,
        }

        return render_to_string('exports/partials/student_report/difficulty_stats.html', context)

    def _generate_donut_svg(self, size: float, percentage: float, color: str, bg_color: str, label: str) -> str:
        """Generate an SVG donut chart."""
        scale = self.scale
        stroke_width = 8 * scale
        radius = (size - stroke_width) / 2
        circumference = 2 * 3.14159 * radius
        dash_offset = circumference * (1 - percentage / 100)

        context = {
            'size': size,
            'cx': size / 2,
            'cy': size / 2,
            'radius': radius,
            'stroke_width': stroke_width,
            'circumference': circumference,
            'dash_offset': dash_offset,
            'color': color,
            'bg_color': bg_color,
            'label': label,
            'text_y': size / 2 + 5 * scale,
            'font_size': 18 * scale,
        }
        return render_to_string('exports/components/donut_chart.svg', context)

    def _render_problem_grid(self) -> str:
        """Render a grid showing submission status for each problem."""
        contest_problems = self.data_service.get_contest_problems()
        standings = self._get_standings()
        user_stats = standings.user_stats
        user_problems = user_stats.problems if user_stats else {}
        submissions = self._get_user_submissions()

        grid_items = []
        for cp in contest_problems:
            problem = cp.problem
            problem_stat = user_problems.get(cp.problem_id)

            status = problem_stat.status if problem_stat else ''
            score = problem_stat.score if problem_stat else 0
            max_score = problem_stat.max_score if problem_stat else cp.score

            # Get submission counts
            problem_submissions = [s for s in submissions if s.problem_id == cp.problem_id]
            ac_count = sum(1 for s in problem_submissions if s.status == 'AC')
            wa_count = sum(1 for s in problem_submissions if s.status != 'AC')

            # Status-based colors
            if status == 'AC':
                status_icon = '✓'
                row_bg = '#defbe6'
                label_bg = '#24a148'
            elif score > 0 and score < max_score:
                status_icon = '◐'
                row_bg = '#fcf4d6'
                label_bg = '#f1c21b'
            elif ac_count > 0 or wa_count > 0:
                status_icon = '✗'
                row_bg = '#fff1f1'
                label_bg = '#da1e28'
            else:
                status_icon = '—'
                row_bg = '#f4f4f4'
                label_bg = '#8d8d8d'

            grid_items.append({
                'label': problem.label,
                'score': score,
                'max_score': max_score,
                'ac_count': ac_count,
                'wa_count': wa_count,
                'status_icon': status_icon,
                'row_bg': row_bg,
                'label_bg': label_bg,
            })

        # Split into 2 columns
        mid = (len(grid_items) + 1) // 2
        context = {
            'title': self.get_label('problem_status'),
            'column1': grid_items[:mid],
            'column2': grid_items[mid:],
        }

        return render_to_string('exports/partials/student_report/problem_grid.html', context)

    def _render_trend_charts(self) -> str:
        """Render submission trend charts section."""
        submissions = self._get_user_submissions()
        contest_problems = self.data_service.get_contest_problems()

        context = {
            'scatter_title': self.get_label('submission_timeline'),
            'cumulative_title': self.get_label('cumulative_solved'),
            'scatter_svg': self._generate_scatter_chart_svg(submissions, contest_problems),
            'cumulative_svg': self._generate_cumulative_chart_svg(submissions),
        }

        return render_to_string('exports/partials/student_report/trend_charts.html', context)

    def _render_problem_details(self) -> str:
        """Render detailed results for each problem including AC code."""
        contest_problems = self.data_service.get_contest_problems()
        standings = self._get_standings()
        user_stats = standings.user_stats
        user_problems = user_stats.problems if user_stats else {}

        problems = []
        for cp in contest_problems:
            problem = cp.problem
            problem_stat = user_problems.get(cp.problem_id)

            status = problem_stat.status if problem_stat else None
            score = problem_stat.score if problem_stat else 0
            max_score = problem_stat.max_score if problem_stat else cp.score
            tries = problem_stat.tries if problem_stat else 0

            # Status-based label
            if status == 'AC':
                label_bg = '#24a148'
                status_icon = '✓'
                status_text = 'AC'
            elif score > 0 and score < max_score:
                label_bg = '#f1c21b'
                status_icon = '◐'
                status_text = self.get_label('partial')
            elif tries > 0:
                label_bg = '#da1e28'
                status_icon = '✗'
                status_text = status or 'WA'
            else:
                label_bg = '#8d8d8d'
                status_icon = '—'
                status_text = self.get_label('not_attempted')

            # Get best submission code
            code_html = ''
            code_label = ''
            language = ''
            if tries > 0:
                best_submission = self.data_service.get_user_best_submission(
                    self.user.id, cp.problem_id
                )
                if best_submission and best_submission.code:
                    if status == 'AC':
                        code_label = self.get_label('accepted_code')
                    elif score > 0 and score < max_score:
                        code_label = self.get_label('best_submission')
                    else:
                        code_label = self.get_label('last_submission')

                    code_html = _highlight_code(best_submission.code, best_submission.language)
                    language = best_submission.language

            problems.append({
                'label': problem.label,
                'title': problem.title,
                'label_bg': label_bg,
                'status_icon': status_icon,
                'status_text': status_text,
                'score': score,
                'max_score': max_score,
                'tries': tries,
                'code_html': code_html,
                'code_label': code_label,
                'language': language,
            })

        context = {
            'title': self.get_label('problem_details'),
            'problems': problems,
            'labels': {
                'score': self.get_label('score_label'),
                'tries': self.get_label('tries_label'),
            }
        }

        return render_to_string('exports/partials/student_report/problem_details.html', context)

    def _generate_scatter_chart_svg(
        self,
        submissions: List[SubmissionDTO],
        contest_problems: List[ContestProblemDTO]
    ) -> str:
        """Generate SVG scatter chart showing submission timeline by problem."""
        if not submissions:
            return self._empty_chart_svg(self.get_label('no_submissions'))

        scale = self.scale
        width = 700 * scale
        height = 280 * scale
        padding_left = 60 * scale
        padding_right = 40 * scale
        padding_top = 30 * scale
        padding_bottom = 60 * scale
        chart_width = width - padding_left - padding_right
        chart_height = height - padding_top - padding_bottom
        num_problems = len(contest_problems)

        # Calculate time range
        start_time = self.contest.start_time or self.contest.created_at
        end_time = self.contest.end_time or timezone.now()
        time_range = (end_time - start_time).total_seconds()
        if time_range <= 0:
            time_range = 3600

        # Build problem data
        problems = []
        problem_status_colors = {}
        for i, cp in enumerate(contest_problems):
            problem_subs = [s for s in submissions if s.problem_id == cp.problem_id]
            has_ac = any(s.status == 'AC' for s in problem_subs)
            color = '#24a148' if has_ac else ('#da1e28' if problem_subs else '#8d8d8d')
            problem_status_colors[cp.problem_id] = color

            y = padding_top + ((i + 0.5) / num_problems) * chart_height
            problems.append({
                'y': y,
                'label': cp.problem.label,
                'color': color,
                'rect_x': padding_left - 45 * scale,
                'rect_y': y - 10 * scale,
                'text_x': padding_left - 25 * scale,
                'text_y': y + 4 * scale,
            })

        # Build time markers
        time_markers = []
        for i in range(5):
            x = padding_left + (i / 4) * chart_width
            time_minutes = int((time_range / 60) * (i / 4))
            time_markers.append({
                'x': x,
                'label': f"{time_minutes // 60}:{time_minutes % 60:02d}",
                'label_y': height - padding_bottom + 15 * scale,
            })

        # Build submission points
        points = []
        for sub in submissions:
            time_offset = (sub.created_at - start_time).total_seconds()
            x = padding_left + (time_offset / time_range) * chart_width
            problem_idx = next((i for i, cp in enumerate(contest_problems) if cp.problem_id == sub.problem_id), 0)
            y = padding_top + ((problem_idx + 0.5) / num_problems) * chart_height

            points.append({
                'x': x,
                'y': y,
                'is_ac': sub.status == 'AC',
                'color': '#24a148' if sub.status == 'AC' else '#da1e28',
                'outer_radius': 8 * scale,
                'inner_radius': 6 * scale,
                'radius': 5 * scale,
            })

        context = {
            'width': width,
            'height': height,
            'padding_left': padding_left,
            'padding_top': padding_top,
            'chart_right': width - padding_right,
            'chart_bottom': height - padding_bottom,
            'label_rect_width': 40 * scale,
            'label_rect_height': 20 * scale,
            'font_size_label': 11 * scale,
            'font_size_time': 10 * scale,
            'problems': problems,
            'time_markers': time_markers,
            'points': points,
        }
        return render_to_string('exports/components/scatter_chart.svg', context)

    def _generate_cumulative_chart_svg(self, submissions: List[SubmissionDTO]) -> str:
        """Generate SVG line chart showing cumulative solved problems over time."""
        if not submissions:
            return self._empty_chart_svg(self.get_label('no_submissions'))

        scale = self.scale
        width = 700 * scale
        height = 220 * scale
        padding_left = 50 * scale
        padding_right = 50 * scale
        padding_top = 20 * scale
        padding_bottom = 60 * scale
        chart_width = width - padding_left - padding_right
        chart_height = height - padding_top - padding_bottom
        chart_bottom = height - padding_bottom

        # Get problem scores and calculate cumulative AC
        contest_problems = self.data_service.get_contest_problems()
        problem_scores = {cp.problem_id: cp.score for cp in contest_problems}
        start_time = self.contest.start_time or self.contest.created_at
        end_time = self.contest.end_time or timezone.now()
        time_range = (end_time - start_time).total_seconds() or 3600

        ac_problems = set()
        cumulative_score = 0
        solved_points = [(0, 0)]
        score_points = [(0, 0)]

        for sub in submissions:
            if sub.status == 'AC' and sub.problem_id not in ac_problems:
                ac_problems.add(sub.problem_id)
                cumulative_score += problem_scores.get(sub.problem_id, 0)
                ratio = min((sub.created_at - start_time).total_seconds() / time_range, 1.0)
                solved_points.append((ratio, len(ac_problems)))
                score_points.append((ratio, cumulative_score))

        solved_points.append((1.0, len(ac_problems)))
        score_points.append((1.0, cumulative_score))
        max_solved = max(p[1] for p in solved_points) or 1
        max_score = max(p[1] for p in score_points) or 1

        # Build grid lines and labels
        h_grid_lines = [{'y': padding_top + (chart_height * i / 4)} for i in range(5)]
        is_chinese = self.language.startswith('zh')

        time_markers = []
        for i in range(5):
            x = padding_left + (i / 4) * chart_width
            time_minutes = int((time_range / 60) * (i / 4))
            time_markers.append({
                'x': x,
                'label': f"{time_minutes // 60}:{time_minutes % 60:02d}",
                'label_y': chart_bottom + 15 * scale,
            })

        left_labels = [{'x': padding_left - 8 * scale, 'y': padding_top + (chart_height * i / 4) + 4 * scale, 'value': int(max_solved * (4 - i) / 4)} for i in range(5)]
        right_labels = [{'x': width - padding_right + 8 * scale, 'y': padding_top + (chart_height * i / 4) + 4 * scale, 'value': int(max_score * (4 - i) / 4)} for i in range(5)]

        # Generate paths
        def make_path_points(points, max_val):
            return [f"{padding_left + r * chart_width},{chart_bottom - (v / max_val) * chart_height}" for r, v in points]

        solved_pts = make_path_points(solved_points, max_solved)
        score_pts = make_path_points(score_points, max_score)

        context = {
            'width': width, 'height': height,
            'padding_left': padding_left, 'padding_top': padding_top,
            'chart_right': width - padding_right, 'chart_bottom': chart_bottom,
            'font_size_small': 10 * scale,
            'h_grid_lines': h_grid_lines, 'time_markers': time_markers,
            'left_labels': left_labels, 'right_labels': right_labels,
            'x_axis_label': "時間 (時:分)" if is_chinese else "Time (h:mm)",
            'x_axis_label_x': padding_left + chart_width / 2,
            'x_axis_label_y': height - 5 * scale,
            'solved_area_path': f"M{padding_left},{chart_bottom} L" + " L".join(solved_pts) + f" L{width - padding_right},{chart_bottom} Z" if len(solved_pts) > 1 else '',
            'solved_line_path': "M" + " L".join(solved_pts) if len(solved_pts) > 1 else '',
            'score_area_path': f"M{padding_left},{chart_bottom} L" + " L".join(score_pts) + f" L{width - padding_right},{chart_bottom} Z" if len(score_pts) > 1 else '',
            'score_line_path': "M" + " L".join(score_pts) if len(score_pts) > 1 else '',
            'line_width': 2 * scale, 'line_width_thick': 2.5 * scale,
            'legend_y': height - 38 * scale, 'legend_text_y': height - 35 * scale,
            'legend_rect_width': 12 * scale, 'legend_rect_height': 3 * scale,
            'legend_solved_x': padding_left, 'legend_solved_text_x': padding_left + 16 * scale,
            'legend_score_x': padding_left + 80 * scale, 'legend_score_text_x': padding_left + 96 * scale,
            'solved_label': "解題數" if is_chinese else "Solved",
            'score_label': "累計分數" if is_chinese else "Score",
        }
        return render_to_string('exports/components/cumulative_chart.svg', context)

    def _empty_chart_svg(self, message: str) -> str:
        """Generate placeholder SVG when no data available."""
        scale = self.scale
        width = 700 * scale
        height = 150 * scale
        context = {
            'width': width,
            'height': height,
            'text_x': width / 2,
            'text_y': height / 2,
            'font_size': 14 * scale,
            'message': message,
        }
        return render_to_string('exports/components/empty_chart.svg', context)

    def _get_report_styles(self) -> str:
        """
        Get complete CSS styles for the student report.
        Backward-compatible method that combines base and report styles.
        """
        base_css = self._get_base_css()
        report_css = self._get_report_css()
        return f"{base_css}\n{report_css}"
