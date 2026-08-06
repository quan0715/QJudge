"""Contracts retained by the Django AI compatibility BFF."""

from django.apps import apps

from apps.ai.serializers import StartRunSerializer


def test_django_ai_app_declares_no_domain_models():
    assert list(apps.get_app_config("ai").get_models()) == []


def test_start_run_serializer_accepts_expected_model_ids():
    for model_id in (
        "openai-nano",
        "openai-mini",
        "openai-mini-medium",
        "deepseek-v4",
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "deepseek-v4-thinking",
    ):
        serializer = StartRunSerializer(data={"content": "hello", "model_id": model_id})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["model_id"] == model_id


def test_start_run_serializer_rejects_unknown_model_id():
    serializer = StartRunSerializer(
        data={"content": "hello", "model_id": "anthropic-haiku"}
    )
    assert not serializer.is_valid()
    assert "model_id" in serializer.errors


def test_start_run_serializer_default_model_id_is_openai_nano():
    serializer = StartRunSerializer(data={"content": "hello"})
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["model_id"] == "openai-nano"


def test_start_run_model_choices_match_the_ai_service_registry():
    assert list(StartRunSerializer().fields["model_id"].choices) == [
        "openai-nano",
        "openai-mini",
        "openai-mini-medium",
        "deepseek-v4",
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "deepseek-v4-thinking",
    ]
