"""Contract tests for AI model ids exposed by backend serializer and model list view."""

from apps.ai.serializers import StartRunSerializer
from apps.ai.views import ModelListView


def test_start_run_serializer_accepts_expected_model_ids():
    for model_id in (
        "openai-nano",
        "openai-mini",
        "openai-mini-medium",
        "deepseek-v4",
        "deepseek-v4-thinking",
    ):
        serializer = StartRunSerializer(data={"content": "hello", "model_id": model_id})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["model_id"] == model_id


def test_start_run_serializer_rejects_unknown_model_id():
    serializer = StartRunSerializer(data={"content": "hello", "model_id": "anthropic-haiku"})
    assert not serializer.is_valid()
    assert "model_id" in serializer.errors


def test_start_run_serializer_default_model_id_is_openai_nano():
    serializer = StartRunSerializer(data={"content": "hello"})
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["model_id"] == "openai-nano"


def test_model_list_view_models_are_openai_plus_deepseek():
    response = ModelListView().get(request=None)
    assert response.status_code == 200

    models = response.data["models"]
    model_ids = [item["model_id"] for item in models]
    defaults = [item["model_id"] for item in models if item["is_default"]]

    assert model_ids == [
        "openai-nano",
        "openai-mini",
        "openai-mini-medium",
        "deepseek-v4",
        "deepseek-v4-thinking",
    ]
    assert defaults == ["openai-nano"]
