"""Contracts for the public Traditional Chinese administrator journey."""

from __future__ import annotations

import json
import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_DOCS_ROOT = REPOSITORY_ROOT / "frontend/public/docs"
ZH_TW_ROOT = PUBLIC_DOCS_ROOT / "zh-TW"
IMAGE_ROOT = PUBLIC_DOCS_ROOT / "images/admin-getting-started"
JOURNEY_SLUGS = (
    "admin-account",
    "teacher-qualification",
    "classroom-setup",
    "classroom-roster",
    "exam-preparation",
    "exam-review",
)
RETIRED_SLUGS = (
    "admin-overview",
    "teacher-overview",
    "teacher-first-class-setup",
    "create-exam",
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_navigation_presents_one_admin_to_teacher_journey() -> None:
    config = json.loads(_read(PUBLIC_DOCS_ROOT / "config.json"))
    sections = {section["id"]: section["items"] for section in config["sections"]}

    assert sections["first-exam"] == list(JOURNEY_SLUGS)
    assert all(
        retired not in items
        for items in sections.values()
        for retired in RETIRED_SLUGS
    )


def test_journey_pages_exist_and_explain_the_role_handoff() -> None:
    expected_titles = {
        "admin-account": "# 建立管理員帳號",
        "teacher-qualification": "# 管理教師資格",
        "classroom-setup": "# 建立教室",
        "classroom-roster": "# 管理學生名冊",
        "exam-preparation": "# 準備考試",
        "exam-review": "# 確認考試內容",
    }

    for slug, title in expected_titles.items():
        guide = ZH_TW_ROOT / f"{slug}.md"
        assert guide.exists(), slug
        assert title in _read(guide)

    quick_start = _read(ZH_TW_ROOT / "quick-start.md")
    positions = [
        quick_start.index(text)
        for text in (
            "## 1. 系統尚未部署",
            "## 2. 建立第一個管理員",
            "## 3. 管理教師資格",
            "## 4. 建立教室",
            "## 5. 管理學生名冊",
            "## 6. 準備考試",
        )
    ]
    assert positions == sorted(positions)
    assert "管理員登出" in quick_start
    assert "教師帳號" in quick_start


def test_journey_screenshots_resolve_inside_the_dedicated_folder() -> None:
    image_pattern = re.compile(r"!\[[^\]]*\]\(([^)]+\.png)\)")
    referenced_images: set[Path] = set()

    for slug in JOURNEY_SLUGS:
        guide = ZH_TW_ROOT / f"{slug}.md"
        for target in image_pattern.findall(_read(guide)):
            resolved = (guide.parent / target).resolve()
            assert resolved.is_relative_to(IMAGE_ROOT.resolve())
            assert resolved.exists(), f"missing screenshot in {guide.name}: {target}"
            referenced_images.add(resolved)

    assert len(referenced_images) >= 8


def test_ai_guidance_stays_inside_exam_preparation() -> None:
    exam_preparation = _read(ZH_TW_ROOT / "exam-preparation.md")
    assert "AI" in exam_preparation
    assert "選用" in exam_preparation

    config = _read(PUBLIC_DOCS_ROOT / "config.json")
    assert '"ai-grading"' not in config
    assert '"ai-question-generation"' not in config
