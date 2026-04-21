"""AI Credit 點數計算：依 token × 對應模型單價換算。

設計：
- 每個模型有 input / output 單價（每百萬 token 的美分）
- cost_scaled = in_tokens × input_rate + out_tokens × output_rate
  單位為「美分 × 10⁻⁶」
- credits = ceil(cost_scaled / SCALE_PER_CREDIT)
- 預設 SCALE_PER_CREDIT = 400_000，等於 1 credit = 0.4 美分成本
  （Pro USD $20/月、2000 credits/月、目標 AI 成本 ≈ $8、毛利 ~60%）

Pricing 與 ai-service/services/model_factory.py 的 PRICING 必須一致；
由 backend/apps/ai/tests/test_pricing_alignment.py contract test 在 CI 把關。
"""

from __future__ import annotations

from django.conf import settings

# 每百萬 token 的美分（input/output）
# IMPORTANT: keep in sync with ai-service/services/model_factory.py::PRICING.
DEFAULT_MODEL_PRICING: dict[str, dict[str, int]] = {
    "openai-nano": {"input": 5, "output": 20},
    "openai-mini": {"input": 75, "output": 450},
    "openai-mini-medium": {"input": 75, "output": 450},
    "deepseek-r1": {"input": 55, "output": 219},
    "deepseek-v3": {"input": 7, "output": 28},
}

DEFAULT_MODEL_ID = "openai-nano"
DEFAULT_SCALE_PER_CREDIT = 400_000  # 1 credit = 0.4 美分


def get_model_pricing() -> dict[str, dict[str, int]]:
    return getattr(settings, "AI_CREDIT_MODEL_PRICING", DEFAULT_MODEL_PRICING)


def get_default_model_id() -> str:
    return getattr(settings, "AI_CREDIT_DEFAULT_MODEL", DEFAULT_MODEL_ID)


def get_scale_per_credit() -> int:
    value = int(getattr(settings, "AI_CREDIT_SCALE_PER_CREDIT", DEFAULT_SCALE_PER_CREDIT))
    return value if value > 0 else DEFAULT_SCALE_PER_CREDIT


def _rates_for(model_id: str | None) -> dict[str, int]:
    pricing = get_model_pricing()
    rates = pricing.get(model_id or "")
    if not rates:
        rates = pricing.get(get_default_model_id(), {"input": 0, "output": 0})
    return rates


def usage_to_credits(
    input_tokens: int | None,
    output_tokens: int | None,
    model_id: str | None = None,
) -> int:
    """依模型單價把本次 token 用量換算成整數 credits（無條件進位）。"""
    inp = max(0, int(input_tokens or 0))
    out = max(0, int(output_tokens or 0))
    if inp + out == 0:
        return 0
    rates = _rates_for(model_id)
    cost_scaled = inp * int(rates.get("input", 0)) + out * int(rates.get("output", 0))
    if cost_scaled <= 0:
        return 0
    scale = get_scale_per_credit()
    return -(-cost_scaled // scale)  # ceil div
