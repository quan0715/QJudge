"""
Serializers for question bank API.
"""
from rest_framework import serializers

from .models import QuestionBank, Question, QuestionCodingExt


class QuestionCodingExtSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionCodingExt
        fields = [
            "translations",
            "test_cases",
            "language_configs",
            "forbidden_keywords",
            "required_keywords",
        ]


class QuestionCodingExtReadSerializer(serializers.Serializer):
    translations = serializers.ListField(required=False)
    test_cases = serializers.ListField(required=False)
    language_configs = serializers.ListField(required=False)
    forbidden_keywords = serializers.ListField(required=False)
    required_keywords = serializers.ListField(required=False)


class QuestionBankItemWriteSerializer(serializers.ModelSerializer):
    RESERVED_METADATA_PREFIXES = ("legacy_",)
    coding_ext = QuestionCodingExtSerializer(required=False, allow_null=True)

    class Meta:
        model = Question
        fields = [
            "question_type",
            "title",
            "prompt",
            "options",
            "correct_answer",
            "score",
            "order",
            "difficulty",
            "time_limit",
            "memory_limit",
            "metadata",
            "coding_ext",
        ]

    def validate(self, attrs):
        question_type = attrs.get("question_type") or getattr(self.instance, "question_type", None)
        coding_ext = attrs.get("coding_ext")
        metadata = attrs.get("metadata")

        if question_type == Question.QuestionType.CODING and coding_ext is None and self.instance is None:
            # Keep payload contract explicit for coding question creation.
            attrs["coding_ext"] = {
                "translations": [],
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": [],
                "required_keywords": [],
            }

        if metadata is not None and self.instance is not None:
            existing_metadata = self.instance.metadata if isinstance(self.instance.metadata, dict) else {}
            if isinstance(metadata, dict):
                protected_metadata = {
                    key: value
                    for key, value in existing_metadata.items()
                    if key.startswith(self.RESERVED_METADATA_PREFIXES)
                }
                attrs["metadata"] = {
                    **metadata,
                    **protected_metadata,
                }
        return attrs


class QuestionBankItemReadSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    bank_item_id = serializers.UUIDField()
    adapter_question_id = serializers.UUIDField(required=False, allow_null=True)
    bank = serializers.UUIDField()
    question_type = serializers.CharField()
    title = serializers.CharField(allow_blank=True)
    prompt = serializers.CharField(allow_blank=True)
    options = serializers.ListField(required=False)
    correct_answer = serializers.JSONField(required=False, allow_null=True)
    score = serializers.IntegerField()
    order = serializers.IntegerField()
    difficulty = serializers.CharField(allow_blank=True)
    time_limit = serializers.IntegerField()
    memory_limit = serializers.IntegerField()
    source_question_id = serializers.UUIDField(required=False, allow_null=True)
    source_bank_id = serializers.CharField(required=False, allow_null=True)
    source_bank_name = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    contest_usages = serializers.ListField(required=False)
    question_asset_id = serializers.CharField(required=False, allow_null=True)
    question_version_id = serializers.CharField(required=False, allow_null=True)
    metadata = serializers.JSONField(required=False)
    created_by_username = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    coding_ext = QuestionCodingExtReadSerializer(required=False, allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

class QuestionBankSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="uuid", read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True)
    question_count = serializers.SerializerMethodField()
    is_subscribed = serializers.SerializerMethodField()

    class Meta:
        model = QuestionBank
        fields = [
            "id",
            "name",
            "description",
            "icon",
            "cover_url",
            "category",
            "visibility",
            "verified",
            "review_status",
            "review_note",
            "submitted_at",
            "reviewed_at",
            "reviewed_by_username",
            "owner",
            "owner_username",
            "question_count",
            "is_subscribed",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "owner_username",
            "verified",
            "review_status",
            "review_note",
            "submitted_at",
            "reviewed_at",
            "reviewed_by_username",
            "question_count",
            "is_subscribed",
            "created_at",
            "updated_at",
        ]

    def get_question_count(self, obj):
        # Use annotated value when available (avoids N+1 query).
        if hasattr(obj, "question_count"):
            return obj.question_count
        return obj.questions.count()

    def get_is_subscribed(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if hasattr(obj, "_is_subscribed"):
            return obj._is_subscribed
        from .models import QuestionBankSubscription
        return QuestionBankSubscription.objects.filter(
            user=request.user, bank=obj
        ).exists()


class ExploreBankItemSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="uuid", read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True)
    question_count = serializers.SerializerMethodField()
    is_subscribed = serializers.SerializerMethodField()
    source = serializers.CharField(default="platform", read_only=True)

    class Meta:
        model = QuestionBank
        fields = [
            "id",
            "name",
            "description",
            "icon",
            "cover_url",
            "category",
            "visibility",
            "verified",
            "review_status",
            "reviewed_at",
            "reviewed_by_username",
            "owner_username",
            "question_count",
            "is_subscribed",
            "source",
            "created_at",
            "updated_at",
        ]

    def get_question_count(self, obj):
        if hasattr(obj, "question_count"):
            return obj.question_count
        return obj.questions.count()

    def get_is_subscribed(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if hasattr(obj, "_is_subscribed"):
            return obj._is_subscribed
        from .models import QuestionBankSubscription
        return QuestionBankSubscription.objects.filter(
            user=request.user, bank=obj
        ).exists()


class QuestionCloneSerializer(serializers.Serializer):
    target_bank_id = serializers.UUIDField(required=False)


class QuestionInboxItemSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=["problem", "exam_question"])
    source_id = serializers.UUIDField()
    title = serializers.CharField()
    contest_id = serializers.UUIDField(required=False, allow_null=True)
    contest_name = serializers.CharField(required=False, allow_blank=True)
    question_type = serializers.CharField(required=False, allow_blank=True)
    score = serializers.IntegerField(required=False, min_value=0)
    updated_at = serializers.DateTimeField(required=False)


class QuestionInboxIngestItemSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=["problem", "exam_question"])
    source_id = serializers.UUIDField()


class QuestionInboxIngestSerializer(serializers.Serializer):
    target_bank_id = serializers.UUIDField()
    items = QuestionInboxIngestItemSerializer(many=True, allow_empty=False)
