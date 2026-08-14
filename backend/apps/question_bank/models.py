"""
Models for question bank domain.
"""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import UniqueConstraint


class QuestionBank(models.Model):
    class Category(models.TextChoices):
        CODING = "coding", "Coding"
        EXAM = "exam", "Exam"

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="question_banks",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    icon = models.CharField(max_length=32, blank=True, default="")
    cover_url = models.URLField(blank=True, default="")
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.CODING,
        db_index=True,
    )
    is_archived = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "question_banks"
        ordering = ["-updated_at", "id"]
        indexes = [
            models.Index(fields=["owner", "category"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.owner.username})"


class QuestionAsset(models.Model):
    class AssetType(models.TextChoices):
        CODING = "coding", "Coding"
        TRUE_FALSE = "true_false", "True/False"
        SINGLE_CHOICE = "single_choice", "Single Choice"
        MULTIPLE_CHOICE = "multiple_choice", "Multiple Choice"
        SHORT_ANSWER = "short_answer", "Short Answer"
        ESSAY = "essay", "Essay"
        READING_SET = "reading_set", "Reading Set"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="question_assets",
    )
    asset_type = models.CharField(
        max_length=32,
        choices=AssetType.choices,
        db_index=True,
    )
    title = models.CharField(max_length=255, blank=True, default="")
    prompt = models.TextField(blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    latest_version = models.ForeignKey(
        "QuestionVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "question_assets"
        ordering = ["-updated_at", "id"]
        indexes = [
            models.Index(fields=["owner", "asset_type"]),
        ]

    def __str__(self):
        return f"{self.asset_type}:{self.id}"


class QuestionVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question_asset = models.ForeignKey(
        QuestionAsset,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number = models.PositiveIntegerField()
    title = models.CharField(max_length=255, blank=True, default="")
    prompt = models.TextField(blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_question_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "question_versions"
        ordering = ["-version_number", "-created_at"]
        constraints = [
            UniqueConstraint(
                fields=["question_asset", "version_number"],
                name="unique_question_version_per_asset",
            ),
        ]

    def __str__(self):
        return f"{self.question_asset_id}@v{self.version_number}"


class QuestionBankMembership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank = models.ForeignKey(
        QuestionBank,
        on_delete=models.CASCADE,
        related_name="asset_memberships",
    )
    question_asset = models.ForeignKey(
        QuestionAsset,
        on_delete=models.CASCADE,
        related_name="bank_memberships",
    )
    order = models.IntegerField(default=0)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="added_question_bank_memberships",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "question_bank_memberships"
        ordering = ["order", "created_at"]
        constraints = [
            UniqueConstraint(
                fields=["bank", "question_asset"],
                name="unique_bank_membership_per_asset",
            ),
        ]

    def __str__(self):
        return f"{self.bank_id}:{self.question_asset_id}"


class ContestQuestionBinding(models.Model):
    """
    Unified contest-question link.

    For coding problems: ``coding_problem`` FK points to the execution adapter
    (CodingProblem) that owns test cases, language configs, etc.
    For exam questions: ``exam_question`` points to the paper-exam adapter.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contest = models.ForeignKey(
        "contests.Contest",
        on_delete=models.CASCADE,
        related_name="question_bindings",
    )
    question_asset = models.ForeignKey(
        QuestionAsset,
        on_delete=models.CASCADE,
        related_name="contest_bindings",
    )
    question_version = models.ForeignKey(
        QuestionVersion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contest_bindings",
    )

    # -- Execution adapter links --
    coding_problem = models.ForeignKey(
        "problems.CodingProblem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contest_bindings",
        help_text="For coding-type bindings: the execution adapter that owns test cases, etc.",
    )

    exam_question = models.OneToOneField(
        "contests.ExamQuestion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="question_binding",
    )

    binding_type = models.CharField(max_length=32, choices=QuestionAsset.AssetType.choices)
    order = models.IntegerField(default=0)
    score = models.PositiveIntegerField(default=100)

    # -- Source tracking --
    source_bank_id = models.UUIDField(null=True, blank=True)
    source_bank_name = models.CharField(max_length=255, blank=True, default="")
    source_question_id = models.UUIDField(null=True, blank=True)
    source_mode = models.CharField(max_length=20, blank=True, default="manual")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_contest_question_bindings",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def label(self) -> str:
        if self.order < 26:
            return chr(65 + self.order)
        return f"P{self.order + 1}"

    class Meta:
        db_table = "contest_question_bindings"
        ordering = ["order", "created_at"]
        indexes = [
            models.Index(fields=["contest", "order"]),
            models.Index(fields=["question_asset"]),
            models.Index(fields=["coding_problem"]),
        ]

    def __str__(self):
        return f"{self.contest_id}:{self.question_asset_id}"
