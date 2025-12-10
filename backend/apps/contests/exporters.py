"""
Exporters for contest data to various formats (Markdown, PDF).
"""
import markdown
import re
from io import BytesIO
from typing import List, Optional

from .models import Contest, ContestProblem
from apps.problems.models import Problem


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a string to be safe for use as a filename.
    Removes or replaces characters that are not allowed in filenames.
    """
    # Remove or replace invalid characters
    filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', filename)
    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')
    # Limit length
    if len(filename) > 200:
        filename = filename[:200]
    # Ensure not empty
    if not filename:
        filename = 'contest'
    return filename


class ContestExporter:
    """Base class for contest exporters."""
    
    def __init__(self, contest: Contest, language: str = 'zh-TW'):
        self.contest = contest
        self.language = language
    
    def get_contest_problems(self) -> List[ContestProblem]:
        """Get all problems in the contest, ordered."""
        return ContestProblem.objects.filter(
            contest=self.contest
        ).select_related('problem').prefetch_related(
            'problem__translations',
            'problem__test_cases',
            'problem__tags'
        ).order_by('order')

    def get_problem_label(self, contest_problem: ContestProblem) -> str:
        """Return the display label for a contest problem (A, B, ...)."""
        return contest_problem.label or chr(65 + contest_problem.order)
    
    def format_problem_content(self, problem: Problem, label: str) -> dict:
        """Format a problem's content for export."""
        # Find translation for the specified language
        translation = problem.translations.filter(language=self.language).first()
        
        # Fallback to first available translation if language not found
        if not translation and problem.translations.exists():
            translation = problem.translations.first()
        
        # Get sample test cases
        sample_cases = problem.test_cases.filter(is_sample=True).order_by('id')
        
        return {
            'label': label,
            'title': translation.title if translation else problem.title,
            'description': translation.description if translation else '',
            'input_description': translation.input_description if translation else '',
            'output_description': translation.output_description if translation else '',
            'hint': translation.hint if translation else '',
            'time_limit': problem.time_limit,
            'memory_limit': problem.memory_limit,
            'difficulty': problem.get_difficulty_display(),
            'sample_cases': [
                {
                    'input': tc.input_data,
                    'output': tc.output_data,
                }
                for tc in sample_cases
            ],
            'tags': [tag.name for tag in problem.tags.all()]
        }


