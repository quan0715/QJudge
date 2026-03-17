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


class QuestionSerializer(serializers.ModelSerializer):
    bank = serializers.UUIDField(source="bank.uuid", read_only=True)
    coding_ext = QuestionCodingExtSerializer(required=False, allow_null=True)
    source_problem_id = serializers.IntegerField(read_only=True)
    source_exam_question_id = serializers.IntegerField(read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = Question
        fields = [
            "id",
            "bank",
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
            "source_problem_id",
            "source_exam_question_id",
            "metadata",
            "created_by_username",
            "coding_ext",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "source_problem_id",
            "source_exam_question_id",
            "created_by_username",
            "created_at",
            "updated_at",
            "bank",
        ]

    def validate(self, attrs):
        question_type = attrs.get("question_type") or getattr(self.instance, "question_type", None)
        coding_ext = attrs.get("coding_ext")

        if question_type == Question.QuestionType.CODING and coding_ext is None and self.instance is None:
            # Keep payload contract explicit for coding question creation.
            attrs["coding_ext"] = {
                "translations": [],
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": [],
                "required_keywords": [],
            }
        return attrs

    def create(self, validated_data):
        coding_ext = validated_data.pop("coding_ext", None)
        question = Question.objects.create(**validated_data)
        if question.question_type == Question.QuestionType.CODING:
            QuestionCodingExt.objects.create(question=question, **(coding_ext or {}))
        return question

    def update(self, instance, validated_data):
        coding_ext = validated_data.pop("coding_ext", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if coding_ext is not None:
            QuestionCodingExt.objects.update_or_create(
                question=instance,
                defaults=coding_ext,
            )

        return instance


class QuestionBankSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="uuid", read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = QuestionBank
        fields = [
            "id",
            "name",
            "description",
            "category",
            "visibility",
            "verified",
            "owner",
            "owner_username",
            "question_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "owner_username",
            "question_count",
            "created_at",
            "updated_at",
        ]

    def get_question_count(self, obj):
        return obj.questions.count()


class ExploreBankItemSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="uuid", read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    question_count = serializers.SerializerMethodField()
    source = serializers.CharField(default="platform", read_only=True)

    class Meta:
        model = QuestionBank
        fields = [
            "id",
            "name",
            "description",
            "category",
            "visibility",
            "verified",
            "owner_username",
            "question_count",
            "source",
            "created_at",
            "updated_at",
        ]

    def get_question_count(self, obj):
        return obj.questions.count()


class QuestionCloneSerializer(serializers.Serializer):
    target_bank_id = serializers.UUIDField(required=False)
