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
