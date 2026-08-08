"""Contracts for the repository's canonical deployment guide."""

from __future__ import annotations

import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DEPLOYMENT_ROOT = REPOSITORY_ROOT / "docs/deployment"
GUIDES = (
    DEPLOYMENT_ROOT / "prerequisites.md",
    DEPLOYMENT_ROOT / "object-storage.md",
    DEPLOYMENT_ROOT / "ai-and-mcp.md",
    DEPLOYMENT_ROOT / "https-and-oauth.md",
    DEPLOYMENT_ROOT / "ec2.md",
    DEPLOYMENT_ROOT / "troubleshooting.md",
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _assert_in_order(text: str, values: tuple[str, ...]) -> None:
    positions = [text.index(value) for value in values]
    assert positions == sorted(positions)


def test_canonical_deployment_guide_is_a_linear_minimum_path() -> None:
    guide = _read(REPOSITORY_ROOT / "docs/deployment.md")
    _assert_in_order(
        guide,
        (
            "## 1. 適用範圍",
            "## 2. 最小部署架構",
            "## 3. 部署前準備",
            "## 4. 取得 QJudge",
            "## 5. 建立環境設定",
            "## 6. 啟動服務",
            "## 7. 初始化系統",
            "## 8. 驗收",
            "## 9. 選用功能",
            "## 10. 更新與停止服務",
        ),
    )
    assert "scripts/setup-env.sh" in guide
    assert "scripts/deploy-prod.sh" in guide
    assert "cp .env.example .env" not in guide
    assert not re.search(r"Grafana|GlitchTip|Recur", guide, re.IGNORECASE)


def test_all_supporting_deployment_guides_exist_and_are_linked() -> None:
    main = _read(REPOSITORY_ROOT / "docs/deployment.md")
    for guide in GUIDES:
        assert guide.is_file(), f"missing deployment guide: {guide}"
        relative = guide.relative_to(REPOSITORY_ROOT / "docs").as_posix()
        assert f"]({relative})" in main


def test_unverified_storage_and_cloud_paths_are_explicit() -> None:
    storage = _read(DEPLOYMENT_ROOT / "object-storage.md")
    ec2 = _read(DEPLOYMENT_ROOT / "ec2.md")
    assert "MinIO：尚未提供" in storage
    assert "部署狀態：尚未驗證" in ec2
    assert "--storage minio" not in storage


def test_ai_mcp_and_https_guides_keep_https_optional() -> None:
    ai_mcp = _read(DEPLOYMENT_ROOT / "ai-and-mcp.md")
    https_oauth = _read(DEPLOYMENT_ROOT / "https-and-oauth.md")
    assert "不需要公開 HTTPS" in ai_mcp
    assert "Remote MCP" in ai_mcp
    assert "OAuth" in https_oauth
    assert "Cloudflare Tunnel" in https_oauth


def test_readme_and_cloudflare_notes_point_to_the_canonical_guide() -> None:
    readme = _read(REPOSITORY_ROOT / "README.md")
    cloudflare = _read(REPOSITORY_ROOT / "docs/cloudflare.md")
    assert "](docs/deployment.md)" in readme
    assert "](deployment.md)" in cloudflare
    assert "](deployment/https-and-oauth.md)" in cloudflare
    assert "](deployment/object-storage.md)" in cloudflare


def test_local_markdown_links_resolve() -> None:
    documents = (
        REPOSITORY_ROOT / "README.md",
        REPOSITORY_ROOT / "docs/deployment.md",
        REPOSITORY_ROOT / "docs/cloudflare.md",
        *GUIDES,
    )
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for document in documents:
        for raw_target in pattern.findall(_read(document)):
            target = raw_target.split("#", 1)[0]
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved = (document.parent / target).resolve()
            assert resolved.exists(), f"broken link in {document}: {raw_target}"
