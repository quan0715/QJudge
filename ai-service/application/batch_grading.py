"""A batch grading request names its units on one ``batch_units:`` line.

Everything else (how to split work, rubrics, batching, retries) is the agent's call.
"""

from __future__ import annotations

import json

BATCH_TASK_TYPE = "grading.batch"


def parse_batch_units(message: str) -> list[dict] | None:
    """Units the teacher requested: ``[{id, label?, question_ids, teacher_note?}]``."""
    for line in message.splitlines():
        if line.startswith("batch_units:"):
            units = json.loads(line.split(":", 1)[1])
            if not isinstance(units, list) or not units or not all(
                isinstance(unit, dict) and isinstance(unit.get("id"), str) and unit.get("question_ids")
                for unit in units
            ):
                raise ValueError("批改單位設定無效")
            return units
    return None
