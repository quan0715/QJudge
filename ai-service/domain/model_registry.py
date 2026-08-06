"""Lightweight public model registry shared by API validation and runtime."""

from __future__ import annotations

from typing import Any

MODEL_INFO: tuple[dict[str, Any], ...] = (
    {
        "model_id": "openai-nano",
        "display_name": "gpt-5-nano",
        "description": "快速且成本低，適合日常教學互動",
        "is_default": True,
    },
    {
        "model_id": "openai-mini",
        "display_name": "gpt-5.4-mini (low)",
        "description": "OpenAI 推理模型，低思考強度，平衡速度與品質",
        "is_default": False,
    },
    {
        "model_id": "openai-mini-medium",
        "display_name": "gpt-5.4-mini (medium)",
        "description": "OpenAI 推理模型，中等思考強度，適合複雜批改與推理",
        "is_default": False,
    },
    {
        "model_id": "deepseek-v4",
        "display_name": "deepseek-v4",
        "description": "1M context、快速、低成本，適合日常對話與 summarization（非推理模式）",
        "is_default": False,
    },
    {
        "model_id": "deepseek-v4-thinking",
        "display_name": "deepseek-v4 (thinking)",
        "description": "1M context、推理模式（reasoning_effort=low），適合複雜批改與測資生成",
        "is_default": False,
    },
)

ADVERTISED_MODEL_IDS = frozenset(str(model["model_id"]) for model in MODEL_INFO)

