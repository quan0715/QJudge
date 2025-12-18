"""
Markdown renderer for contest export.
"""
from typing import List

from .base import BaseRenderer
from ..dto import ContestProblemDTO


class MarkdownRenderer(BaseRenderer):
    """Export contest to Markdown format."""

    def format_problem_content(self, problem, label: str) -> dict:
        """
        Format a problem's content for export.
        Backward-compatible proxy to data_service._format_problem.
        """
        dto = self.data_service._format_problem(problem, label)
        return {
            'label': dto.label,
            'title': dto.title,
            'description': dto.description,
            'input_description': dto.input_description,
            'output_description': dto.output_description,
            'hint': dto.hint,
            'time_limit': dto.time_limit,
            'memory_limit': dto.memory_limit,
            'difficulty': dto.difficulty_display,
            'sample_cases': [
                {'input': tc.input, 'output': tc.output}
                for tc in dto.sample_cases
            ],
            'tags': dto.tags,
        }

    def export(self) -> str:
        """Generate markdown content for the contest."""
        lines = []

        contest_dto = self.data_service.get_contest_dto()

        # Contest header
        lines.append(f"# {contest_dto.name}")
        lines.append("")

        # Contest info
        lines.append("## Contest Information")
        lines.append("")
        lines.append(f"**Name:** {contest_dto.name}")

        lines.append("")
        lines.append("### Description")
        lines.append("")
        if contest_dto.description:
            lines.append(contest_dto.description)
        else:
            lines.append(self.get_label('no_description', '_No description provided._'))
        lines.append("")

        if contest_dto.start_time:
            lines.append(f"**Start Time:** {contest_dto.start_time.strftime('%Y-%m-%d %H:%M')}")
        if contest_dto.end_time:
            lines.append(f"**End Time:** {contest_dto.end_time.strftime('%Y-%m-%d %H:%M')}")
        lines.append("")

        lines.append("### Rules")
        lines.append("")
        if contest_dto.rules:
            lines.append(contest_dto.rules)
        else:
            lines.append(self.get_label('no_rules', '_No rules provided._'))
        lines.append("")

        # Problems
        contest_problems = self.data_service.get_contest_problems()

        if contest_problems:
            lines.append("---")
            lines.append("")
            lines.append("## Problems")
            lines.append("")

            for idx, cp in enumerate(contest_problems):
                lines.extend(self._render_problem(cp, idx, len(contest_problems)))

        return "\n".join(lines)

    def _render_problem(
        self,
        cp: ContestProblemDTO,
        idx: int,
        total: int
    ) -> List[str]:
        """Render a single problem section."""
        lines = []
        problem = cp.problem

        # Problem header
        lines.append(f"## Problem {problem.label}: {problem.title}")
        lines.append("")

        # Metadata
        lines.append(f"**Difficulty:** {problem.difficulty_display}")
        lines.append(f"**Time Limit:** {problem.time_limit}ms")
        lines.append(f"**Memory Limit:** {problem.memory_limit}MB")

        if problem.tags:
            tags_str = ", ".join(problem.tags)
            lines.append(f"**Tags:** {tags_str}")

        lines.append("")

        # Description
        if problem.description:
            lines.append("### Description")
            lines.append("")
            lines.append(problem.description)
            lines.append("")

        # Input Description
        if problem.input_description:
            lines.append("### Input Description")
            lines.append("")
            lines.append(problem.input_description)
            lines.append("")

        # Output Description
        if problem.output_description:
            lines.append("### Output Description")
            lines.append("")
            lines.append(problem.output_description)
            lines.append("")

        # Sample cases
        if problem.sample_cases:
            lines.append("### Sample Test Cases")
            lines.append("")

            for case_idx, tc in enumerate(problem.sample_cases, 1):
                lines.append(f"#### Example {case_idx}")
                lines.append("")
                lines.append("**Input:**")
                lines.append("```")
                lines.append(tc.input or "(empty)")
                lines.append("```")
                lines.append("")
                lines.append("**Output:**")
                lines.append("```")
                lines.append(tc.output or "(empty)")
                lines.append("```")
                lines.append("")

        # Hint
        if problem.hint:
            lines.append("### Hint")
            lines.append("")
            lines.append(problem.hint)
            lines.append("")

        # Insert an explicit page break between problems for PDF output
        if idx < total - 1:
            lines.append("<div class=\"page-break\"></div>")
            lines.append("")

        lines.append("---")
        lines.append("")

        return lines
