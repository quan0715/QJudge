"""
Exporters for contest data to various formats (Markdown, PDF).
"""
import markdown
import re
from io import BytesIO
from typing import List, Optional, Dict, Any
from datetime import datetime

from django.utils import timezone
from django.contrib.auth import get_user_model

from .models import Contest, ContestProblem, ContestParticipant
from apps.problems.models import Problem
from apps.submissions.models import Submission

User = get_user_model()


def inline_markdown(text: str) -> str:
    """
    Parse inline markdown (bold, italic, code) and return HTML without block-level wrappers.
    Useful for titles and single-line text that should support formatting.
    """
    if not text:
        return ""
    # Parse markdown
    html = markdown.markdown(text, extensions=['extra'])
    # Remove paragraph tags for inline use
    html = re.sub(r'^<p>(.*)</p>$', r'\1', html.strip(), flags=re.DOTALL)
    return html


def preprocess_markdown_html(text: str) -> str:
    """
    Preprocess markdown text to add 'markdown=1' attribute to HTML block tags.
    This enables markdown parsing inside HTML blocks when using md_in_html extension.
    """
    if not text:
        return ""
    # Add markdown="1" to common block-level HTML tags that should allow markdown inside
    # Match opening tags like <aside>, <div>, <section> etc. and add markdown="1"
    html_block_tags = ['aside', 'div', 'section', 'article', 'blockquote', 'details', 'summary']
    for tag in html_block_tags:
        # Replace <tag> with <tag markdown="1"> (only if no markdown attr already)
        text = re.sub(
            rf'<({tag})(\s*)>',
            rf'<\1 markdown="1">',
            text,
            flags=re.IGNORECASE
        )
        # Also handle tags with existing attributes
        text = re.sub(
            rf'<({tag})\s+(?!markdown=)([\w\s="\']+)>',
            rf'<\1 markdown="1" \2>',
            text,
            flags=re.IGNORECASE
        )
    return text


def ensure_markdown_lists(text: str) -> str:
    """
    Ensure that list items (starting with - or *) are preceded by a blank line.
    This fixes issues where lists are rendered as inline text.
    """
    if not text:
        return ""
    # Look for non-empty line followed immediately by a list item on the next line
    return re.sub(r'([^\n])\n(\s*[\-\*]\s+)', r'\1\n\n\2', text)



