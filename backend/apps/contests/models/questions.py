"""Paper exam question models."""
from __future__ import annotations

import uuid as uuid_lib

from django.db import models


class SourceMode(models.TextChoices):
    """Source mode for contest questions."""
    MANUAL = "manual", "Manual"
    JSON = "json", "JSON"
    COPY = "copy", "Copy"
    REFERENCE = "reference", "Reference"


class ExamQuestionType(models.TextChoices):
    TRUE_FALSE = "true_false", "是非題"
    SINGLE_CHOICE = "single_choice", "單選題"
    MULTIPLE_CHOICE = "multiple_choice", "多選題"
    SHORT_ANSWER = "short_answer", "簡答題"
    ESSAY = "essay", "問答題"


class ExamQuestionScorePolicy(models.TextChoices):
    NORMAL = "normal", "正常計分"
    EXCLUDED = "excluded", "不計分"
    FULL_MARKS = "full_marks", "送分"
    REDISTRIBUTE = "redistribute", "配分重分配"


class ExamQuestionAnswerFormat(models.TextChoices):
    PLAIN_TEXT = "plain_text", "純文字"
    MARKDOWN = "markdown", "Markdown"
    MARKDOWN_MATH = "markdown_math", "Markdown + 數學式"
    OPEN_DOCUMENT = "open_document", "開放作答紙"


class ExamQuestionGroup(models.Model):
    """
    Contest-local question group with a shared stem.
    """

    id = models.UUIDField(primary_key=True, default=uuid_lib.uuid4, editable=False)
    contest = models.ForeignKey(
        "contests.Contest",
        on_delete=models.CASCADE,
        related_name='exam_question_groups',
        verbose_name='考試',
    )
    title = models.CharField(max_length=255, blank=True, default='', verbose_name='題組標題')
    shared_stem_markdown = models.TextField(blank=True, default='', verbose_name='共同題幹')
    order = models.IntegerField(default=0, verbose_name='排序')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')

    class Meta:
        db_table = 'exam_question_groups'
        verbose_name = '考卷題組'
        verbose_name_plural = '考卷題組'
        ordering = ['order', 'created_at']
        indexes = [
            models.Index(fields=['contest', 'order']),
        ]

    def __str__(self):
        return f"{self.contest_id} group {self.title or self.id}"


class ExamQuestion(models.Model):
    """
    Configurable exam question for paper-style contests.
    """

    id = models.UUIDField(primary_key=True, default=uuid_lib.uuid4, editable=False)

    contest = models.ForeignKey(
        "contests.Contest",
        on_delete=models.CASCADE,
        related_name='exam_questions',
        verbose_name='考試'
    )
    question_type = models.CharField(
        max_length=30,
        choices=ExamQuestionType.choices,
        default=ExamQuestionType.SINGLE_CHOICE,
        verbose_name='題型'
    )
    prompt = models.TextField(verbose_name='題目內容')
    options = models.JSONField(
        default=list,
        blank=True,
        verbose_name='選項',
        help_text='選擇題選項，陣列格式'
    )
    correct_answer = models.JSONField(
        null=True,
        blank=True,
        verbose_name='標準答案',
        help_text='是非/選擇題可存標準答案，問答題可留空'
    )
    reference_answer_document = models.JSONField(
        null=True,
        blank=True,
        verbose_name='評分參考答案文件',
        help_text='open_document 題型使用的結構化評分參考答案',
    )
    explanation = models.TextField(
        blank=True,
        default='',
        verbose_name='詳解',
        help_text='題目詳解，於成績公布後提供學生查看',
    )
    explanation_document = models.JSONField(
        null=True,
        blank=True,
        verbose_name='詳解文件',
        help_text='open_document 題型使用的結構化詳解',
    )
    score = models.PositiveIntegerField(default=1, verbose_name='配分')
    score_policy = models.CharField(
        max_length=16,
        choices=ExamQuestionScorePolicy.choices,
        default=ExamQuestionScorePolicy.NORMAL,
        verbose_name='計分策略',
        help_text='normal=正常計分, excluded=不計分, full_marks=送分, redistribute=配分重分配',
    )
    score_policy_config = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='計分策略設定',
        help_text='redistribute 模式使用：{"redistribute_to": ["question_uuid1", ...]}，空陣列表示全選',
    )
    order = models.IntegerField(default=0, verbose_name='排序')
    group = models.ForeignKey(
        ExamQuestionGroup,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='questions',
        verbose_name='題組',
    )
    order_in_group = models.PositiveIntegerField(null=True, blank=True, verbose_name='題組內排序')
    answer_format = models.CharField(
        max_length=32,
        choices=ExamQuestionAnswerFormat.choices,
        default=ExamQuestionAnswerFormat.PLAIN_TEXT,
        verbose_name='答案格式',
    )
    source_bank_id = models.UUIDField(null=True, blank=True, verbose_name='來源題庫 UUID')
    source_bank_name = models.CharField(max_length=255, blank=True, default='', verbose_name='來源題庫名稱')
    source_question_id = models.UUIDField(null=True, blank=True, verbose_name='來源題庫題目 UUID')
    source_mode = models.CharField(
        max_length=20,
        choices=SourceMode.choices,
        default=SourceMode.MANUAL,
        verbose_name='來源模式',
    )
    question_asset = models.ForeignKey(
        'question_bank.QuestionAsset',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='exam_question_adapters',
        verbose_name='對應題目資產',
    )
    question_version = models.ForeignKey(
        'question_bank.QuestionVersion',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='exam_question_adapters',
        verbose_name='對應題目版本',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')

    class Meta:
        db_table = 'exam_questions'
        verbose_name = '考卷題目'
        verbose_name_plural = '考卷題目'
        ordering = ['order', 'created_at']
        indexes = [
            models.Index(fields=['contest', 'order']),
            models.Index(fields=['source_question_id']),
        ]
        constraints = [
            # Deferrable so reorder transactions can swap orders mid-flight
            # (e.g. drag-and-drop) without violating the constraint until
            # commit time.
            models.UniqueConstraint(
                fields=['contest', 'order'],
                name='uq_exam_question_contest_order',
                deferrable=models.Deferrable.DEFERRED,
            ),
        ]

    def __str__(self):
        return f"{self.contest_id}#{self.id}({self.question_type})"

    def to_snapshot(self):
        """產生題目快照，用於凍結學生作答時的題目狀態"""
        return {
            'prompt': self.prompt,
            'options': self.options,
            'correct_answer': self.correct_answer,
            'reference_answer_document': self.reference_answer_document,
            'explanation': self.explanation,
            'explanation_document': self.explanation_document,
            'question_type': self.question_type,
            'score': self.score,
            'answer_format': self.answer_format,
            'group_id': str(self.group_id) if self.group_id else None,
            'order_in_group': self.order_in_group,
        }
