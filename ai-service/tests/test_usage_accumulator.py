from __future__ import annotations

import sys
import types

_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")
_deepseek_stub.ChatDeepSeek = type("ChatDeepSeek", (), {})
_openai_stub.ChatOpenAI = type("ChatOpenAI", (), {})
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)
sys.modules.setdefault("langchain_openai", _openai_stub)

from services.runtime.usage_accumulator import UsageAccumulator


class _Output:
    def __init__(self, usage_metadata: dict[str, int]) -> None:
        self.usage_metadata = usage_metadata


def test_usage_accumulator_collects_tokens_from_chat_model_end_event():
    acc = UsageAccumulator()

    acc.ingest_langgraph_event(
        {
            "event": "on_chat_model_end",
            "data": {"output": _Output({"input_tokens": 12, "output_tokens": 34})},
        }
    )
    acc.ingest_langgraph_event(
        {
            "event": "on_chat_model_end",
            "data": {"output": _Output({"input_tokens": 1, "output_tokens": 2})},
        }
    )

    report = acc.build_usage_report(
        model_id="deepseek-v4",
        calculate_cost=lambda _m, i, o: i + o,
    )

    assert report.input_tokens == 13
    assert report.output_tokens == 36
    assert report.cost_cents == 49
    assert report.model_used == "deepseek-v4"


def test_usage_accumulator_ignores_irrelevant_events():
    acc = UsageAccumulator()

    acc.ingest_langgraph_event({"event": "on_chat_model_stream", "data": {}})

    report = acc.build_usage_report(
        model_id="deepseek-v4",
        calculate_cost=lambda _m, i, o: i + o,
    )

    assert report.input_tokens == 0
    assert report.output_tokens == 0
    assert report.cost_cents == 0
