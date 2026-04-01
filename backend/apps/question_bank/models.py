"""
Models for question bank domain.
"""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q, UniqueConstraint


class QuestionBank(models.Model):
    class Category(models.TextChoices):
        CODING = "coding", "Coding"
        EXAM = "exam", "Exam"

    class Visibility(models.TextChoices):
        PRIVATE = "private", "Private"
        PUBLIC = "public", "Public"

    class ReviewStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

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
    icon = models.CharField(max_length=32, blank=True, default="")
    cover_url = models.URLField(blank=True, default="")
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
    review_status = models.CharField(
        max_length=20,
        choices=ReviewStatus.choices,
        default=ReviewStatus.DRAFT,
        db_index=True,
    )
    review_note = models.TextField(blank=True, default="")
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_question_banks",
    )
    is_archived = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "question_banks"
        ordering = ["-updated_at", "id"]
        indexes = [
            models.Index(fields=["owner", "category"]),
            models.Index(fields=["visibility", "verified"]),
            models.Index(fields=["review_status", "visibility", "verified"]),
        ]
        constraints = [
            # Each user may have at most one active (non-archived) bank per category.
            # Platform-managed banks (owner=NULL) are exempt.
            UniqueConstraint(
                fields=["owner", "category"],
                condition=Q(is_archived=False, owner__isnull=False),
                name="unique_active_bank_per_user_category",
            ),
        ]

    def __str__(self):
        owner = self.owner.username if self.owner else "platform"
        return f"{self.name} ({owner})"


class QuestionAsset(models.Model):
    class AssetType(models.TextChoices):
        CODING = "coding", "Coding"
        TRUE_FALSE = "true_false", "True/False"
        SINGLE_CHOICE = "single_choice", "Single Choice"
        MULTIPLE_CHOICE = "multiple_choice", "Multiple Choice"
        SHORT_ANSWER = "short_answer", "Short Answer"
        ESSAY = "essay", "Essay"
        READING_SET = "reading_set", "Reading Set"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    class Visibility(models.TextChoices):
        PRIVATE = "private", "Private"
        PUBLIC = "public", "Public"

    class VersionState(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

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
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    visibility = models.CharField(
        max_length=20,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
        db_index=True,
    )
    version_state = models.CharField(
        max_length=20,
        choices=VersionState.choices,
        default=VersionState.PUBLISHED,
        db_index=True,
    )
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
            models.Index(fields=["status", "visibility"]),
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


class Question(models.Model):
    """
    DEPRECATED — Legacy bank question adapter.

    New code should read from QuestionBankMembership + QuestionAsset.payload
    directly. This model is kept as a materialized read cache and will be
    removed once all read paths migrate to pure asset projection.
    """
    class QuestionType(models.TextChoices):
        CODING = "coding", "Coding"
        EXAM = "exam", "Exam"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
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
    question_asset = models.ForeignKey(
        QuestionAsset,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bank_question_adapters",
    )
    question_version = models.ForeignKey(
        QuestionVersion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bank_question_adapters",
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
        ordering = ["order", "created_at"]
        indexes = [
            models.Index(fields=["bank", "order"]),
            models.Index(fields=["question_type"]),
            models.Index(fields=["source_bank", "source_question"]),
        ]

    def __str__(self):
        return f"{self.id} - {self.title or self.prompt[:40]}"


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
    legacy_question = models.OneToOneField(
        Question,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="asset_membership",
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
    For exam questions: the ``legacy_exam_question`` FK is used (Phase 3 bridge).
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

    # -- Legacy bridges (to be retired) --
    legacy_contest_problem = models.OneToOneField(
        "contests.ContestProblem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="question_binding",
    )
    legacy_exam_question = models.OneToOneField(
        "contests.ExamQuestion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="question_binding",
    )

    binding_type = models.CharField(max_length=32, choices=QuestionAsset.AssetType.choices)
    order = models.IntegerField(default=0)
    score = models.PositiveIntegerField(default=100)

    # -- Source tracking (from ContestProblem) --
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


class QuestionCodingExt(models.Model):
    """
    DEPRECATED — Legacy coding extension for Question adapter.

    Coding data (translations, test_cases, language_configs, keywords) is now
    stored in QuestionAsset.payload. This model is kept as a materialized cache.
    """
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
