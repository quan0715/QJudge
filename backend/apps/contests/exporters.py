"""
Exporters for contest data to various formats (Markdown, PDF).
"""
import markdown
import re
from io import BytesIO
from typing import List, Optional
from weasyprint import HTML

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
                    'input': tc.input,
                    'output': tc.output,
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
    """Export contest to PDF format."""
    
    def export(self) -> BytesIO:
        """Generate PDF content for the contest."""
        # First generate markdown
        md_exporter = MarkdownExporter(self.contest, self.language)
        markdown_content = md_exporter.export()
        
        # Convert markdown to HTML
        html_content = markdown.markdown(
            markdown_content,
            extensions=['extra', 'codehilite', 'tables', 'fenced_code']
        )
        
        # Wrap in HTML template with styling
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>{self.contest.name}</title>
            <style>
                @page {{
                    size: A4;
                    margin: 2cm;
                }}
                body {{
                    font-family: "Noto Sans TC", "Microsoft JhengHei", "Arial", sans-serif;
                    line-height: 1.6;
                    color: #333;
                    font-size: 12pt;
                }}
                h1 {{
                    font-size: 24pt;
                    border-bottom: 2px solid #333;
                    padding-bottom: 10px;
                    margin-top: 0;
                }}
                h2 {{
                    font-size: 18pt;
                    margin-top: 20px;
                    page-break-before: auto;
                }}
                h3 {{
                    font-size: 14pt;
                    margin-top: 15px;
                }}
                h4 {{
                    font-size: 12pt;
                    margin-top: 10px;
                }}
                code, pre {{
                    font-family: "Courier New", monospace;
                    background-color: #f4f4f4;
                    padding: 2px 4px;
                    border-radius: 3px;
                }}
                pre {{
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    overflow-x: auto;
                    page-break-inside: avoid;
                }}
                strong {{
                    font-weight: bold;
                }}
                hr {{
                    border: none;
                    border-top: 1px solid #ccc;
                    margin: 20px 0;
                }}
                .page-break {{
                    page-break-after: always;
                    height: 1px;
                }}
                table {{
                    border-collapse: collapse;
                    width: 100%;
                    margin: 10px 0;
                }}
                th, td {{
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }}
                th {{
                    background-color: #f4f4f4;
                }}
            </style>
        </head>
        <body>
            {html_content}
        </body>
        </html>
        """
        
        # Generate PDF
        pdf_file = BytesIO()
        HTML(string=full_html).write_pdf(pdf_file)
        pdf_file.seek(0)
        
        return pdf_file
