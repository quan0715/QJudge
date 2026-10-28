"""Deterministic grading downloads rendered from persisted backend data."""
from __future__ import annotations

import csv
import io
import json
from typing import Any


def render_rubric(value: Any, depth: int = 0) -> str:
    """Keep free-form rubric values readable without inventing criteria."""
    indent = "  " * depth
    if isinstance(value, dict):
        return "\n".join(f"{indent}- {key}:\n{render_rubric(item, depth + 1)}" for key, item in value.items())
    if isinstance(value, list):
        return "\n".join(f"{indent}-\n{render_rubric(item, depth + 1)}" for item in value)
    return indent + str(value)


def grading_files(data: dict) -> dict[str, bytes]:
    # Labels are display text such as "3(a)"; the paper order sorts units.
    units = sorted(data["units"], key=lambda u: min(q["order"] for q in u["questions"]))
    markdown = ["# AI 批改評分標準", "由資料庫匯出；未保存的判準不會以參考答案補填。"]
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["unit_id", "question", "exam_answer_id", "participant_id", "answer", "draft_score", "draft_feedback", "official_score", "official_feedback", "write_status", "matches_draft"])
    def cell(value):
        # Spreadsheet apps must not execute student answers or feedback as formulas.
        value = "" if value is None else str(value)
        return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value
    for unit in units:
        labels = {q["question_id"]: q["label"] for q in unit["questions"]}
        markdown += ["## 第 " + "、".join(labels.values()) + " 題",
                     render_rubric(unit["rubric"]) if unit.get("rubric") else "未保存 AI 評分標準。"]
        drafts = {g["exam_answer_id"]: g for g in unit["grades"]}
        for answer in unit["answers"]:
            if not answer["writable"]:
                continue
            aid = answer["exam_answer_id"]
            draft, official = drafts.get(aid, {}), data["official_grades"].get(aid, {})
            matches = bool(draft and official and official.get("score") is not None and
                           official["score"] == draft["score"] and official["feedback"] == draft.get("feedback", ""))
            writer.writerow([cell(v) for v in [unit["unit_id"], labels[answer["question_id"]], aid,
                answer["participant_id"], json.dumps(answer["answer"], ensure_ascii=False),
                draft.get("score"), draft.get("feedback"), official.get("score"), official.get("feedback"),
                unit.get("results", {}).get(aid, {}).get("status", "not_submitted"), matches]])
    return {"rubric.md": ("\n\n".join(markdown) + "\n").encode(),
            "grade.csv": output.getvalue().encode("utf-8-sig")}