class MarkdownExporter(ContestExporter):
    """Export contest to Markdown format."""
    
    def export(self) -> str:
        """Generate markdown content for the contest."""
        lines = []

        # Contest header
        lines.append(f"# {self.contest.name}")
        lines.append("")

        # Contest info
        lines.append("## Contest Information")
        lines.append("")
        lines.append(f"**Name:** {self.contest.name}")

        lines.append("")
        lines.append("### Description")
        lines.append("")
        if self.contest.description:
            lines.append(self.contest.description)
        else:
            lines.append("_No description provided._")
        lines.append("")

        if self.contest.start_time:
            lines.append(f"**Start Time:** {self.contest.start_time.strftime('%Y-%m-%d %H:%M')}")
        if self.contest.end_time:
            lines.append(f"**End Time:** {self.contest.end_time.strftime('%Y-%m-%d %H:%M')}")
        lines.append("")

        lines.append("### Rules")
        lines.append("")
        if self.contest.rules:
            lines.append(self.contest.rules)
        else:
            lines.append("_No rules provided._")
        lines.append("")

        # Problems
        contest_problems = self.get_contest_problems()

        if contest_problems:
            lines.append("---")
            lines.append("")
            lines.append("## Problems")
            lines.append("")

            for idx, cp in enumerate(contest_problems):
                label = self.get_problem_label(cp)
                problem_data = self.format_problem_content(cp.problem, label)

                # Problem header
                lines.append(f"## Problem {problem_data['label']}: {problem_data['title']}")
                lines.append("")
                
                # Metadata
                lines.append(f"**Difficulty:** {problem_data['difficulty']}")
                lines.append(f"**Time Limit:** {problem_data['time_limit']}ms")
                lines.append(f"**Memory Limit:** {problem_data['memory_limit']}MB")
                
                if problem_data['tags']:
                    tags_str = ", ".join(problem_data['tags'])
                    lines.append(f"**Tags:** {tags_str}")
                
                lines.append("")
                
                # Description
                if problem_data['description']:
                    lines.append("### Description")
                    lines.append("")
                    lines.append(problem_data['description'])
                    lines.append("")
                
                # Input Description
                if problem_data['input_description']:
                    lines.append("### Input Description")
                    lines.append("")
                    lines.append(problem_data['input_description'])
                    lines.append("")
                
                # Output Description
                if problem_data['output_description']:
                    lines.append("### Output Description")
                    lines.append("")
                    lines.append(problem_data['output_description'])
                    lines.append("")
                
                # Sample cases
                if problem_data['sample_cases']:
                    lines.append("### Sample Test Cases")
                    lines.append("")
                    
                    for idx, tc in enumerate(problem_data['sample_cases'], 1):
                        lines.append(f"#### Example {idx}")
                        lines.append("")
                        lines.append("**Input:**")
                        lines.append("```")
                        lines.append(tc['input'] or "(empty)")
                        lines.append("```")
                        lines.append("")
                        lines.append("**Output:**")
                        lines.append("```")
                        lines.append(tc['output'] or "(empty)")
                        lines.append("```")
                        lines.append("")
                
                # Hint
                if problem_data['hint']:
                    lines.append("### Hint")
                    lines.append("")
                    lines.append(problem_data['hint'])
                    lines.append("")

                # Insert an explicit page break between problems for PDF output
                if idx < len(contest_problems) - 1:
                    lines.append("<div class=\"page-break\"></div>")
                    lines.append("")

                lines.append("---")
                lines.append("")
        
        return "\n".join(lines)


