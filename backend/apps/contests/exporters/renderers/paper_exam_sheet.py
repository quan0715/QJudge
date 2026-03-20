"""
Paper exam sheet renderer for contest-level exports.

Provides two modes:
- question: formal exam paper without answers
- answer: answer sheet with answer key
"""
from __future__ import annotations

import json
import re
from io import BytesIO
from pathlib import Path

from django.contrib.staticfiles import finders
from django.template.loader import render_to_string
from django.utils import timezone

from apps.contests.models import ExamQuestion

from .base import BaseRenderer
from ..utils import inline_markdown, render_markdown


class PaperExamSheetRenderer(BaseRenderer):
    """Render a paper exam sheet (question paper / answer sheet) to PDF."""

    OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    def __init__(
        self,
        contest,
        language: str = "zh-TW",
        scale: float = 1.0,
        include_answers: bool = False,
        include_answer_area: bool = True,
    ):
        super().__init__(contest, language)
        self.scale = max(0.5, min(2.0, scale))
        self.include_answers = include_answers
        self.include_answer_area = include_answer_area

    def export(self) -> BytesIO:
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
        questions = list(
            ExamQuestion.objects.filter(contest=self.contest).order_by("order", "id")
        )
        is_zh = self.is_chinese
        total_score = sum(q.score for q in questions)

        question_rows: list[dict] = []
        answer_key_rows: list[dict] = []
        for idx, q in enumerate(questions, start=1):
            answer_text_raw = self._format_answer(q)
            answer_text = self._clean_answer_markdown(answer_text_raw)
            answer_ui = self._build_answer_ui(q)
            question_rows.append(
                {
                    "number": idx,
                    "question_type": q.question_type,
                    "type_label": self._get_question_type_label(q.question_type),
                    "score": q.score,
                    "prompt_html": render_markdown(q.prompt or "", soft_breaks=False),
                    "options": self._get_options(q),
                    "answer_text": answer_text,
                    "answer_html": render_markdown(answer_text, soft_breaks=False) if answer_text else "",
                    **answer_ui,
                }
            )
            answer_key_rows.append(
                {
                    "number": idx,
                    "answer_text": self._format_answer_key_text(q, answer_text),
                    "score": q.score,
                }
            )

        start_time = timezone.localtime(self.contest.start_time) if self.contest.start_time else None
        end_time = timezone.localtime(self.contest.end_time) if self.contest.end_time else None
        duration_minutes = (
            int((self.contest.end_time - self.contest.start_time).total_seconds() / 60)
            if self.contest.start_time and self.contest.end_time
            else None
        )

        sheet_title = (
            f"{self.get_label('exam_paper_official')}（{self.get_label('exam_paper_answer' if self.include_answers else 'exam_paper_question')}）"
        )

        context = {
            "language": self.language,
            "is_chinese": is_zh,
            "include_answers": self.include_answers,
            "contest_name": inline_markdown(self.contest.name),
            "contest_description": self.contest.description or "",
            "sheet_title": sheet_title,
            "labels": {
                "candidate_name": self.get_label("candidate_name"),
                "candidate_id": self.get_label("candidate_id"),
                "candidate_class": self.get_label("candidate_class"),
                "exam_time": self.get_label("exam_time"),
                "duration": self.get_label("duration"),
                "total_questions": self.get_label("total_questions"),
                "total_score": self.get_label("total_score"),
                "answer_key": self.get_label("answer_key"),
                "no_questions": self.get_label("no_questions"),
                "points_unit": self.get_label("points_unit"),
                "answer": self.get_label("answer"),
                "question_no": self.get_label("question_no"),
                "score_col": self.get_label("score_col"),
                "answer_col": self.get_label("answer_col"),
                "instructions_title": self.get_label("instructions_title"),
                "answer_lines": self.get_label("answer_lines"),
                "choice_marking_hint": self.get_label("choice_marking_hint"),
                "answer_key_note": self.get_label("answer_key_note"),
            },
            "instructions": self._build_instructions(),
            "start_time_str": start_time.strftime("%Y/%m/%d %H:%M") if start_time else self.get_label("not_set"),
            "end_time_str": end_time.strftime("%Y/%m/%d %H:%M") if end_time else self.get_label("not_set"),
            "duration_str": (
                f"{duration_minutes} {self.get_label('minutes_label')}" if duration_minutes is not None else self.get_label("not_set")
            ),
            "question_count": len(questions),
            "total_score": total_score,
            "questions": question_rows,
            "answer_key": answer_key_rows,
            "base_css": self._get_base_css(),
            "sheet_css": self._get_sheet_css(),
        }
        return render_to_string("exports/paper_exam_sheet.html", context)

    def _get_base_css(self) -> str:
        css = self._read_static_css("exports/report-base.css")
        if self.scale != 1.0:
            return self._apply_scale_to_css(css)
        return css

    def _get_sheet_css(self) -> str:
        css = self._read_static_css("exports/paper-exam-sheet.css")
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

        def scale_px(match):
            value = float(match.group(1))
            return f"{value * self.scale}px"

        return re.sub(r"(\d+(?:\.\d+)?)px", scale_px, css)

    def _get_question_type_label(self, q_type: str) -> str:
        return self.get_label(q_type, q_type)

    def _get_options(self, question: ExamQuestion) -> list[dict]:
        options = question.options or []
        result = []
        for idx, opt in enumerate(options):
            letter = self.OPTION_LETTERS[idx] if idx < len(self.OPTION_LETTERS) else str(idx + 1)
            result.append({"letter": letter, "text": str(opt)})
        return result

    def _format_answer(self, question: ExamQuestion) -> str:
        answer = question.correct_answer
        if answer is None:
            return ""

        q_type = question.question_type
        if q_type == "true_false":
            if answer in (True, "true", "True", 1, "1"):
                return "O"
            if answer in (False, "false", "False", 0, "0"):
                return "X"
            return str(answer)

        if q_type == "single_choice":
            return self._format_single_choice(answer, question.options or [])

        if q_type == "multiple_choice":
            return self._format_multiple_choice(answer, question.options or [])

        if isinstance(answer, str):
            return answer

        return json.dumps(answer, ensure_ascii=False)

    def _format_answer_key_text(self, question: ExamQuestion, answer_text: str) -> str:
        if not answer_text:
            return f"（{self.get_label('not_set')}）"

        question_type = question.question_type
        normalized = " ".join(str(answer_text).split())

        if question_type == "single_choice":
            idx = self._to_index(question.correct_answer)
            if idx is not None and idx >= 0:
                return self.OPTION_LETTERS[idx] if idx < len(self.OPTION_LETTERS) else str(idx + 1)
            return normalized

        if question_type == "multiple_choice":
            if isinstance(question.correct_answer, list):
                letters: list[str] = []
                for item in question.correct_answer:
                    idx = self._to_index(item)
                    if idx is None or idx < 0:
                        continue
                    letters.append(self.OPTION_LETTERS[idx] if idx < len(self.OPTION_LETTERS) else str(idx + 1))
                if letters:
                    return ", ".join(letters)
            return normalized

        if question_type == "true_false":
            return "O" if str(normalized).lower() in {"o", "true", "1"} else ("X" if str(normalized).lower() in {"x", "false", "0"} else normalized)

        if question_type in {"short_answer", "essay"}:
            if len(normalized) <= 16 and "\n" not in str(answer_text):
                return normalized
            return "見詳解" if self.is_chinese else "See details"

        return normalized

    def _build_answer_ui(self, question: ExamQuestion) -> dict:
        question_type = question.question_type

        # If answer area is disabled, return empty state for all types
        if not self.include_answer_area:
            return {
                "show_choice_answer_bar": False,
                "choice_answer_slots": [],
                "show_answer_lines": False,
                "answer_line_indices": [],
                "answer_line_count": 0,
                "answer_area_min_height": 0,
            }

        if question_type == "single_choice":
            slots = [opt["letter"] for opt in self._get_options(question)]
            return {
                "show_choice_answer_bar": True,
                "choice_answer_slots": slots,
                "show_answer_lines": False,
                "answer_line_indices": [],
                "answer_line_count": 0,
                "answer_area_min_height": 0,
            }

        if question_type == "multiple_choice":
            slots = [opt["letter"] for opt in self._get_options(question)]
            return {
                "show_choice_answer_bar": True,
                "choice_answer_slots": slots,
                "show_answer_lines": False,
                "answer_line_indices": [],
                "answer_line_count": 0,
                "answer_area_min_height": 0,
            }

        if question_type == "true_false":
            return {
                "show_choice_answer_bar": True,
                "choice_answer_slots": ["O", "X"],
                "show_answer_lines": False,
                "answer_line_indices": [],
                "answer_line_count": 0,
                "answer_area_min_height": 0,
            }

        if question_type == "short_answer":
            line_count = self._estimate_short_answer_lines(question.prompt or "")
            return {
                "show_choice_answer_bar": False,
                "choice_answer_slots": [],
                "show_answer_lines": True,
                "answer_line_indices": list(range(line_count)),
                "answer_line_count": line_count,
                "answer_area_min_height": self._calc_answer_area_min_height(line_count),
            }

        if question_type == "essay":
            line_count = 8
            return {
                "show_choice_answer_bar": False,
                "choice_answer_slots": [],
                "show_answer_lines": True,
                "answer_line_indices": list(range(line_count)),
                "answer_line_count": line_count,
                "answer_area_min_height": self._calc_answer_area_min_height(line_count),
            }

        line_count = 4
        return {
            "show_choice_answer_bar": False,
            "choice_answer_slots": [],
            "show_answer_lines": True,
            "answer_line_indices": list(range(line_count)),
            "answer_line_count": line_count,
            "answer_area_min_height": self._calc_answer_area_min_height(line_count),
        }

    def _estimate_short_answer_lines(self, prompt: str) -> int:
        normalized = (prompt or "").lower()
        factual_keywords = (
            "幾次",
            "幾個",
            "多少",
            "輸出",
            "結果",
            "what is",
            "how many",
            "output",
            "value of",
        )
        hard_keywords = (
            "explain",
            "compare",
            "describe",
            "list",
            "discuss",
            "說明",
            "比較",
            "描述",
            "列出",
            "討論",
            "原因",
            "分析",
        )
        if any(keyword in normalized for keyword in factual_keywords):
            return 1
        if any(keyword in normalized for keyword in hard_keywords):
            return 4
        if len(prompt.strip()) <= 24:
            return 1
        if len(prompt.strip()) <= 48:
            return 2
        return 3

    @staticmethod
    def _calc_answer_area_min_height(line_count: int) -> int:
        if line_count <= 1:
            return 52
        if line_count <= 3:
            return line_count * 30 + 24
        return line_count * 32 + 24

    def _build_instructions(self) -> list[str]:
        """
        Build instructions strictly from contest rules.
        """
        rules = (self.contest.rules or "").strip()
        if not rules:
            return []

        instructions: list[str] = []
        for line in rules.splitlines():
            text = line.strip()
            if not text:
                continue
            text = re.sub(r"^\s*(?:[-*•]|\d+\.)\s*", "", text).strip()
            if text:
                instructions.append(text)

        return instructions[:12]

    def _clean_answer_markdown(self, text: str) -> str:
        """
        Remove placeholder-only lines that come from old answer templates
        (e.g. lone "1." / repeated bullets), while preserving valid content.
        """
        if not text:
            return ""
        raw_lines = str(text).splitlines()
        non_empty_count = sum(1 for line in raw_lines if line.strip())
        cleaned_lines: list[str] = []

        for raw_line in raw_lines:
            line = raw_line.rstrip()
            stripped = line.strip()
            if not stripped:
                cleaned_lines.append("")
                continue

            is_placeholder_numbering = bool(re.fullmatch(r"(?:\d+[\.\)]\s*)+", stripped))
            is_placeholder_bullets = bool(
                re.fullmatch(r"(?:[•·]\s*){2,}", stripped)
                or re.fullmatch(r"[•·\-\*]\s*", stripped)
            )

            if (is_placeholder_numbering or is_placeholder_bullets) and non_empty_count > 1:
                continue

            cleaned_lines.append(line)

        # Collapse excessive blank lines.
        compact: list[str] = []
        blank_run = 0
        for line in cleaned_lines:
            if line.strip():
                blank_run = 0
                compact.append(line)
            else:
                blank_run += 1
                if blank_run <= 1:
                    compact.append("")

        final_text = "\n".join(compact).strip()
        return final_text or str(text).strip()

    def _format_single_choice(self, answer, options: list) -> str:
        idx = self._to_index(answer)
        if idx is None or idx < 0 or idx >= len(options):
            return str(answer)
        letter = self.OPTION_LETTERS[idx] if idx < len(self.OPTION_LETTERS) else str(idx + 1)
        return f"({letter}) {options[idx]}"

    def _format_multiple_choice(self, answer, options: list) -> str:
        if not isinstance(answer, list):
            return str(answer)
        chunks = []
        for item in answer:
            idx = self._to_index(item)
            if idx is None or idx < 0 or idx >= len(options):
                chunks.append(str(item))
                continue
            letter = self.OPTION_LETTERS[idx] if idx < len(self.OPTION_LETTERS) else str(idx + 1)
            chunks.append(f"({letter}) {options[idx]}")
        return ", ".join(chunks)

    @staticmethod
    def _to_index(value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
