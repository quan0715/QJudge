"""
Models for question bank domain.
"""
import uuid

from django.conf import settings
from django.db import models


class QuestionBank(models.Model):
    class Category(models.TextChoices):
        CODING = "coding", "Coding"
        EXAM = "exam", "Exam"

    class Visibility(models.TextChoices):
        PRIVATE = "private", "Private"
        PUBLIC = "public", "Public"

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="question_banks",
        null=True,
        blank=True,
        help_text="Null means platform-managed official bank.",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.CODING,
        db_index=True,
    )
    visibility = models.CharField(
        max_length=20,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
        db_index=True,
    )
    verified = models.BooleanField(default=False, db_index=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "question_banks"
        ordering = ["-updated_at", "id"]
        indexes = [
            models.Index(fields=["owner", "category"]),
            models.Index(fields=["visibility", "verified"]),
        ]

    def __str__(self):
        owner = self.owner.username if self.owner else "platform"
        return f"{self.name} ({owner})"


class Question(models.Model):
    class QuestionType(models.TextChoices):
        CODING = "coding", "Coding"
        EXAM = "exam", "Exam"

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    bank = models.ForeignKey(
        QuestionBank,
        on_delete=models.CASCADE,
        related_name="questions",
    )
    question_type = models.CharField(
        max_length=20,
        choices=QuestionType.choices,
        default=QuestionType.CODING,
        db_index=True,
    )
    title = models.CharField(max_length=255, blank=True, default="")
    prompt = models.TextField(blank=True, default="")
    options = models.JSONField(default=list, blank=True)
    correct_answer = models.JSONField(null=True, blank=True)
    score = models.PositiveIntegerField(default=100)
    order = models.IntegerField(default=0)

    # Coding shared fields
    difficulty = models.CharField(max_length=10, default="medium")
    time_limit = models.IntegerField(default=1000)
    memory_limit = models.IntegerField(default=128)

    # Unified source tracking (set when cloned/imported from another bank)
    source_question = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="derived_questions",
    )
    source_bank = models.ForeignKey(
        QuestionBank,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sourced_questions",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_bank_questions",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "questions"
        ordering = ["order", "id"]
        indexes = [
            models.Index(fields=["bank", "order"]),
            models.Index(fields=["question_type"]),
            models.Index(fields=["source_bank", "source_question"]),
        ]

    def __str__(self):
        return f"{self.id} - {self.title or self.prompt[:40]}"


class QuestionCodingExt(models.Model):
    question = models.OneToOneField(
        Question,
        on_delete=models.CASCADE,
        related_name="coding_ext",
    )
    translations = models.JSONField(default=list, blank=True)
    test_cases = models.JSONField(default=list, blank=True)
    language_configs = models.JSONField(default=list, blank=True)
    forbidden_keywords = models.JSONField(default=list, blank=True)
    required_keywords = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "questions_coding_ext"

    def __str__(self):
        return f"coding_ext:{self.question_id}"
