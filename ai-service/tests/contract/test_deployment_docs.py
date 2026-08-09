"""Contracts for the public Traditional Chinese deployment guide."""

from __future__ import annotations

import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_DEPLOYMENT_ROOT = REPOSITORY_ROOT / "frontend/public/docs/zh-TW"
DEPLOYMENT_GUIDES = (
    PUBLIC_DEPLOYMENT_ROOT / "deployment.md",
    PUBLIC_DEPLOYMENT_ROOT / "deployment-storage.md",
    PUBLIC_DEPLOYMENT_ROOT / "deployment-options.md",
    PUBLIC_DEPLOYMENT_ROOT / "deployment-troubleshooting.md",
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _assert_in_order(text: str, values: tuple[str, ...]) -> None:
    positions = [text.index(value) for value in values]
    assert positions == sorted(positions)


def test_public_deployment_guide_is_a_linear_minimum_path() -> None:
    guide = _read(PUBLIC_DEPLOYMENT_ROOT / "deployment.md")
    _assert_in_order(
        guide,
        (
            "## 1. 先確認這條路適合你",
            "## 2. 準備主機",
            "## 3. 準備檔案儲存",
            "## 4. 取得 QJudge",
            "## 5. 建立環境設定",
            "## 6. 啟動 QJudge",
            "## 7. 建立管理者帳號",
            "## 8. 完成第一次驗收",
            "## 9. 決定是否開放到 Internet",
            "## 10. 更新與暫停",
        ),
    )
    assert "scripts/setup-env.sh" in guide
    assert "scripts/deploy-prod.sh" in guide
    assert "cp .env.example .env" not in guide
    assert not re.search(r"Grafana|GlitchTip|Recur|billing", guide, re.IGNORECASE)


def test_storage_guide_keeps_r2_executable_and_minio_unverified() -> None:
    storage = _read(PUBLIC_DEPLOYMENT_ROOT / "deployment-storage.md")
    for bucket in ("anticheat-raw", "markdown-images", "ai-artifacts"):
        assert bucket in storage
    assert "R2" in storage
    assert "MinIO" in storage
    assert "尚未完成相容性實測" in storage
    assert "--storage minio" not in storage


def test_optional_features_keep_https_boundary_clear() -> None:
    options = _read(PUBLIC_DEPLOYMENT_ROOT / "deployment-options.md")
    assert "AI provider" in options
    assert "Internal MCP" in options
    assert "Remote MCP" in options
    assert "Cloudflare Tunnel" in options
    assert "OAuth" in options
    assert "Internal MCP 不需要公開 HTTPS" in options
    assert "Remote MCP 需要公開 HTTPS" in options
    assert "OPENAI_BASE_URL" not in options
    assert "DEEPSEEK_BASE_URL" not in options


def test_troubleshooting_follows_the_deployment_order() -> None:
    guide = _read(PUBLIC_DEPLOYMENT_ROOT / "deployment-troubleshooting.md")
    _assert_in_order(
        guide,
        (
            "## 1. 主機與工具",
            "## 2. 環境設定",
            "## 3. Compose 與啟動",
            "## 4. Database 與 migration",
            "## 5. 健康檢查",
            "## 6. R2 與檔案",
            "## 7. Judge 與 Integrity",
            "## 8. Tunnel 與 OAuth",
        ),
    )
    assert "down -v" not in guide


def test_public_navigation_and_readme_use_the_public_source() -> None:
    config = _read(REPOSITORY_ROOT / "frontend/public/docs/config.json")
    labels = _read(REPOSITORY_ROOT / "frontend/src/i18n/locales/zh-TW/docs.json")
    readme = _read(REPOSITORY_ROOT / "README.md")
    assert '"id": "deployment"' in config
    for slug in (
        "deployment",
        "deployment-storage",
        "deployment-options",
        "deployment-troubleshooting",
    ):
        assert f'"{slug}"' in config
    for label in (
        '"deployment": "架設與部署"',
        '"deployment": "從一台主機開始部署"',
        '"deployment-storage": "準備檔案儲存"',
        '"deployment-options": "加入選用功能"',
        '"deployment-troubleshooting": "部署故障排除"',
    ):
        assert label in labels
    assert "](frontend/public/docs/zh-TW/deployment.md)" in readme
    assert "](docs/deployment.md)" not in readme


def test_obsolete_internal_guides_are_removed() -> None:
    obsolete = (
        "docs/deployment.md",
        "docs/deployment",
        "docs/user-guide.md",
        "docs/developer-guide.md",
        "docs/qauth-service-architecture.md",
        "docs/cloudflare.md",
        "docs/monitoring.md",
    )
    for relative in obsolete:
        assert not (REPOSITORY_ROOT / relative).exists(), relative


def test_local_links_in_active_documentation_resolve() -> None:
    documents = (
        REPOSITORY_ROOT / "README.md",
        *DEPLOYMENT_GUIDES,
        *sorted((REPOSITORY_ROOT / "docs").glob("*.md")),
        *sorted((REPOSITORY_ROOT / "docs/operations").glob("*.md")),
    )
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for document in documents:
        for raw_target in pattern.findall(_read(document)):
            target = raw_target.split("#", 1)[0]
            if not target or target.startswith(
                ("http://", "https://", "mailto:", "/")
            ):
                continue
            resolved = (document.parent / target).resolve()
            assert resolved.exists(), f"broken link in {document}: {raw_target}"
