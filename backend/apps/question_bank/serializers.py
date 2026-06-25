"""
Serializers for question bank API.
"""
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import QuestionBank


QUESTION_TYPE_CODING = "coding"
QUESTION_TYPE_EXAM = "exam"
QUESTION_TYPE_CHOICES = (
    (QUESTION_TYPE_CODING, "Coding"),
    (QUESTION_TYPE_EXAM, "Exam"),
)


class CodingQuestionContentSerializer(serializers.Serializer):
    description = serializers.CharField(allow_blank=True, required=False, default='')
    input_description = serializers.CharField(allow_blank=True, required=False, default='')
    output_description = serializers.CharField(allow_blank=True, required=False, default='')
    hint = serializers.CharField(allow_blank=True, required=False, default='')
    test_cases = serializers.ListField(required=False, default=list)
    language_configs = serializers.ListField(required=False, default=list)
    forbidden_keywords = serializers.ListField(required=False, default=list)
    required_keywords = serializers.ListField(required=False, default=list)


class CodingQuestionContentReadSerializer(serializers.Serializer):
    description = serializers.CharField(allow_blank=True, required=False, default='')
    input_description = serializers.CharField(allow_blank=True, required=False, default='')
    output_description = serializers.CharField(allow_blank=True, required=False, default='')
    hint = serializers.CharField(allow_blank=True, required=False, default='')
    test_cases = serializers.ListField(required=False)
    language_configs = serializers.ListField(required=False)
    forbidden_keywords = serializers.ListField(required=False)
    required_keywords = serializers.ListField(required=False)


class QuestionBankItemWriteSerializer(serializers.Serializer):
    question_type = serializers.ChoiceField(choices=QUESTION_TYPE_CHOICES, required=False, default=QUESTION_TYPE_CODING)
    title = serializers.CharField(allow_blank=True, required=False, default="")
    prompt = serializers.CharField(allow_blank=True, required=False, default="")
    options = serializers.ListField(required=False, default=list)
    correct_answer = serializers.JSONField(required=False, allow_null=True)
    score = serializers.IntegerField(required=False, default=100, min_value=0)
    order = serializers.IntegerField(required=False, default=0)
    difficulty = serializers.CharField(allow_blank=True, required=False, default="medium")
    time_limit = serializers.IntegerField(required=False, default=1000, min_value=1)
    memory_limit = serializers.IntegerField(required=False, default=128, min_value=1)
    metadata = serializers.JSONField(required=False, default=dict)
    coding_ext = CodingQuestionContentSerializer(required=False, allow_null=True)

    def validate(self, attrs):
        question_type = attrs.get("question_type") or QUESTION_TYPE_CODING
        coding_ext = attrs.get("coding_ext")

        if question_type == QUESTION_TYPE_CODING and coding_ext is None and self.instance is None:
            # Keep payload contract explicit for coding question creation.
            attrs["coding_ext"] = {
                "description": "",
                "input_description": "",
                "output_description": "",
                "hint": "",
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": [],
                "required_keywords": [],
            }
        return attrs


class QuestionBankItemReadSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    bank_item_id = serializers.UUIDField()
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
    coding_ext = CodingQuestionContentReadSerializer(required=False, allow_null=True)
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
        return obj.asset_memberships.count()

    @extend_schema_field(serializers.BooleanField())
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
        return obj.asset_memberships.count()

    @extend_schema_field(serializers.BooleanField())
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
