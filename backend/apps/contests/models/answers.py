"""Paper exam answer models."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import models

from .questions import ExamQuestionType

User = get_user_model()


class ExamAnswer(models.Model):
    """
    Student answer for a paper-style exam question.
    Supports auto-save (upsert on participant+question) and TA grading.
    """
    participant = models.ForeignKey(
        "contests.ContestParticipant",
        on_delete=models.CASCADE,
        related_name='exam_answers',
        verbose_name='考生'
    )
    question = models.ForeignKey(
        "contests.ExamQuestion",
        on_delete=models.CASCADE,
        related_name='answers',
        verbose_name='題目'
    )
    answer = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='作答內容',
        help_text='選擇題: {"selected": "A"}, 多選: {"selected": ["A","B"]}, 簡答/問答: {"text": "..."}'
    )
    question_snapshot = models.JSONField(
        null=True,
        blank=True,
        verbose_name='題目快照',
        help_text='首次作答時記錄的題目狀態，用於確保批改時參照學生作答時的題目'
    )

    # Auto-grading result (for objective questions)
    is_correct = models.BooleanField(
        null=True,
        blank=True,
        verbose_name='是否正確',
        help_text='選擇/是非題自動判定；問答題由 TA 手動設定'
    )

    # TA grading
    score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='得分'
    )
    feedback = models.TextField(
        blank=True,
        verbose_name='批改評語'
    )
    graded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='graded_answers',
        verbose_name='批改者'
    )
    graded_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='批改時間'
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')

    class Meta:
        db_table = 'exam_answers'
        verbose_name = '考試作答'
        verbose_name_plural = '考試作答'
        unique_together = ['participant', 'question']
        indexes = [
            models.Index(fields=['participant', 'question']),
        ]

    def __str__(self):
        return f"Answer by P#{self.participant_id} for Q#{self.question_id}"

    def auto_grade(self):
        """Auto-grade objective questions (true_false, single_choice, multiple_choice).
        優先使用 question_snapshot 中的資料，確保評分基準與學生作答時一致。
        """
        if self.question_snapshot:
            q_type = self.question_snapshot.get('question_type')
            correct = self.question_snapshot.get('correct_answer')
            q_score = self.question_snapshot.get('score', 0)
        else:
            q_type = self.question.question_type
            correct = self.question.correct_answer
            q_score = self.question.score

        if correct is None:
            return
        if q_type in (
            ExamQuestionType.TRUE_FALSE,
            ExamQuestionType.SINGLE_CHOICE,
        ):
            self.is_correct = self.answer.get('selected') == correct
            self.score = q_score if self.is_correct else 0
        elif q_type == ExamQuestionType.MULTIPLE_CHOICE:
            selected = set(self.answer.get('selected', []))
            correct_set = set(correct) if isinstance(correct, list) else set()
            self.is_correct = selected == correct_set
            self.score = q_score if self.is_correct else 0
