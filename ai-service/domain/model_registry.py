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
        "model_id": "deepseek-v4-flash",
        "display_name": "deepseek-v4-flash",
        "description": "DeepSeek V4 Flash，1M context，thinking enabled，適合大量批改與日常推理",
        "is_default": False,
    },
    {
        "model_id": "deepseek-v4-pro",
        "display_name": "deepseek-v4-pro",
        "description": "DeepSeek V4 Pro，1M context，thinking enabled，適合高品質批改與複雜推理",
        "is_default": False,
    },
)

MODEL_IDS = frozenset(str(model["model_id"]) for model in MODEL_INFO)
