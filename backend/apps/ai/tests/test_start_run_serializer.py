from apps.ai.serializers import StartRunSerializer


def test_start_run_serializer_accepts_expected_model_ids():
    for model_id in (
        "openai-nano",
        "gemma4-31b",
    ):
        serializer = StartRunSerializer(data={"content": "hello", "model_id": model_id})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["model_id"] == model_id


def test_start_run_serializer_defers_model_validation_to_ai_service():
    serializer = StartRunSerializer(
        data={"content": "hello", "model_id": "future-model"}
    )
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["model_id"] == "future-model"


def test_start_run_serializer_leaves_model_choice_to_ai_service():
    serializer = StartRunSerializer(data={"content": "hello"})
    assert serializer.is_valid(), serializer.errors
    assert "model_id" not in serializer.validated_data
