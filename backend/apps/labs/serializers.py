"""
Serializers for labs.
"""
from django.utils import timezone
from rest_framework import serializers

from apps.problems.serializers import ProblemListSerializer
from .models import Lab, LabProblem


class LabListSerializer(serializers.ModelSerializer):
    owner = serializers.ReadOnlyField(source="owner.username")
    problem_count = serializers.IntegerField(read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Lab
        fields = [
            "id",
            "title",
            "description",
            "owner",
            "due_at",
            "is_published",
            "problem_count",
            "is_overdue",
            "created_at",
            "updated_at",
        ]

    def get_is_overdue(self, obj: Lab) -> bool:
        return bool(obj.due_at and timezone.now() > obj.due_at)


class LabDetailSerializer(serializers.ModelSerializer):
    owner = serializers.ReadOnlyField(source="owner.username")
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Lab
        fields = [
            "id",
            "title",
            "description",
            "owner",
            "due_at",
            "is_published",
            "is_overdue",
            "created_at",
            "updated_at",
        ]

    def get_is_overdue(self, obj: Lab) -> bool:
        return bool(obj.due_at and timezone.now() > obj.due_at)


class LabProblemListSerializer(serializers.ModelSerializer):
    problem = ProblemListSerializer(read_only=True)

    class Meta:
        model = LabProblem
        fields = [
            "id",
            "order",
            "problem",
        ]
