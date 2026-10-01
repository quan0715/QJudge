"""Render the page a teacher was on into the agent's turn input."""

from __future__ import annotations

from typing import Any

_SEGMENT_NAMES = {"classroom": "教室", "contest": "競賽", "problem": "題目"}
_UNSAFE = str.maketrans("", "", "<>")


def _clean(value: object) -> str:
    return str(value).translate(_UNSAFE).strip()


def _contest(context: dict[str, Any] | None) -> dict[str, Any] | None:
    for segment in (context or {}).get("segments", []):
        if segment.get("type") == "contest":
            return segment
    return None


def render_page_context(
    current: dict[str, Any] | None, previous: dict[str, Any] | None
) -> str:
    if not current or not current.get("segments"):
        return ""
    lines = ["<page_context>", "使用者目前所在頁面（系統自動附帶，非使用者輸入）："]
    for segment in current["segments"]:
        name = _SEGMENT_NAMES.get(segment.get("type"), _clean(segment.get("type")))
        ids = "，".join(
            f"{_clean(key)}={_clean(value)}"
            for key, value in segment.get("ids", {}).items()
        )
        suffix = f"（{ids}）" if ids else ""
        lines.append(f"- {name}：{_clean(segment.get('label', ''))}{suffix}")
    if current.get("path"):
        lines.append(f"- 路徑：{_clean(current['path'])}")
    now, before = _contest(current), _contest(previous)
    if (
        now is not None
        and before is not None
        and now.get("ids", {}).get("contest_id")
        != before.get("ids", {}).get("contest_id")
    ):
        lines.append(
            f"注意：使用者已從〈{_clean(before.get('label', ''))}〉"
            f"切換到〈{_clean(now.get('label', ''))}〉。"
        )
    lines.append("</page_context>")
    return "\n".join(lines)


def with_page_context(
    prompt: str, current: dict[str, Any] | None, previous: dict[str, Any] | None
) -> str:
    block = render_page_context(current, previous)
    return f"{block}\n\n{prompt}" if block else prompt
