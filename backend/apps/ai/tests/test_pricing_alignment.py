"""Contract test：backend 的 DEFAULT_MODEL_PRICING 必須與 ai-service 的 PRICING 完全一致。

兩個服務各自部署、各自 import；任一邊改動單價都要同步另一邊，否則
backend 算出的 credits 會與 ai-service 算出的 cost_cents 對不上。

執行條件：
- 在 CI 或 host 端從 repo root 跑 pytest 時，ai-service 原始碼可以從相對路徑讀到，會做嚴格比對。
- 在 backend 容器內（只掛載 backend）讀不到 ai-service 檔案 → skip 並給出明確訊息。
  CI 仍會 enforce，所以線上不會漂移。
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

from apps.ai.credits import DEFAULT_MODEL_PRICING


def _ai_service_model_factory_path() -> Path | None:
    """從本檔向上找 repo root，定位 ai-service/services/model_factory.py。"""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "ai-service" / "services" / "model_factory.py"
        if candidate.is_file():
            return candidate
    return None


def _extract_pricing_literal(source: str) -> dict:
    """從原始碼用 AST 抓出最上層 `PRICING = {...}` 賦值並 literal_eval。"""
    tree = ast.parse(source)
    for node in tree.body:
        if not isinstance(node, ast.AnnAssign):
            if not isinstance(node, ast.Assign):
                continue
            targets = node.targets
        else:
            targets = [node.target]

        for target in targets:
            if isinstance(target, ast.Name) and target.id == "PRICING":
                value_node = node.value
                if value_node is None:
                    continue
                return ast.literal_eval(value_node)
    raise AssertionError("Could not locate top-level `PRICING` assignment in ai-service")


class PricingAlignmentTest:
    """Plain class so pytest treats it as a collector; using simple module-level functions."""


def test_pricing_aligned_with_ai_service():
    path = _ai_service_model_factory_path()
    if path is None:
        pytest.skip(
            "ai-service source not reachable from this test environment; "
            "the alignment is still enforced by CI (backend-unit job checks out full repo)."
        )

    source = path.read_text(encoding="utf-8")
    ai_service_pricing = _extract_pricing_literal(source)

    assert ai_service_pricing == DEFAULT_MODEL_PRICING, (
        "PRICING drift detected.\n"
        f"  ai-service ({path}): {ai_service_pricing}\n"
        f"  backend   (apps/ai/credits.py:DEFAULT_MODEL_PRICING): {DEFAULT_MODEL_PRICING}\n"
        "Update both sides together. Both files document each other in their docstrings."
    )