def render_markdown(text: str) -> str:
    """
    Full markdown rendering with proper handling of HTML blocks.
    """
    if not text:
        return ""
    # Ensure lists are preceded by blank lines
    text = ensure_markdown_lists(text)
    # Preprocess to enable markdown inside HTML blocks
    text = preprocess_markdown_html(text)
    # Render with all necessary extensions
    return markdown.markdown(text, extensions=['extra', 'tables', 'sane_lists', 'md_in_html', 'nl2br'])


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
        """Get all problems in the contest, ordered, with score annotation."""
        from django.db.models import Sum
        return ContestProblem.objects.filter(
            contest=self.contest
        ).select_related('problem').prefetch_related(
            'problem__translations',
            'problem__test_cases',
            'problem__tags'
        ).annotate(
            problem_score_sum=Sum('problem__test_cases__score')
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
    
    def __init__(self, contest: Contest, language: str = 'zh-TW', scale: float = 1.0):
        super().__init__(contest, language)
        # Clamp scale between 0.5 and 2.0 for reasonable values
        self.scale = max(0.5, min(2.0, scale))
    
    def get_css_styles(self) -> str:
        """Get CSS styles matching the frontend Carbon Design System."""
        # Calculate scaled values
        scale = self.scale
        
        # Base sizes (in px at scale=1.0)
        base_font = 14 * scale
        h1_size = 32 * scale
        h2_size = 28 * scale
        h3_size = 20 * scale
        h4_size = 16 * scale
        h5_size = 14 * scale
        h6_size = 12 * scale
        code_size = 12 * scale
        code_block_size = 14 * scale
        
        # Spacing (in px at scale=1.0)
        margin_sm = 4 * scale
        margin_md = 8 * scale
        margin_lg = 12 * scale
        margin_xl = 16 * scale
        margin_xxl = 24 * scale
        padding_sm = 2 * scale
        padding_md = 4 * scale
        padding_lg = 8 * scale
        padding_xl = 16 * scale
        padding_list = 32 * scale
        
        # Page margin (in cm)
        page_margin = 1.5
        
        return f"""
            /* ============================================
               IBM Carbon Design System - PDF Export Styles
               Matching frontend markdown.css
               https://carbondesignsystem.com/guidelines/typography
               Scale: {scale}x
               ============================================ */
            
            @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400&family=Noto+Sans+TC:wght@400;600&display=swap');
            
            @page {{
                size: A4;
                margin: {page_margin}cm;
            }}
            * {{
                box-sizing: border-box;
            }}
            
            /* Base body - Carbon body-compact-01 */
            body {{
                font-family: "IBM Plex Sans", "Noto Sans TC", "Microsoft JhengHei", system-ui, -apple-system, sans-serif;
                font-size: {base_font}px;
                font-weight: 400;
                line-height: 1.42857;
                letter-spacing: 0.16px;
                color: #161616;
                margin: 0;
                padding: 0;
            }}
            
            /* ============================================
               Headings - Carbon productive heading tokens
               ============================================ */
            
            /* h1 - productive-heading-05 */
            h1 {{
                font-size: {h1_size}px;
                font-weight: 400;
                line-height: 1.25;
                letter-spacing: 0;
                border-bottom: {2 * scale}px solid #0f62fe;
                padding-bottom: {padding_lg}px;
                margin: 0 0 {margin_xl}px 0;
                color: #161616;
            }}
            
            /* h2 - productive-heading-04 */
            h2 {{
                font-size: {h2_size}px;
                font-weight: 400;
                line-height: 1.28572;
                letter-spacing: 0;
                margin: {margin_xxl}px 0 {margin_lg}px 0;
                color: #161616;
                page-break-after: avoid;
            }}
            
            /* h3 - productive-heading-03 */
            h3 {{
                font-size: {h3_size}px;
                font-weight: 400;
                line-height: 1.4;
                letter-spacing: 0;
                margin: {20 * scale}px 0 {margin_md}px 0;
                color: #161616;
            }}
            
            /* h4 - productive-heading-02 */
            h4 {{
                font-size: {h4_size}px;
                font-weight: 600;
                line-height: 1.375;
                letter-spacing: 0;
                margin: {margin_xl}px 0 {margin_md}px 0;
                color: #161616;
            }}
            
            /* h5 - productive-heading-01 */
            h5 {{
                font-size: {h5_size}px;
                font-weight: 600;
                line-height: 1.28572;
                letter-spacing: 0.16px;
                margin: {margin_xl}px 0 {margin_md}px 0;
                color: #161616;
            }}
            
            /* h6 - label-01 */
            h6 {{
                font-size: {h6_size}px;
                font-weight: 400;
                line-height: 1.33333;
                letter-spacing: 0.32px;
                margin: {margin_xl}px 0 {margin_md}px 0;
                color: #525252;
            }}
            
            /* ============================================
               Paragraphs - Carbon body-long-01
               ============================================ */
            p {{
                font-size: {base_font}px;
                line-height: 1.42857;
                letter-spacing: 0.16px;
                margin: 0 0 {margin_xl}px 0;
                color: #161616;
            }}
            
            /* ============================================
               Lists - Following Carbon guidelines
               ============================================ */
            ul, ol {{
                margin: 0 0 {margin_xl}px 0;
                padding-left: {padding_list}px;
                color: #161616;
                list-style-position: outside;
            }}
            ul {{ list-style-type: disc; }}
            ol {{ list-style-type: decimal; }}
            ul ul {{ list-style-type: circle; }}
            ul ul ul {{ list-style-type: square; }}
            ol ol {{ list-style-type: lower-alpha; }}
            ol ol ol {{ list-style-type: lower-roman; }}
            
            li {{
                margin-bottom: {margin_sm}px;
                font-size: {base_font}px;
                line-height: 1.42857;
            }}
            
            ul ul, ol ol, ul ol, ol ul {{
                margin-top: {margin_sm}px;
                margin-bottom: {margin_sm}px;
            }}
            
            /* ============================================
               Code - Carbon code tokens
               ============================================ */
            
            pre, code {{
                font-family: "IBM Plex Mono", "SF Mono", "Monaco", monospace;
            }}
            
            /* Inline code - code-01 with red text (Carbon support-error) */
            code {{
                font-size: {code_size}px;
                line-height: 1.33333;
                letter-spacing: 0.32px;
                background-color: #f4f4f4;
                padding: {padding_sm}px {padding_md}px;
                border-radius: {2 * scale}px;
                color: #da1e28;
                font-weight: 400;
            }}
            
            /* Code blocks - code-02 */
            pre {{
                background-color: #f4f4f4;
                padding: {padding_xl}px;
                border-radius: {4 * scale}px;
                overflow-x: auto;
                margin: 0 0 {margin_xl}px 0;
                border: 1px solid #e0e0e0;
            }}
            
            pre code {{
                background-color: transparent;
                padding: 0;
                border-radius: 0;
                color: #161616;
                font-size: {code_block_size}px;
                line-height: 1.42857;
                font-weight: 400;
                white-space: pre-wrap;
                word-wrap: break-word;
            }}
            
            /* ============================================
               Links - Carbon link tokens
               ============================================ */
            a {{
                color: #0f62fe;
                text-decoration: none;
            }}
            a:hover {{
                text-decoration: underline;
            }}
            
            /* ============================================
               Tables - IBM Cloud Docs style (Carbon)
               ============================================ */
            table {{
                border-collapse: collapse;
                width: 100%;
                margin: 0 0 {margin_xl}px 0;
                border: none;
                font-size: {base_font}px;
            }}
            
            table th, table td {{
                padding: {margin_lg}px {margin_xl}px;
                text-align: left;
                border: none;
                border-bottom: 1px solid #e0e0e0;
            }}
            
            table th {{
                background-color: transparent;
                font-weight: 600;
                color: #525252;
                font-size: {h6_size}px;
                letter-spacing: 0.32px;
                text-transform: uppercase;
                border-bottom: 1px solid #8d8d8d;
            }}
            
            table tr:nth-child(even) {{
                background-color: transparent;
            }}
            
            /* ============================================
               Blockquotes
               ============================================ */
            blockquote {{
                border-left: {4 * scale}px solid #0f62fe;
                padding-left: {margin_xl}px;
                margin-left: 0;
                margin-bottom: {margin_xl}px;
                color: #525252;
                font-style: normal;
            }}
            blockquote p {{
                color: #525252;
            }}
            
            /* ============================================
               Horizontal rules
               ============================================ */
            hr {{
                border: none;
                border-top: 1px solid #e0e0e0;
                margin: {margin_xxl}px 0;
            }}
            
            /* ============================================
               Strong and emphasis
               ============================================ */
            strong {{
                font-weight: 600;
                color: #161616;
            }}
            em {{
                font-style: italic;
            }}
            
            /* ============================================
               Container card
               ============================================ */
            .container-card {{
                margin-bottom: {margin_xl}px;
                page-break-inside: avoid;
            }}
            .container-card-header {{
                font-weight: 600;
                font-size: {base_font}px;
                margin-bottom: {margin_md}px;
                padding-bottom: {6 * scale}px;
                border-bottom: 1px solid #e0e0e0;
            }}
            .container-card-body {{
                padding: 0;
            }}
            
            /* ============================================
               Problem table
               ============================================ */
            .problem-table {{
                width: 100%;
                border-collapse: collapse;
                margin: {margin_lg}px 0;
            }}
            .problem-table th {{
                background-color: transparent;
                border: none;
                border-bottom: 1px solid #8d8d8d;
                padding: {margin_lg}px {margin_xl}px;
                text-align: left;
                font-weight: 600;
                font-size: {h6_size}px;
                color: #525252;
                text-transform: uppercase;
                letter-spacing: 0.32px;
            }}
            .problem-table td {{
                border: none;
                border-bottom: 1px solid #e0e0e0;
                padding: {margin_lg}px {margin_xl}px;
                font-size: {base_font}px;
            }}
            .problem-table tr:nth-child(even) {{
                background-color: transparent;
            }}
            .problem-table .total-row {{
                font-weight: 600;
                border-top: 1px solid #8d8d8d;
            }}
            
            /* ============================================
               Sample test case card
               ============================================ */
            .sample-case {{
                border: 1px solid #e0e0e0;
                border-radius: {4 * scale}px;
                margin-bottom: {margin_lg}px;
                overflow: hidden;
                page-break-inside: avoid;
            }}
            .sample-case-header {{
                background-color: #f4f4f4;
                padding: {padding_lg}px {padding_xl}px;
                border-bottom: 1px solid #e0e0e0;
                font-weight: 600;
                font-size: {base_font}px;
                color: #161616;
            }}
            .sample-case-content {{
                display: table;
                width: 100%;
            }}
            .sample-case-column {{
                display: table-cell;
                width: 50%;
                padding: {padding_xl}px;
                vertical-align: top;
            }}
            .sample-case-column:first-child {{
                border-right: 1px solid #e0e0e0;
            }}
            .sample-case-label {{
                font-weight: 600;
                font-size: {h6_size}px;
                color: #525252;
                text-transform: uppercase;
                letter-spacing: 0.32px;
                margin-bottom: {margin_md}px;
            }}
            
            /* ============================================
               Tags
               ============================================ */
            .tag {{
                display: inline-block;
                padding: {margin_sm}px {margin_md}px;
                border-radius: {4 * scale}px;
                font-size: {h6_size}px;
                font-family: "IBM Plex Mono", monospace;
                margin-right: {margin_md}px;
                margin-bottom: {margin_sm}px;
            }}
            .tag-green {{
                background-color: #a7f0ba;
                color: #044317;
            }}
            .tag-red {{
                background-color: #ffd7d9;
                color: #750e13;
            }}
            
            /* ============================================
               Info/Warning/Error/Success boxes
               ============================================ */
            .info-box {{
                background-color: #edf5ff;
                border-left: {3 * scale}px solid #0f62fe;
                padding: {margin_lg}px {margin_xl}px;
                margin: {margin_lg}px 0;
                min-height: {48 * scale}px;
            }}
            .warning-box {{
                background-color: #fcf4d6;
                border-left: {3 * scale}px solid #f1c21b;
                padding: {margin_lg}px {margin_xl}px;
                margin: {margin_lg}px 0;
                min-height: {48 * scale}px;
            }}
            .error-box {{
                background-color: #fff1f1;
                border-left: {3 * scale}px solid #da1e28;
                padding: {margin_lg}px {margin_xl}px;
                margin: {margin_lg}px 0;
                min-height: {48 * scale}px;
            }}
            .success-box {{
                background-color: #defbe6;
                border-left: {3 * scale}px solid #24a148;
                padding: {margin_lg}px {margin_xl}px;
                margin: {margin_lg}px 0;
                min-height: {48 * scale}px;
            }}
            
            /* ============================================
               Metadata
               ============================================ */
            .metadata {{
                color: #525252;
                font-size: {h6_size}px;
                margin-bottom: {margin_lg}px;
            }}
            .metadata-item {{
                display: inline-block;
                margin-right: {margin_xl}px;
            }}
            
            /* ============================================
               Page break
               ============================================ */
            .page-break {{
                page-break-after: always;
            }}
            
            /* ============================================
               Problem section
               ============================================ */
            .problem-section {{
                margin-bottom: {margin_xxl}px;
            }}
            .problem-header {{
                border-left: {4 * scale}px solid #0f62fe;
                padding-left: {margin_lg}px;
                margin-bottom: {margin_lg}px;
            }}
            .problem-body {{
                padding: 0 0 0 {margin_xl}px;
            }}
            
            /* ============================================
               Aside / Callout blocks - IBM Carbon Notification Style
               https://carbondesignsystem.com/components/notification/style
               ============================================ */
            aside {{
                display: block;
                min-height: {48 * scale}px;
                padding: {margin_lg}px {margin_xl}px;
                margin: {margin_xl}px 0;
                background-color: #edf5ff;
                border-left: {3 * scale}px solid #0f62fe;
                border-radius: 0;
                color: #161616;
                font-size: {base_font}px;
                line-height: 1.42857;
                page-break-inside: avoid;
            }}
            aside p {{
                margin: 0;
            }}
            aside p + p {{
                margin-top: {margin_md}px;
            }}
            aside p:first-child {{
                margin-top: 0;
            }}
            aside p:last-child {{
                margin-bottom: 0;
            }}
            /* Aside title - heading-compact-01 */
            aside strong:first-child,
            aside p:first-child strong:first-child {{
                font-weight: 600;
                font-size: {base_font}px;
                line-height: 1.28572;
            }}
            /* Info (default) - Blue */
            aside.info, aside.note {{
                background-color: #edf5ff;
                border-left-color: #0f62fe;
            }}
            /* Warning - Yellow */
            aside.warning, aside.caution {{
                background-color: #fcf4d6;
                border-left-color: #f1c21b;
            }}
            /* Error/Danger - Red */
            aside.error, aside.danger {{
                background-color: #fff1f1;
                border-left-color: #da1e28;
            }}
            /* Success/Tip - Green */
            aside.success, aside.tip {{
                background-color: #defbe6;
                border-left-color: #24a148;
            }}
            /* Inline code inside aside - keep red styling */
            aside code {{
                background-color: rgba(0, 0, 0, 0.05);
                color: #da1e28;
            }}
            /* Lists inside aside */
            aside ul, aside ol {{
                margin: {margin_md}px 0;
                padding-left: {margin_xxl}px;
            }}
            aside li {{
                margin-bottom: {margin_sm}px;
            }}
            
            /* Exam mode notice */
            .exam-notice {{
                background-color: #fcf4d6;
                border-left: {4 * scale}px solid #f1c21b;
                padding: {margin_xl}px;
                margin-bottom: {margin_xl}px;
                display: table;
                width: 100%;
                page-break-inside: avoid;
            }}
            .exam-notice-icon {{
                display: table-cell;
                width: {40 * scale}px;
                font-size: {24 * scale}pt;
                vertical-align: top;
            }}
            .exam-notice-content {{
                display: table-cell;
                vertical-align: top;
            }}
            .exam-notice-title {{
                font-weight: 600;
                font-size: {11 * scale}pt;
                margin-bottom: {margin_md}px;
            }}
            .exam-notice p {{
                margin: {6 * scale}px 0;
                font-size: {10 * scale}pt;
            }}
            .warning-text {{
                color: #8a3800;
            }}
            
            /* Exam time info */
            .exam-time-info {{
                background-color: #e0e0e0;
                padding: {10 * scale}px {margin_xl}px;
                margin-bottom: {margin_xl}px;
                font-size: {10 * scale}pt;
                border-radius: {4 * scale}px;
            }}
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
            # Use annotated problem_score_sum from test cases
            score = cp.problem_score_sum or 0
            total_score += score
            # Use inline_markdown for title to support bold/italic formatting
            title_html = inline_markdown(problem_data['title'])
            rows.append(f"""
                <tr>
                    <td>{label}</td>
                    <td>{title_html}</td>
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
        
        # Convert markdown descriptions to HTML using render_markdown for proper HTML block handling
        description_html = render_markdown(problem_data['description'] or '')
        input_html = render_markdown(problem_data['input_description'] or '')
        output_html = render_markdown(problem_data['output_description'] or '')
        hint_html = render_markdown(problem_data['hint'] or '')
        
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
        
        # Contest header - parse inline markdown for formatting
        contest_name = inline_markdown(self.contest.name)
        contest_name_plain = self.contest.name  # For <title> tag
        
        # Exam mode notice
        exam_notice_html = ""
        if self.contest.exam_mode_enabled:
            # First box: Warning (Yellow) - exam rules
            # Second box: Info (Blue) - anti-cheating policy

            if lang.startswith('zh'):
                exam_notice_html = """
                <aside class="warning">
                    <p><strong>重要提醒</strong></p>
                    <ul>
                        <li>禁止使用手機</li>
                        <li>禁止上網查資料</li>
                        <li>禁止使用 AI 工具（ChatGPT、Copilot 等）</li>
                        <li>禁止抄襲或分享程式碼</li>
                        <li>可以攜帶<strong>紙本小抄</strong>（A4 單面一張）</li>
                    </ul>
                </aside>
                <aside class="info">
                    <p><strong>QJudge 防作弊機制</strong></p>
                    <p>本次考試使用 <strong>QJudge OJ</strong> 進行，系統會偵測跳離視窗等異常行為。</p>
                    <p>若被系統偵測到可疑行為，且監考助教判定<strong>並非誤觸</strong>，將會<strong>直接鎖定至考試結束</strong>，無法繼續作答！請專心作答，避免不必要的視窗切換。</p>
                </aside>
                """
            else:
                exam_notice_html = """
                <aside class="warning">
                    <p><strong>Important Notice</strong></p>
                    <ul>
                        <li>No phones allowed</li>
                        <li>No internet search</li>
                        <li>No AI tools (ChatGPT, Copilot, etc.)</li>
                        <li>No plagiarism or code sharing</li>
                        <li><strong>One A4 cheat sheet</strong> allowed</li>
                    </ul>
                </aside>
                <aside class="info">
                    <p><strong>QJudge Anti-Cheating Policy</strong></p>
                    <p>This exam uses <strong>QJudge OJ</strong> with automatic monitoring. Suspicious behavior like switching windows will be detected.</p>
                    <p>If confirmed as intentional, your exam will be <strong>locked immediately</strong> and you will not be able to continue. Please stay focused.</p>
                </aside>
                """
        
        # Rules section
        rules_html = ""
        if self.contest.rules:
            rules_title = "競賽規則" if lang.startswith('zh') else "Contest Rules"
            rules_content = render_markdown(self.contest.rules)
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
        
        # Exam time info
        exam_time_html = ""
        if self.contest.start_time and self.contest.end_time:
            from django.utils import timezone
            start = timezone.localtime(self.contest.start_time)
            end = timezone.localtime(self.contest.end_time)
            duration = (self.contest.end_time - self.contest.start_time).total_seconds() / 60
            
            if lang.startswith('zh'):
                time_label = "考試時間"
                duration_label = "時長"
                start_str = start.strftime('%Y/%m/%d %H:%M')
                end_str = end.strftime('%H:%M')
                duration_str = f"{int(duration)} 分鐘"
            else:
                time_label = "Exam Time"
                duration_label = "Duration"
                start_str = start.strftime('%Y/%m/%d %H:%M')
                end_str = end.strftime('%H:%M')
                duration_str = f"{int(duration)} minutes"
            
            exam_time_html = f"""
                <div class="exam-time-info">
                    <strong>{time_label}：</strong>{start_str} ~ {end_str}（{duration_label}：{duration_str}）
                </div>
            """
        
        # Full HTML - exam notice after rules
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>{contest_name_plain}</title>
            <style>{self.get_css_styles()}</style>
        </head>
        <body>
            <h1>{contest_name}</h1>
            {exam_time_html}
            {exam_notice_html}
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


class StudentReportExporter:
    """
    Export individual student exam report to PDF.
    Includes score summary, difficulty stats, problem details with AC code,
    ranking, and submission trend charts.
    """
    
    # Carbon Design System color palette for charts
    CHART_COLORS = [
        '#0f62fe',  # Blue (Problem A)
        '#24a148',  # Green (Problem B)
        '#8a3ffc',  # Purple (Problem C)
        '#ff832b',  # Orange (Problem D)
        '#1192e8',  # Cyan (Problem E)
        '#fa4d56',  # Red (Problem F)
        '#009d9a',  # Teal (Problem G)
        '#a56eff',  # Violet (Problem H)
    ]
    
    def __init__(self, contest: Contest, user: User, language: str = 'zh-TW', scale: float = 1.0):
        self.contest = contest
        self.user = user
        self.language = language
        self.scale = max(0.5, min(2.0, scale))
        self._submissions_cache = None
        self._standings_cache = None
    
    def get_contest_problems(self) -> List[ContestProblem]:
        """Get all problems in the contest with score annotation."""
        from django.db.models import Sum
        return ContestProblem.objects.filter(
            contest=self.contest
        ).select_related('problem').prefetch_related(
            'problem__translations',
            'problem__test_cases'
        ).annotate(
            problem_score_sum=Sum('problem__test_cases__score')
        ).order_by('order')
    
    def get_user_submissions(self) -> List[Submission]:
        """Get all submissions for this user in this contest."""
        if self._submissions_cache is None:
            self._submissions_cache = list(
                Submission.objects.filter(
                    contest=self.contest,
                    user=self.user,
                    source_type='contest',
                    is_test=False
                ).select_related('problem').order_by('created_at')
            )
        return self._submissions_cache
    
    def calculate_standings(self) -> Dict[str, Any]:
        """
        Calculate standings data for all participants.
        Returns dict with user's rank, total participants, and full standings.
        """
        if self._standings_cache is not None:
            return self._standings_cache
        
        from django.db.models import Sum
        
        contest_problems = self.get_contest_problems()
        participants = ContestParticipant.objects.filter(
            contest=self.contest
        ).select_related('user')
        
        # Get all contest submissions
        all_submissions = Submission.objects.filter(
            contest=self.contest,
            source_type='contest',
            is_test=False
        ).order_by('created_at')
        
        # Build stats for each participant
        stats = {}
        for p in participants:
            stats[p.user.id] = {
                'user_id': p.user.id,
                'username': p.user.username,
                'solved': 0,
                'total_score': 0,
                'penalty': 0,
                'problems': {}
            }
            for cp in contest_problems:
                stats[p.user.id]['problems'][cp.problem.id] = {
                    'status': None,
                    'score': 0,
                    'tries': 0,
                    'time': 0,
                    'max_score': cp.problem_score_sum or 0
                }
        
        # Process submissions
        for sub in all_submissions:
            uid = sub.user.id
            pid = sub.problem.id
            if uid not in stats or pid not in stats[uid]['problems']:
                continue
            
            p_stat = stats[uid]['problems'][pid]
            
            # Skip if already AC
            if p_stat['status'] == 'AC':
                continue
            
            if sub.status in ['pending', 'judging']:
                continue
            
            p_stat['tries'] += 1
            max_score = p_stat['max_score']
            
            if sub.status == 'AC':
                p_stat['status'] = 'AC'
                start_time = self.contest.start_time or self.contest.created_at
                time_diff = sub.created_at - start_time
                minutes = int(time_diff.total_seconds() / 60)
                p_stat['time'] = minutes
                
                stats[uid]['solved'] += 1
                penalty = minutes + 20 * (p_stat['tries'] - 1)
                stats[uid]['penalty'] += penalty
                
                score_diff = max_score - p_stat['score']
                p_stat['score'] = max_score
                stats[uid]['total_score'] += score_diff
            else:
                p_stat['status'] = sub.status
                submission_score = sub.score or 0
                if submission_score > p_stat['score']:
                    score_diff = submission_score - p_stat['score']
                    p_stat['score'] = submission_score
                    stats[uid]['total_score'] += score_diff
        
        # Sort standings
        standings_list = list(stats.values())
        standings_list.sort(key=lambda x: (-x['solved'], x['penalty']))
        
        for i, item in enumerate(standings_list):
            item['rank'] = i + 1
        
        # Find current user's rank
        user_rank = None
        user_stats = None
        for item in standings_list:
            if item['user_id'] == self.user.id:
                user_rank = item['rank']
                user_stats = item
                break
        
        self._standings_cache = {
            'rank': user_rank,
            'total_participants': len(standings_list),
            'user_stats': user_stats,
            'standings': standings_list
        }
        return self._standings_cache
    
    def get_problem_label(self, contest_problem: ContestProblem) -> str:
        """Return the display label for a contest problem (A, B, ...)."""
        return contest_problem.label or chr(65 + contest_problem.order)
    
    def get_last_ac_submission(self, problem_id: int) -> Optional[Submission]:
        """Get the last AC submission for a problem."""
        submissions = self.get_user_submissions()
        ac_submissions = [
            s for s in submissions 
            if s.problem_id == problem_id and s.status == 'AC'
        ]
        return ac_submissions[-1] if ac_submissions else None
    
    def highlight_code(self, code: str, language: str = 'cpp') -> str:
        """Apply syntax highlighting to code using Pygments with Carbon-style theme."""
        try:
            from pygments import highlight
            from pygments.lexers import get_lexer_by_name, TextLexer
            from pygments.formatters import HtmlFormatter
            
            # Map submission language to Pygments lexer
            lexer_map = {
                'cpp': 'cpp',
                'c': 'c',
                'python': 'python3',
                'java': 'java',
            }
            lexer_name = lexer_map.get(language, 'text')
            
            try:
                lexer = get_lexer_by_name(lexer_name)
            except Exception:
                lexer = TextLexer()
            
            # Custom Carbon-style formatter
            formatter = HtmlFormatter(
                style='default',
                noclasses=True,
                linenos=True,
                linenostart=1,
                lineanchors='line',
                linespans='line',
                nowrap=False,
            )
            
            highlighted = highlight(code, lexer, formatter)
            return highlighted
        except ImportError:
            # Fallback if Pygments not available
            import html
            return f'<pre><code>{html.escape(code)}</code></pre>'
    
    def get_carbon_code_styles(self) -> str:
        """Get CSS for Pygments with Carbon Design System colors."""
        scale = self.scale
        return f"""
            /* Pygments syntax highlighting - Carbon-inspired */
            .highlight {{
                background-color: #f4f4f4;
                border: 1px solid #e0e0e0;
                border-radius: {4 * scale}px;
                padding: {12 * scale}px;
                margin: {8 * scale}px 0 {16 * scale}px 0;
                overflow-x: auto;
                font-family: "IBM Plex Mono", "SF Mono", monospace;
                font-size: {12 * scale}px;
                line-height: 1.5;
            }}
            .highlight pre {{
                margin: 0;
                padding: 0;
                background: transparent;
                border: none;
                white-space: pre-wrap;
                word-wrap: break-word;
            }}
            .highlight .linenos {{
                color: #8d8d8d;
                padding-right: {12 * scale}px;
                border-right: 1px solid #e0e0e0;
                margin-right: {12 * scale}px;
                user-select: none;
            }}
            /* Carbon-style syntax colors */
            .highlight .k {{ color: #0f62fe; font-weight: 600; }}  /* Keyword */
            .highlight .kd {{ color: #0f62fe; font-weight: 600; }} /* Keyword declaration */
            .highlight .kt {{ color: #8a3ffc; }}                   /* Keyword type */
            .highlight .n {{ color: #161616; }}                    /* Name */
            .highlight .nf {{ color: #0043ce; }}                   /* Function name */
            .highlight .nc {{ color: #8a3ffc; }}                   /* Class name */
            .highlight .s {{ color: #198038; }}                    /* String */
            .highlight .s1 {{ color: #198038; }}                   /* String single */
            .highlight .s2 {{ color: #198038; }}                   /* String double */
            .highlight .c {{ color: #6f6f6f; font-style: italic; }} /* Comment */
            .highlight .c1 {{ color: #6f6f6f; font-style: italic; }} /* Comment single */
            .highlight .cm {{ color: #6f6f6f; font-style: italic; }} /* Comment multiline */
            .highlight .cp {{ color: #da1e28; }}                   /* Preprocessor */
            .highlight .mi {{ color: #8a3ffc; }}                   /* Number integer */
            .highlight .mf {{ color: #8a3ffc; }}                   /* Number float */
            .highlight .o {{ color: #161616; }}                    /* Operator */
            .highlight .p {{ color: #161616; }}                    /* Punctuation */
            .highlight .err {{ color: #da1e28; background: #fff1f1; }} /* Error */
        """
    
    def generate_scatter_chart_svg(self, submissions: List[Submission], 
                                   contest_problems: List[ContestProblem]) -> str:
        """Generate SVG scatter chart showing submission timeline by problem."""
        if not submissions:
            return self._empty_chart_svg("無提交記錄" if self.language.startswith('zh') else "No submissions")
        
        scale = self.scale
        # Wider chart for better visualization
        width = 700 * scale
        height = 280 * scale
        padding_left = 60 * scale
        padding_right = 40 * scale
        padding_top = 30 * scale
        padding_bottom = 60 * scale
        
        # Create problem color map
        problem_colors = {}
        problem_labels = {}
        for i, cp in enumerate(contest_problems):
            problem_colors[cp.problem.id] = self.CHART_COLORS[i % len(self.CHART_COLORS)]
            problem_labels[cp.problem.id] = self.get_problem_label(cp)
        
        # Calculate time range
        start_time = self.contest.start_time or self.contest.created_at
        end_time = self.contest.end_time or timezone.now()
        time_range = (end_time - start_time).total_seconds()
        
        if time_range <= 0:
            time_range = 3600  # Default 1 hour
        
        chart_width = width - padding_left - padding_right
        chart_height = height - padding_top - padding_bottom
        
        svg_parts = [f'''
            <svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" 
                 xmlns="http://www.w3.org/2000/svg" style="font-family: IBM Plex Sans, sans-serif;">
                <!-- Background -->
                <rect width="{width}" height="{height}" fill="#ffffff"/>
        ''']
        
        # Add horizontal grid lines for each problem
        num_problems = len(contest_problems)
        for i, cp in enumerate(contest_problems):
            y = padding_top + ((i + 0.5) / num_problems) * chart_height
            color = problem_colors[cp.problem.id]
            label = problem_labels[cp.problem.id]
            
            # Horizontal guide line
            svg_parts.append(f'''
                <line x1="{padding_left}" y1="{y}" x2="{width - padding_right}" y2="{y}" 
                      stroke="#e0e0e0" stroke-dasharray="2,4" stroke-opacity="0.5"/>
            ''')
            
            # Problem label on Y axis
            svg_parts.append(f'''
                <rect x="{padding_left - 45 * scale}" y="{y - 10 * scale}" 
                      width="{40 * scale}" height="{20 * scale}" fill="{color}" rx="4"/>
                <text x="{padding_left - 25 * scale}" y="{y + 4 * scale}" 
                      font-size="{11 * scale}px" fill="#ffffff" text-anchor="middle" 
                      font-weight="600">{label}</text>
            ''')
        
        # Add vertical time markers
        time_labels = []
        for i in range(5):
            x = padding_left + (i / 4) * chart_width
            time_minutes = int((time_range / 60) * (i / 4))
            hours = time_minutes // 60
            minutes = time_minutes % 60
            time_label = f"{hours}:{minutes:02d}"
            
            svg_parts.append(f'''
                <line x1="{x}" y1="{padding_top}" x2="{x}" y2="{height - padding_bottom}" 
                      stroke="#e0e0e0" stroke-dasharray="4,4"/>
                <text x="{x}" y="{height - padding_bottom + 15 * scale}" 
                      font-size="{10 * scale}px" fill="#525252" text-anchor="middle">{time_label}</text>
            ''')
        
        # Add axes
        svg_parts.append(f'''
            <line x1="{padding_left}" y1="{height - padding_bottom}" 
                  x2="{width - padding_right}" y2="{height - padding_bottom}" 
                  stroke="#8d8d8d" stroke-width="1"/>
            <line x1="{padding_left}" y1="{padding_top}" 
                  x2="{padding_left}" y2="{height - padding_bottom}" 
                  stroke="#8d8d8d" stroke-width="1"/>
        ''')
        
        # X axis label
        time_label_text = "時間 (時:分)" if self.language.startswith('zh') else "Time (h:mm)"
        svg_parts.append(f'''
            <text x="{padding_left + chart_width / 2}" y="{height - 10 * scale}" 
                  font-size="{11 * scale}px" fill="#525252" text-anchor="middle">{time_label_text}</text>
        ''')
        
        # Plot submissions with color coding
        for sub in submissions:
            time_offset = (sub.created_at - start_time).total_seconds()
            x = padding_left + (time_offset / time_range) * chart_width
            
            # Y position based on problem order
            problem_idx = 0
            for i, cp in enumerate(contest_problems):
                if cp.problem.id == sub.problem_id:
                    problem_idx = i
                    break
            
            y = padding_top + ((problem_idx + 0.5) / num_problems) * chart_height
            color = problem_colors.get(sub.problem_id, '#8d8d8d')
            
            # Different shapes for AC vs non-AC
            if sub.status == 'AC':
                # Filled circle for AC with glow effect
                svg_parts.append(f'''
                    <circle cx="{x}" cy="{y}" r="{8 * scale}" fill="{color}" fill-opacity="0.2"/>
                    <circle cx="{x}" cy="{y}" r="{6 * scale}" fill="{color}" 
                            stroke="#ffffff" stroke-width="2"/>
                ''')
            else:
                # Hollow circle with X for non-AC
                svg_parts.append(f'''
                    <circle cx="{x}" cy="{y}" r="{5 * scale}" fill="#ffffff" 
                            stroke="{color}" stroke-width="2" stroke-opacity="0.6"/>
                    <line x1="{x - 3 * scale}" y1="{y - 3 * scale}" 
                          x2="{x + 3 * scale}" y2="{y + 3 * scale}" 
                          stroke="{color}" stroke-width="1.5" stroke-opacity="0.6"/>
                    <line x1="{x + 3 * scale}" y1="{y - 3 * scale}" 
                          x2="{x - 3 * scale}" y2="{y + 3 * scale}" 
                          stroke="{color}" stroke-width="1.5" stroke-opacity="0.6"/>
                ''')
        
        # Add legend at bottom
        legend_y = height - 25 * scale
        legend_start_x = padding_left
        svg_parts.append(f'''
            <circle cx="{legend_start_x}" cy="{legend_y}" r="{5 * scale}" fill="#0f62fe"/>
            <text x="{legend_start_x + 10 * scale}" y="{legend_y + 4 * scale}" 
                  font-size="{10 * scale}px" fill="#525252">AC</text>
            <circle cx="{legend_start_x + 50 * scale}" cy="{legend_y}" r="{4 * scale}" 
                    fill="#ffffff" stroke="#8d8d8d" stroke-width="2"/>
            <text x="{legend_start_x + 60 * scale}" y="{legend_y + 4 * scale}" 
                  font-size="{10 * scale}px" fill="#525252">{'未通過' if self.language.startswith('zh') else 'Failed'}</text>
        ''')
        
        svg_parts.append('</svg>')
        return ''.join(svg_parts)
    
    def generate_cumulative_chart_svg(self, submissions: List[Submission]) -> str:
        """Generate SVG line chart showing cumulative solved problems over time with time axis."""
        scale = self.scale
        # Wider to match scatter chart
        width = 700 * scale
        height = 200 * scale
        padding_left = 50 * scale
        padding_right = 30 * scale
        padding_top = 20 * scale
        padding_bottom = 50 * scale
        
        if not submissions:
            return self._empty_chart_svg("無提交記錄" if self.language.startswith('zh') else "No submissions")
        
        # Calculate cumulative AC count over time
        start_time = self.contest.start_time or self.contest.created_at
        end_time = self.contest.end_time or timezone.now()
        time_range = (end_time - start_time).total_seconds()
        
        if time_range <= 0:
            time_range = 3600
        
        ac_problems = set()
        data_points = [(0, 0)]  # (time_offset_ratio, count)
        
        for sub in submissions:
            if sub.status == 'AC' and sub.problem_id not in ac_problems:
                ac_problems.add(sub.problem_id)
                time_offset = (sub.created_at - start_time).total_seconds()
                ratio = min(time_offset / time_range, 1.0)
                data_points.append((ratio, len(ac_problems)))
        
        # Add final point at end
        data_points.append((1.0, len(ac_problems)))
        
        max_count = max(p[1] for p in data_points) or 1
        chart_width = width - padding_left - padding_right
        chart_height = height - padding_top - padding_bottom
        
        svg_parts = [f'''
            <svg width="{width}" height="{height}" viewBox="0 0 {width} {height}"
                 xmlns="http://www.w3.org/2000/svg" style="font-family: IBM Plex Sans, sans-serif;">
                <rect width="{width}" height="{height}" fill="#ffffff"/>
        ''']
        
        # Horizontal grid lines
        for i in range(5):
            y = padding_top + (chart_height * i / 4)
            svg_parts.append(f'''
                <line x1="{padding_left}" y1="{y}" x2="{width - padding_right}" y2="{y}" 
                      stroke="#e0e0e0" stroke-dasharray="4,4"/>
            ''')
        
        # Vertical time markers (same as scatter chart)
        for i in range(5):
            x = padding_left + (i / 4) * chart_width
            time_minutes = int((time_range / 60) * (i / 4))
            hours = time_minutes // 60
            minutes = time_minutes % 60
            time_label = f"{hours}:{minutes:02d}"
            
            svg_parts.append(f'''
                <line x1="{x}" y1="{padding_top}" x2="{x}" y2="{height - padding_bottom}" 
                      stroke="#e0e0e0" stroke-dasharray="4,4"/>
                <text x="{x}" y="{height - padding_bottom + 15 * scale}" 
                      font-size="{10 * scale}px" fill="#525252" text-anchor="middle">{time_label}</text>
            ''')
        
        # Axes
        svg_parts.append(f'''
            <line x1="{padding_left}" y1="{height - padding_bottom}" 
                  x2="{width - padding_right}" y2="{height - padding_bottom}" 
                  stroke="#8d8d8d" stroke-width="1"/>
            <line x1="{padding_left}" y1="{padding_top}" 
                  x2="{padding_left}" y2="{height - padding_bottom}" 
                  stroke="#8d8d8d" stroke-width="1"/>
        ''')
        
        # X-axis label
        time_label_text = "時間 (時:分)" if self.language.startswith('zh') else "Time (h:mm)"
        svg_parts.append(f'''
            <text x="{padding_left + chart_width / 2}" y="{height - 8 * scale}" 
                  font-size="{11 * scale}px" fill="#525252" text-anchor="middle">{time_label_text}</text>
        ''')
        
        # Y-axis labels
        for i in range(5):
            y = padding_top + (chart_height * i / 4)
            label_value = int(max_count * (4 - i) / 4)
            svg_parts.append(f'''
                <text x="{padding_left - 8 * scale}" y="{y + 4 * scale}" 
                      font-size="{10 * scale}px" fill="#525252" text-anchor="end">{label_value}</text>
            ''')
        
        # Y-axis label text
        solved_label = "解題數" if self.language.startswith('zh') else "Solved"
        svg_parts.append(f'''
            <text x="{12 * scale}" y="{padding_top + chart_height / 2}" 
                  font-size="{10 * scale}px" fill="#525252" text-anchor="middle"
                  transform="rotate(-90 {12 * scale} {padding_top + chart_height / 2})">{solved_label}</text>
        ''')
        
        # Generate path points
        path_points = []
        for ratio, count in data_points:
            x = padding_left + ratio * chart_width
            y = height - padding_bottom - (count / max_count) * chart_height
            path_points.append(f"{x},{y}")
        
        # Area fill - IBM Carbon blue with transparency
        area_path = f"M{padding_left},{height - padding_bottom} " + " L".join(path_points) + f" L{width - padding_right},{height - padding_bottom} Z"
        svg_parts.append(f'''
            <path d="{area_path}" fill="#0f62fe" fill-opacity="0.08"/>
        ''')
        
        # Line - IBM Carbon Blue 60
        line_path = "M" + " L".join(path_points)
        svg_parts.append(f'''
            <path d="{line_path}" fill="none" stroke="#0f62fe" stroke-width="{2 * scale}" 
                  stroke-linecap="round" stroke-linejoin="round"/>
        ''')
        
        # Points at AC moments
        for ratio, count in data_points[1:-1]:
            x = padding_left + ratio * chart_width
            y = height - padding_bottom - (count / max_count) * chart_height
            svg_parts.append(f'''
                <circle cx="{x}" cy="{y}" r="{4 * scale}" fill="#ffffff" 
                        stroke="#0f62fe" stroke-width="{2 * scale}"/>
            ''')
        
        svg_parts.append('</svg>')
        return ''.join(svg_parts)
    
    def _empty_chart_svg(self, message: str) -> str:
        """Generate placeholder SVG when no data available."""
        scale = self.scale
        width = 700 * scale
        height = 150 * scale
        return f'''
            <svg width="{width}" height="{height}" viewBox="0 0 {width} {height}"
                 xmlns="http://www.w3.org/2000/svg" style="font-family: IBM Plex Sans, sans-serif;">
                <rect width="{width}" height="{height}" fill="#f4f4f4" rx="4"/>
                <text x="{width/2}" y="{height/2}" font-size="{14 * scale}px" fill="#8d8d8d" 
                      text-anchor="middle" dominant-baseline="middle">{message}</text>
            </svg>
        '''
    
    def get_difficulty_stats(self) -> Dict[str, Dict[str, int]]:
        """Calculate difficulty statistics (easy/medium/hard solved vs total)."""
        contest_problems = self.get_contest_problems()
        standings = self.calculate_standings()
        user_stats = standings.get('user_stats', {})
        user_problems = user_stats.get('problems', {}) if user_stats else {}
        
        stats = {
            'easy': {'solved': 0, 'total': 0},
            'medium': {'solved': 0, 'total': 0},
            'hard': {'solved': 0, 'total': 0},
        }
        
        for cp in contest_problems:
            difficulty = cp.problem.difficulty or 'medium'
            if difficulty in stats:
                stats[difficulty]['total'] += 1
                
                # Check if user solved this problem
                problem_stat = user_problems.get(cp.problem.id, {})
                if problem_stat.get('status') == 'AC':
                    stats[difficulty]['solved'] += 1
        
        return stats
    
    def render_score_cards(self) -> str:
        """Render the 4-column score cards section."""
        scale = self.scale
        lang = self.language
        standings = self.calculate_standings()
        user_stats = standings.get('user_stats', {})
        
        total_score = user_stats.get('total_score', 0) if user_stats else 0
        solved = user_stats.get('solved', 0) if user_stats else 0
        rank = standings.get('rank', '-')
        total_participants = standings.get('total_participants', 0)
        
        # Count total problems
        contest_problems = self.get_contest_problems()
        total_problems = len(contest_problems)
        
        # Count submissions
        submissions = self.get_user_submissions()
        submission_count = len(submissions)
        
        # Calculate max possible score
        max_score = sum(cp.problem_score_sum or 0 for cp in contest_problems)
        
        # Determine if contest is finished
        is_finished = False
        if self.contest.end_time and timezone.now() > self.contest.end_time:
            is_finished = True
        
        rank_label = "最終排名" if is_finished else "當前排名"
        if not lang.startswith('zh'):
            rank_label = "Final Rank" if is_finished else "Current Rank"
        
        labels = {
            'score': '總分' if lang.startswith('zh') else 'Score',
            'solved': '解題數' if lang.startswith('zh') else 'Solved',
            'rank': rank_label,
            'submissions': '提交數' if lang.startswith('zh') else 'Submissions',
        }
        
        return f'''
            <div class="score-cards">
                <div class="score-card">
                    <div class="score-card-label">{labels['score']}</div>
                    <div class="score-card-value">{total_score}<span class="score-card-max">/{max_score}</span></div>
                </div>
                <div class="score-card">
                    <div class="score-card-label">{labels['solved']}</div>
                    <div class="score-card-value">{solved}<span class="score-card-max">/{total_problems}</span></div>
                </div>
                <div class="score-card">
                    <div class="score-card-label">{labels['rank']}</div>
                    <div class="score-card-value">#{rank}<span class="score-card-max">/{total_participants}</span></div>
                </div>
                <div class="score-card">
                    <div class="score-card-label">{labels['submissions']}</div>
                    <div class="score-card-value">{submission_count}</div>
                </div>
            </div>
        '''
    
    def render_difficulty_stats(self) -> str:
        """Render difficulty statistics with LeetCode-style donut charts."""
        scale = self.scale
        lang = self.language
        stats = self.get_difficulty_stats()
        
        # IBM Carbon colors
        difficulty_config = {
            'easy': ('簡單', '#24a148', '#a7f0ba'),      # Carbon green
            'medium': ('中等', '#f1c21b', '#fddc69'),    # Carbon yellow
            'hard': ('困難', '#da1e28', '#ffb3b8'),      # Carbon red
        }
        if not lang.startswith('zh'):
            difficulty_config = {
                'easy': ('Easy', '#24a148', '#a7f0ba'),
                'medium': ('Medium', '#f1c21b', '#fddc69'),
                'hard': ('Hard', '#da1e28', '#ffb3b8'),
            }
        
        title = '難度統計' if lang.startswith('zh') else 'Difficulty Statistics'
        
        # Generate donut charts for each difficulty
        donuts_html = []
        for difficulty in ['easy', 'medium', 'hard']:
            name, color, bg_color = difficulty_config[difficulty]
            solved = stats[difficulty]['solved']
            total = stats[difficulty]['total']
            percentage = (solved / total * 100) if total > 0 else 0
            
            # SVG donut chart parameters - Progress starts from top, goes clockwise
            size = 72 * scale
            stroke_width = 6 * scale
            radius = (size - stroke_width) / 2
            circumference = 2 * 3.14159 * radius
            # stroke-dashoffset: positive value = clockwise from start point
            dash_offset = circumference * (1 - percentage / 100)
            
            donut_svg = f'''
                <svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">
                    <!-- Background circle -->
                    <circle cx="{size/2}" cy="{size/2}" r="{radius}" 
                            fill="none" stroke="{bg_color}" stroke-width="{stroke_width}"/>
                    <!-- Progress circle - starts from top (transform rotate -90deg on the circle) -->
                    <circle cx="{size/2}" cy="{size/2}" r="{radius}" 
                            fill="none" stroke="{color}" stroke-width="{stroke_width}"
                            stroke-dasharray="{circumference}" stroke-dashoffset="{dash_offset}"
                            stroke-linecap="round"
                            transform="rotate(-90 {size/2} {size/2})"/>
                    <!-- Center text -->
                    <text x="{size/2}" y="{size/2 - 4*scale}" text-anchor="middle" 
                          font-size="{16*scale}px" font-weight="600" fill="#161616">{solved}</text>
                    <text x="{size/2}" y="{size/2 + 10*scale}" text-anchor="middle" 
                          font-size="{10*scale}px" fill="#6f6f6f">/{total}</text>
                </svg>
            '''
            
            donuts_html.append(f'''
                <div class="donut-item">
                    {donut_svg}
                    <div class="donut-label" style="color: {color};">{name}</div>
                </div>
            ''')
        
        return f'''
            <div class="container-card">
                <div class="container-card-header">{title}</div>
                <div class="container-card-body">
                    <div class="donut-container">
                        {''.join(donuts_html)}
                    </div>
                </div>
            </div>
        '''
    
    def render_problem_grid(self) -> str:
        """Render a grid showing submission status for each problem in 2 columns."""
        scale = self.scale
        lang = self.language
        
        contest_problems = self.get_contest_problems()
        standings = self.calculate_standings()
        user_stats = standings.get('user_stats', {})
        user_problems = user_stats.get('problems', {}) if user_stats else {}
        submissions = self.get_user_submissions()
        
        title = '題目繳交狀況' if lang.startswith('zh') else 'Problem Status'
        
        # Build problem submission details
        grid_items = []
        for i, cp in enumerate(contest_problems):
            problem = cp.problem
            label = self.get_problem_label(cp)
            color = self.CHART_COLORS[i % len(self.CHART_COLORS)]
            problem_stat = user_problems.get(problem.id, {})
            
            status = problem_stat.get('status', '')
            score = problem_stat.get('score', 0)
            max_score = problem_stat.get('max_score', 0)
            
            # Get problem submissions
            problem_submissions = [s for s in submissions if s.problem_id == problem.id]
            ac_count = sum(1 for s in problem_submissions if s.status == 'AC')
            wa_count = sum(1 for s in problem_submissions if s.status != 'AC')
            
            # IBM Carbon status styling
            if status == 'AC':
                status_icon = '✓'
                status_class = 'status-ac'
                row_bg = '#defbe6'  # Carbon green-10
            elif ac_count > 0 or wa_count > 0:
                status_icon = '✗'
                status_class = 'status-wa'
                row_bg = '#fff1f1'  # Carbon red-10
            else:
                status_icon = '—'
                status_class = 'status-none'
                row_bg = '#f4f4f4'  # Carbon gray-10
            
            grid_items.append(f'''
                <div class="problem-grid-row" style="background: {row_bg};">
                    <div class="problem-grid-label" style="background: {color};">{label}</div>
                    <div class="problem-grid-score">{score}<span class="score-max">/{max_score}</span></div>
                    <div class="problem-grid-stats">
                        <span class="stat-ac">{ac_count}</span>
                        <span class="stat-wa">{wa_count}</span>
                    </div>
                    <div class="problem-grid-status {status_class}">{status_icon}</div>
                </div>
            ''')
        
        # Split into 2 columns
        mid = (len(grid_items) + 1) // 2
        col1_items = grid_items[:mid]
        col2_items = grid_items[mid:]
        
        ac_label = 'AC' if not lang.startswith('zh') else 'AC'
        wa_label = 'WA' if not lang.startswith('zh') else 'WA'
        
        return f'''
            <div class="container-card">
                <div class="container-card-header">{title}</div>
                <div class="container-card-body" style="padding: {8*scale}px;">
                    <div class="problem-grid-header-row">
                        <div class="grid-col-label"></div>
                        <div class="grid-col-score">{'分數' if lang.startswith('zh') else 'Score'}</div>
                        <div class="grid-col-stats">{ac_label}/{wa_label}</div>
                        <div class="grid-col-status"></div>
                    </div>
                    <div class="problem-grid-columns">
                        <div class="problem-grid-col">
                            {''.join(col1_items)}
                        </div>
                        <div class="problem-grid-col">
                            {''.join(col2_items)}
                        </div>
                    </div>
                </div>
            </div>
        '''
    
    def render_trend_charts(self) -> str:
        """Render submission trend charts section."""
        scale = self.scale
        lang = self.language
        
        submissions = self.get_user_submissions()
        contest_problems = self.get_contest_problems()
        
        scatter_title = '提交時間分布' if lang.startswith('zh') else 'Submission Timeline'
        cumulative_title = '累計解題數' if lang.startswith('zh') else 'Cumulative Solved'
        
        scatter_svg = self.generate_scatter_chart_svg(submissions, contest_problems)
        cumulative_svg = self.generate_cumulative_chart_svg(submissions)
        
        return f'''
            <div class="container-card" style="margin-bottom: {16 * scale}px;">
                <div class="container-card-header">{scatter_title}</div>
                <div class="container-card-body chart-container" style="padding: {8 * scale}px;">
                    {scatter_svg}
                </div>
            </div>
            <div class="container-card">
                <div class="container-card-header">{cumulative_title}</div>
                <div class="container-card-body chart-container" style="padding: {8 * scale}px;">
                    {cumulative_svg}
                </div>
            </div>
        '''
    
    def render_problem_details(self) -> str:
        """Render detailed results for each problem including AC code."""
        scale = self.scale
        lang = self.language
        
        contest_problems = self.get_contest_problems()
        standings = self.calculate_standings()
        user_stats = standings.get('user_stats', {})
        user_problems = user_stats.get('problems', {}) if user_stats else {}
        submissions = self.get_user_submissions()
        
        title = '題目詳情' if lang.startswith('zh') else 'Problem Details'
        
        sections = [f'<h2>{title}</h2>']
        
        for cp in contest_problems:
            problem = cp.problem
            label = self.get_problem_label(cp)
            problem_stat = user_problems.get(problem.id, {})
            
            status = problem_stat.get('status') or '未作答'
            score = problem_stat.get('score', 0)
            max_score = problem_stat.get('max_score', 0)
            tries = problem_stat.get('tries', 0)
            
            # Get problem title
            translation = problem.translations.filter(language=self.language).first()
            if not translation and problem.translations.exists():
                translation = problem.translations.first()
            problem_title = translation.title if translation else problem.title
            
            # Status styling
            if status == 'AC':
                status_html = '<span class="status-ac">AC ✓</span>'
            elif status == '未作答':
                status_html = '<span class="status-none">未作答</span>'
            else:
                status_html = f'<span class="status-fail">{status}</span>'
            
            status_label = '狀態' if lang.startswith('zh') else 'Status'
            score_label = '得分' if lang.startswith('zh') else 'Score'
            tries_label = '提交' if lang.startswith('zh') else 'Tries'
            code_label = '通過的程式碼' if lang.startswith('zh') else 'Accepted Code'
            
            # Get AC code if available
            code_html = ''
            if status == 'AC':
                ac_submission = self.get_last_ac_submission(problem.id)
                if ac_submission and ac_submission.code:
                    highlighted_code = self.highlight_code(
                        ac_submission.code, 
                        ac_submission.language
                    )
                    code_html = f'''
                        <div class="code-section">
                            <div class="code-label">{code_label} ({ac_submission.language})</div>
                            {highlighted_code}
                        </div>
                    '''
            
            sections.append(f'''
                <div class="problem-detail-card">
                    <div class="problem-detail-header">
                        <span class="problem-label">{label}</span>
                        <span class="problem-title">{problem_title}</span>
                    </div>
                    <div class="problem-detail-body">
                        <div class="problem-stats">
                            <span class="stat-item"><strong>{status_label}:</strong> {status_html}</span>
                            <span class="stat-item"><strong>{score_label}:</strong> {score}/{max_score}</span>
                            <span class="stat-item"><strong>{tries_label}:</strong> {tries}次</span>
                        </div>
                        {code_html}
                    </div>
                </div>
            ''')
        
        return '\n'.join(sections)
    
    def get_report_styles(self) -> str:
        """Get CSS styles for the student report."""
        scale = self.scale
        
        # Get base styles from PDFExporter
        base_exporter = PDFExporter(self.contest, self.language, self.scale)
        base_styles = base_exporter.get_css_styles()
        
        # Add report-specific styles
        report_styles = f'''
            {base_styles}
            {self.get_carbon_code_styles()}
            
            /* Score Cards */
            .score-cards {{
                display: table;
                width: 100%;
                margin-bottom: {16 * scale}px;
                border-collapse: separate;
                border-spacing: {8 * scale}px;
            }}
            .score-card {{
                display: table-cell;
                width: 25%;
                background-color: #f4f4f4;
                border-radius: {4 * scale}px;
                padding: {16 * scale}px;
                text-align: center;
                vertical-align: top;
            }}
            .score-card-label {{
                font-size: {12 * scale}px;
                color: #525252;
                text-transform: uppercase;
                letter-spacing: 0.32px;
                margin-bottom: {8 * scale}px;
            }}
            .score-card-value {{
                font-size: {28 * scale}px;
                font-weight: 600;
                color: #161616;
            }}
            .score-card-max {{
                font-size: {14 * scale}px;
                font-weight: 400;
                color: #8d8d8d;
            }}
            
            /* Difficulty Stats - Donut Charts (LeetCode style) */
            .donut-container {{
                display: table;
                width: 100%;
                table-layout: fixed;
            }}
            .donut-item {{
                display: table-cell;
                text-align: center;
                padding: {4 * scale}px;
                vertical-align: top;
            }}
            .donut-label {{
                margin-top: {6 * scale}px;
                font-size: {12 * scale}px;
                font-weight: 600;
            }}
            
            /* Problem Grid - 2 Column Layout */
            .problem-grid-header-row {{
                display: none;
            }}
            .problem-grid-columns {{
                display: table;
                width: 100%;
                table-layout: fixed;
            }}
            .problem-grid-col {{
                display: table-cell;
                vertical-align: top;
                padding-right: {6 * scale}px;
            }}
            .problem-grid-col:last-child {{
                padding-right: 0;
                padding-left: {6 * scale}px;
            }}
            .problem-grid-row {{
                display: table;
                width: 100%;
                table-layout: fixed;
                margin-bottom: {4 * scale}px;
                border-radius: {4 * scale}px;
                overflow: hidden;
            }}
            .problem-grid-row > div {{
                display: table-cell;
                vertical-align: middle;
                padding: {6 * scale}px {4 * scale}px;
            }}
            .problem-grid-label {{
                width: {28 * scale}px;
                color: white;
                text-align: center;
                font-size: {11 * scale}px;
                font-weight: 600;
                border-radius: {2 * scale}px;
                padding: {4 * scale}px !important;
            }}
            .problem-grid-score {{
                width: {50 * scale}px;
                font-size: {13 * scale}px;
                font-weight: 600;
                color: #161616;
                text-align: center;
            }}
            .problem-grid-score .score-max {{
                font-size: {10 * scale}px;
                font-weight: 400;
                color: #6f6f6f;
            }}
            .problem-grid-stats {{
                width: {45 * scale}px;
                font-size: {10 * scale}px;
                text-align: center;
            }}
            .problem-grid-stats .stat-ac {{
                color: #24a148;
            }}
            .problem-grid-stats .stat-ac::after {{
                content: "/";
                color: #8d8d8d;
                margin: 0 {1 * scale}px;
            }}
            .problem-grid-stats .stat-wa {{
                color: #da1e28;
            }}
            .problem-grid-status {{
                width: {24 * scale}px;
                font-size: {14 * scale}px;
                font-weight: 700;
                text-align: center;
            }}
            .problem-grid-status.status-ac {{
                color: #24a148;
            }}
            .problem-grid-status.status-wa {{
                color: #da1e28;
            }}
            .problem-grid-status.status-none {{
                color: #8d8d8d;
            }}
            
            /* Stats Row - Side by Side Layout */
            .stats-row {{
                display: table;
                width: 100%;
                margin-bottom: {16 * scale}px;
                table-layout: fixed;
            }}
            .stats-col-left {{
                display: table-cell;
                width: 32%;
                vertical-align: top;
                padding-right: {12 * scale}px;
            }}
            .stats-col-right {{
                display: table-cell;
                width: 68%;
                vertical-align: top;
            }}
            
            /* Chart Container */
            .chart-container {{
                padding: {8 * scale}px;
                text-align: center;
            }}
            .chart-legend {{
                font-size: {11 * scale}px;
                color: #8d8d8d;
                margin-top: {8 * scale}px;
            }}
            
            /* Problem Detail Card */
            .problem-detail-card {{
                border: 1px solid #e0e0e0;
                border-radius: {4 * scale}px;
                margin-bottom: {16 * scale}px;
                overflow: hidden;
                page-break-inside: avoid;
            }}
            .problem-detail-header {{
                background-color: #f4f4f4;
                padding: {12 * scale}px {16 * scale}px;
                border-bottom: 1px solid #e0e0e0;
            }}
            .problem-label {{
                display: inline-block;
                background-color: #0f62fe;
                color: white;
                padding: {4 * scale}px {8 * scale}px;
                border-radius: {4 * scale}px;
                font-weight: 600;
                font-size: {12 * scale}px;
                margin-right: {8 * scale}px;
            }}
            .problem-title {{
                font-weight: 600;
                font-size: {16 * scale}px;
                color: #161616;
            }}
            .problem-detail-body {{
                padding: {16 * scale}px;
            }}
            .problem-stats {{
                display: flex;
                gap: {24 * scale}px;
                margin-bottom: {12 * scale}px;
                flex-wrap: wrap;
            }}
            .stat-item {{
                font-size: {14 * scale}px;
                color: #161616;
            }}
            .status-ac {{
                color: #24a148;
                font-weight: 600;
            }}
            .status-fail {{
                color: #da1e28;
                font-weight: 600;
            }}
            .status-none {{
                color: #8d8d8d;
            }}
            .code-section {{
                margin-top: {12 * scale}px;
            }}
            .code-label {{
                font-size: {12 * scale}px;
                color: #525252;
                text-transform: uppercase;
                letter-spacing: 0.32px;
                margin-bottom: {8 * scale}px;
            }}
            
            /* Report Header */
            .report-header {{
                margin-bottom: {24 * scale}px;
            }}
            .report-meta {{
                font-size: {12 * scale}px;
                color: #525252;
                margin-top: {8 * scale}px;
            }}
        '''
        return report_styles
    
    def export(self) -> BytesIO:
        """Generate PDF report for the student."""
        lang = self.language
        
        # Header info
        contest_name = inline_markdown(self.contest.name)
        student_name = self.user.username
        download_time = timezone.now().strftime('%Y/%m/%d %H:%M')
        
        report_title = '個人成績報告' if lang.startswith('zh') else 'Personal Score Report'
        student_label = '學生' if lang.startswith('zh') else 'Student'
        time_label = '報告產生時間' if lang.startswith('zh') else 'Generated'
        
        # Build report sections
        score_cards = self.render_score_cards()
        difficulty_stats = self.render_difficulty_stats()
        problem_grid = self.render_problem_grid()
        trend_charts = self.render_trend_charts()
        problem_details = self.render_problem_details()
        
        full_html = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>{report_title} - {student_name}</title>
            <style>{self.get_report_styles()}</style>
        </head>
        <body>
            <div class="report-header">
                <h1>{contest_name}</h1>
                <h2 style="margin-top: 8px; border: none; color: #525252;">{report_title}</h2>
                <div class="report-meta">
                    <strong>{student_label}:</strong> {student_name} | 
                    <strong>{time_label}:</strong> {download_time}
                </div>
            </div>
            
            {score_cards}
            
            <div class="stats-row">
                <div class="stats-col-left">
                    {difficulty_stats}
                </div>
                <div class="stats-col-right">
                    {problem_grid}
                </div>
            </div>
            
            {trend_charts}
            
            <div class="page-break"></div>
            {problem_details}
        </body>
        </html>
        '''
        
        # Generate PDF
        try:
            from weasyprint import HTML
        except (ImportError, OSError) as e:
            raise RuntimeError(
                "PDF export is not available. WeasyPrint requires system libraries. "
                f"Original error: {e}"
            )
        
        pdf_file = BytesIO()
        HTML(string=full_html).write_pdf(pdf_file)
        pdf_file.seek(0)
        
        return pdf_file

