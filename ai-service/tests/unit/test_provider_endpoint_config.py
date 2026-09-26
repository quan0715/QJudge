"""Provider endpoint configuration used by isolated deployments."""

from __future__ import annotations

import pytest

from config import Settings
from infrastructure.agent import model_factory


@pytest.mark.parametrize(
    ("model_id", "setting_name", "argument_name", "expected"),
    (
        (
            "openai-nano",
            "openai_base_url",
            "base_url",
            "http://fake-model.test/v1",
        ),
        (
            "openai-gemma4-31b",
            "vllm_base_url",
            "base_url",
            "http://fake-vllm.test/v1",
        ),
        (
            "deepseek-v4-flash",
            "deepseek_base_url",
            "api_base",
            "http://fake-deepseek.test/v1",
        ),
    ),
)
def test_model_factory_uses_configured_provider_base_url(
    monkeypatch: pytest.MonkeyPatch,
    model_id: str,
    setting_name: str,
    argument_name: str,
    expected: str,
) -> None:
    class RecordingModel:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs
            self.profile = None

    settings = Settings(
        OPENAI_API_KEY="test-openai",
        DEEPSEEK_API_KEY="test-deepseek",
        OPENAI_BASE_URL="http://fake-model.test/v1",
        VLLM_API_KEY="test-vllm",
        VLLM_BASE_URL="http://fake-vllm.test/v1",
        DEEPSEEK_BASE_URL="http://fake-deepseek.test/v1",
    )
    monkeypatch.setattr(model_factory, "get_settings", lambda: settings)
    monkeypatch.setattr(model_factory, "TpmGatedChatOpenAI", RecordingModel)
    monkeypatch.setattr(model_factory, "ChatDeepSeek", RecordingModel)
    monkeypatch.setattr(
        model_factory,
        "ReasoningPreservingChatDeepSeek",
        RecordingModel,
    )

    model = model_factory.ModelFactory.create_model(model_id)

    assert model.kwargs[argument_name] == expected
    assert getattr(settings, setting_name) == expected
