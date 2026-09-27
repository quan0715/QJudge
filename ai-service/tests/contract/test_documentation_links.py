"""Local links in the active documentation resolve."""

from __future__ import annotations

import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_local_links_in_active_documentation_resolve() -> None:
    documents = (
        REPOSITORY_ROOT / "README.md",
        *sorted((REPOSITORY_ROOT / "frontend/public/docs/zh-TW").glob("deployment*.md")),
        *sorted((REPOSITORY_ROOT / "docs").glob("*.md")),
        *sorted((REPOSITORY_ROOT / "docs/operations").glob("*.md")),
    )
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for document in documents:
        for raw_target in pattern.findall(document.read_text(encoding="utf-8")):
            target = raw_target.split("#", 1)[0]
            if not target or target.startswith(
                ("http://", "https://", "mailto:", "/")
            ):
                continue
            resolved = (document.parent / target).resolve()
            assert resolved.exists(), f"broken link in {document}: {raw_target}"
