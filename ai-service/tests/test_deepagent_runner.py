"""Unit tests for DeepAgentRunner local skill-file handling."""

from services.deepagent_runner import DeepAgentRunner


class _DummyToolClient:
    async def close(self):
        return None


def test_build_skill_state_files_uses_configured_skills_dir(tmp_path):
    skills_dir = tmp_path / "custom-skills"
    skill_dir = skills_dir / "sample-skill"
    skill_dir.mkdir(parents=True)

    (skill_dir / "SKILL.md").write_text("# test skill", encoding="utf-8")
    (skill_dir / "config.json").write_text('{"name": "sample"}', encoding="utf-8")

    runner = DeepAgentRunner(
        tool_client=_DummyToolClient(),
        checkpoint_db_url="",
        skills_dir=str(skills_dir),
    )

    files = runner._build_skill_state_files()

    assert "/skills/sample-skill/SKILL.md" in files
    assert "/skills/sample-skill/config.json" in files


def test_build_skill_state_files_filters_unwanted_or_oversized_files(tmp_path):
    skills_dir = tmp_path / "skills"
    skill_dir = skills_dir / "sample-skill"
    skill_dir.mkdir(parents=True)

    (skill_dir / "SKILL.md").write_text("# ok", encoding="utf-8")
    (skill_dir / "image.png").write_bytes(b"\\x89PNG")
    (skill_dir / "too-large.md").write_text("x" * (256 * 1024 + 1), encoding="utf-8")

    runner = DeepAgentRunner(
        tool_client=_DummyToolClient(),
        checkpoint_db_url="",
        skills_dir=str(skills_dir),
    )

    files = runner._build_skill_state_files()

    assert "/skills/sample-skill/SKILL.md" in files
    assert "/skills/sample-skill/image.png" not in files
    assert "/skills/sample-skill/too-large.md" not in files