class PDFExporter(ContestExporter):
    """Export contest to PDF format with frontend-matching styles."""
    
    def get_css_styles(self) -> str:
        """Get CSS styles matching the frontend design."""
        return """
            @page {
                size: A4;
                margin: 1.5cm;
            }
            * {
                box-sizing: border-box;
            }
            body {
                font-family: "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", "Helvetica Neue", Arial, sans-serif;
                line-height: 1.6;
                color: #161616;
                font-size: 10pt;
                margin: 0;
                padding: 0;
            }
            
            /* Headers */
            h1 {
                font-size: 22pt;
                font-weight: 600;
                border-bottom: 2px solid #0f62fe;
                padding-bottom: 8px;
                margin: 0 0 16px 0;
                color: #161616;
            }
            h2 {
                font-size: 16pt;
                font-weight: 600;
                margin: 20px 0 12px 0;
                color: #161616;
                page-break-after: avoid;
            }
            h3 {
                font-size: 12pt;
                font-weight: 600;
                margin: 16px 0 8px 0;
                color: #161616;
            }
            h4 {
                font-size: 10pt;
                font-weight: 600;
                margin: 12px 0 6px 0;
                color: #525252;
            }
            
            /* Container card */
            .container-card {
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                margin-bottom: 16px;
                overflow: hidden;
                page-break-inside: avoid;
            }
            .container-card-header {
                background-color: #f4f4f4;
                padding: 10px 16px;
                border-bottom: 1px solid #e0e0e0;
                font-weight: 600;
                font-size: 11pt;
            }
            .container-card-body {
                padding: 16px;
            }
            
            /* Problem table */
            .problem-table {
                width: 100%;
                border-collapse: collapse;
                margin: 12px 0;
            }
            .problem-table th {
                background-color: #f4f4f4;
                border: 1px solid #e0e0e0;
                padding: 10px 12px;
                text-align: left;
                font-weight: 600;
                font-size: 10pt;
            }
            .problem-table td {
                border: 1px solid #e0e0e0;
                padding: 10px 12px;
                font-size: 10pt;
            }
            .problem-table tr:nth-child(even) {
                background-color: #fafafa;
            }
            .problem-table .total-row {
                font-weight: 600;
                background-color: #f4f4f4;
            }
            
            /* Sample test case card */
            .sample-case {
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                margin-bottom: 12px;
                overflow: hidden;
                page-break-inside: avoid;
            }
            .sample-case-header {
                background-color: #f4f4f4;
                padding: 8px 12px;
                border-bottom: 1px solid #e0e0e0;
                font-weight: 600;
                font-size: 10pt;
                color: #161616;
            }
            .sample-case-content {
                display: table;
                width: 100%;
            }
            .sample-case-column {
                display: table-cell;
                width: 50%;
                padding: 12px;
                vertical-align: top;
            }
            .sample-case-column:first-child {
                border-right: 1px solid #e0e0e0;
            }
            .sample-case-label {
                font-weight: 600;
                font-size: 9pt;
                color: #6f6f6f;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
            }
            
            /* Code blocks */
            pre, code {
                font-family: "IBM Plex Mono", "SF Mono", "Monaco", "Inconsolata", "Fira Mono", monospace;
            }
            pre {
                background-color: #f4f4f4;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                padding: 10px;
                margin: 0;
                overflow-x: auto;
                font-size: 9pt;
                line-height: 1.5;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            code {
                background-color: #f4f4f4;
                padding: 2px 4px;
                border-radius: 3px;
                font-size: 9pt;
            }
            
            /* Tags */
            .tag {
                display: inline-block;
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 9pt;
                font-family: "IBM Plex Mono", monospace;
                margin-right: 6px;
                margin-bottom: 4px;
            }
            .tag-green {
                background-color: #a7f0ba;
                color: #044317;
            }
            .tag-red {
                background-color: #ffd7d9;
                color: #750e13;
            }
            
            /* Info box */
            .info-box {
                background-color: #edf5ff;
                border-left: 4px solid #0f62fe;
                padding: 12px 16px;
                margin: 12px 0;
            }
            .warning-box {
                background-color: #fcf4d6;
                border-left: 4px solid #f1c21b;
                padding: 12px 16px;
                margin: 12px 0;
            }
            
            /* Metadata */
            .metadata {
                color: #525252;
                font-size: 9pt;
                margin-bottom: 12px;
            }
            .metadata-item {
                display: inline-block;
                margin-right: 16px;
            }
            
            /* Page break */
            .page-break {
                page-break-after: always;
            }
            
            /* Problem section */
            .problem-section {
                margin-bottom: 24px;
            }
            .problem-header {
                background: linear-gradient(135deg, #0f62fe 0%, #0043ce 100%);
                color: white;
                padding: 12px 16px;
                border-radius: 4px 4px 0 0;
                margin-bottom: 0;
            }
            .problem-body {
                border: 1px solid #e0e0e0;
                border-top: none;
                border-radius: 0 0 4px 4px;
                padding: 16px;
            }
            
            /* Lists in markdown */
            ul, ol {
                margin: 8px 0;
                padding-left: 24px;
            }
            li {
                margin-bottom: 4px;
            }
        """

    def render_problem_table(self) -> str:
        """Render the problem structure table."""
        contest_problems = self.get_contest_problems()
        if not contest_problems:
            return ""
        
        total_score = 0
        rows = []
        for cp in contest_problems:
            label = self.get_problem_label(cp)
            problem_data = self.format_problem_content(cp.problem, label)
            score = getattr(cp, 'score', 0) or 0
            total_score += score
            rows.append(f"""
                <tr>
                    <td>{label}</td>
                    <td>{problem_data['title']}</td>
                    <td style="text-align: center;">{score}</td>
                </tr>
            """)
        
        return f"""
            <div class="container-card">
                <div class="container-card-header">題目結構</div>
                <div class="container-card-body" style="padding: 0;">
                    <table class="problem-table">
                        <thead>
                            <tr>
                                <th style="width: 60px;">題目</th>
                                <th>主題</th>
                                <th style="width: 60px; text-align: center;">配分</th>
                            </tr>
                        </thead>
                        <tbody>
                            {"".join(rows)}
                            <tr class="total-row">
                                <td colspan="2">Total</td>
                                <td style="text-align: center;">{total_score}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        """

    def render_sample_cases(self, sample_cases: list) -> str:
        """Render sample test cases in card format."""
        if not sample_cases:
            return ""
        
        lang = self.language
        cases_html = []
        for idx, tc in enumerate(sample_cases, 1):
            input_label = "輸入" if lang.startswith('zh') else "Input"
            output_label = "輸出" if lang.startswith('zh') else "Output"
            example_label = f"範例 {idx}" if lang.startswith('zh') else f"Example {idx}"
            
            cases_html.append(f"""
                <div class="sample-case">
                    <div class="sample-case-header">{example_label}</div>
                    <div class="sample-case-content">
                        <div class="sample-case-column">
                            <div class="sample-case-label">{input_label}</div>
                            <pre>{tc['input'] or '(空)'}</pre>
                        </div>
                        <div class="sample-case-column">
                            <div class="sample-case-label">{output_label}</div>
                            <pre>{tc['output'] or '(空)'}</pre>
                        </div>
                    </div>
                </div>
            """)
        
        section_title = "範例測試" if lang.startswith('zh') else "Sample Test Cases"
        return f"""
            <h3>{section_title}</h3>
            {"".join(cases_html)}
        """

    def render_keyword_restrictions(self, problem) -> str:
        """Render keyword restriction tags."""
        required = getattr(problem, 'required_keywords', []) or []
        forbidden = getattr(problem, 'forbidden_keywords', []) or []
        
        if not required and not forbidden:
            return ""
        
        lang = self.language
        section_title = "程式碼限制" if lang.startswith('zh') else "Code Restrictions"
        required_label = "必須包含的關鍵字：" if lang.startswith('zh') else "Required Keywords:"
        forbidden_label = "禁止使用的關鍵字：" if lang.startswith('zh') else "Forbidden Keywords:"
        
        html_parts = [f"<h3>{section_title}</h3>"]
        
        if required:
            tags = "".join([f'<span class="tag tag-green">{kw}</span>' for kw in required])
            html_parts.append(f"""
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 6px; color: #525252;">{required_label}</div>
                    <div>{tags}</div>
                </div>
            """)
        
        if forbidden:
            tags = "".join([f'<span class="tag tag-red">{kw}</span>' for kw in forbidden])
            html_parts.append(f"""
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 6px; color: #525252;">{forbidden_label}</div>
                    <div>{tags}</div>
                </div>
            """)
        
        return "\n".join(html_parts)

    def render_oj_environment(self) -> str:
        """Render the OJ environment info section."""
        lang = self.language
        title = "OJ 環境" if lang.startswith('zh') else "OJ Environment"
        
        return f"""
            <div class="container-card">
                <div class="container-card-header">{title}</div>
                <div class="container-card-body">
                    <ul style="margin: 0; padding-left: 20px;">
                        <li><strong>編譯器：</strong><code>g++ 11</code></li>
                        <li><strong>編譯指令：</strong><code>g++ -std=c++11 -o main main.cpp</code></li>
                        <li><strong>輸入輸出：</strong>使用 <code>cin</code> / <code>cout</code>，不要印出提示文字</li>
                        <li><strong>評分：</strong>嚴格比對輸出（注意空格、換行、大小寫）</li>
                    </ul>
                </div>
            </div>
        """

    def render_problem(self, cp, idx: int, total: int) -> str:
        """Render a single problem section."""
        label = self.get_problem_label(cp)
        problem = cp.problem
        problem_data = self.format_problem_content(problem, label)
        
        lang = self.language
        desc_title = "題目描述" if lang.startswith('zh') else "Description"
        input_title = "輸入說明" if lang.startswith('zh') else "Input Description"
        output_title = "輸出說明" if lang.startswith('zh') else "Output Description"
        hint_title = "提示" if lang.startswith('zh') else "Hint"
        
        # Convert markdown descriptions to HTML
        description_html = markdown.markdown(problem_data['description'] or '', extensions=['extra', 'tables'])
        input_html = markdown.markdown(problem_data['input_description'] or '', extensions=['extra', 'tables'])
        output_html = markdown.markdown(problem_data['output_description'] or '', extensions=['extra', 'tables'])
        hint_html = markdown.markdown(problem_data['hint'] or '', extensions=['extra', 'tables'])
        
        sections = []
        
        # Metadata (use text instead of emoji for PDF compatibility)
        time_label = "Time" if not lang.startswith('zh') else "時限"
        mem_label = "Memory" if not lang.startswith('zh') else "記憶體"
        diff_label = "Difficulty" if not lang.startswith('zh') else "難度"
        sections.append(f"""
            <div class="metadata">
                <span class="metadata-item"><strong>{time_label}:</strong> {problem_data['time_limit']}ms</span>
                <span class="metadata-item"><strong>{mem_label}:</strong> {problem_data['memory_limit']}MB</span>
                <span class="metadata-item"><strong>{diff_label}:</strong> {problem_data['difficulty']}</span>
            </div>
        """)
        
        # Description
        if description_html:
            sections.append(f"<h3>{desc_title}</h3>{description_html}")
        
        # Input/Output descriptions
        if input_html:
            sections.append(f"<h3>{input_title}</h3>{input_html}")
        if output_html:
            sections.append(f"<h3>{output_title}</h3>{output_html}")
        
        # Sample cases
        sections.append(self.render_sample_cases(problem_data['sample_cases']))
        
        # Hint
        if hint_html:
            sections.append(f"<h3>{hint_title}</h3>{hint_html}")
        
        # Keyword restrictions
        sections.append(self.render_keyword_restrictions(problem))
        
        # Page break for next problem (except last one)
        page_break = '<div class="page-break"></div>' if idx < total - 1 else ''
        
        return f"""
            <div class="problem-section">
                <h2 class="problem-header">Problem {label}: {problem_data['title']}</h2>
                <div class="problem-body">
                    {"".join(sections)}
                </div>
            </div>
            {page_break}
        """

    def export(self) -> BytesIO:
        """Generate PDF content for the contest."""
        lang = self.language
        
        # Contest header
        contest_name = self.contest.name
        
        # Rules section
        rules_html = ""
        if self.contest.rules:
            rules_title = "競賽規則" if lang.startswith('zh') else "Contest Rules"
            rules_content = markdown.markdown(self.contest.rules, extensions=['extra', 'tables'])
            rules_html = f"""
                <div class="container-card">
                    <div class="container-card-header">{rules_title}</div>
                    <div class="container-card-body">{rules_content}</div>
                </div>
            """
        
        # Problem table
        problem_table_html = self.render_problem_table()
        
        # Problems
        contest_problems = self.get_contest_problems()
        problems_html = ""
        if contest_problems:
            problems_title = "題目" if lang.startswith('zh') else "Problems"
            problem_sections = []
            for idx, cp in enumerate(contest_problems):
                problem_sections.append(self.render_problem(cp, idx, len(contest_problems)))
            
            problems_html = f"""
                <div class="page-break"></div>
                <h1>{problems_title}</h1>
                {"".join(problem_sections)}
            """
        
        # Full HTML
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>{contest_name}</title>
            <style>{self.get_css_styles()}</style>
        </head>
        <body>
            <h1>{contest_name}</h1>
            {rules_html}
            {problem_table_html}
            {problems_html}
        </body>
        </html>
        """
        
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
        HTML(string=full_html).write_pdf(pdf_file)
        pdf_file.seek(0)
        
        return pdf_file

