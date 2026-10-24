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
        """Auto-grade objective questions against the current grading rules."""
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


class ExamBatchGradeWrite(models.Model):
    """Immutable receipt per answer and batch run, committed with the grade.

    Artifacts are presentation copies. This receipt remains available if object
    storage or the worker fails after a grade commits.
    """
    answer = models.ForeignKey(ExamAnswer, on_delete=models.CASCADE, related_name='batch_writes')
    session_id = models.UUIDField(db_index=True)
    run_id = models.UUIDField()
    grader = models.ForeignKey(User, on_delete=models.CASCADE)
    score = models.DecimalField(max_digits=6, decimal_places=2)
    feedback = models.TextField(blank=True)
    graded_at = models.DateTimeField()

    class Meta:
        db_table = 'exam_batch_grade_writes'
        constraints = [
            models.UniqueConstraint(fields=['answer', 'session_id', 'run_id'], name='unique_batch_run_answer_write'),
        ]


class ExamGradingUnit(models.Model):
    """Durable AI grading snapshot, drafts and per-answer commit outcomes."""
    contest = models.ForeignKey("contests.Contest", on_delete=models.CASCADE)
    grader = models.ForeignKey(User, on_delete=models.CASCADE)
    session_id = models.UUIDField(db_index=True)
    run_id = models.UUIDField()
    unit_id = models.CharField(max_length=255)
    snapshot = models.JSONField(default=dict)
    rubric = models.JSONField(null=True, blank=True)
    drafts = models.JSONField(default=dict)
    results = models.JSONField(default=dict)
    progress = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        targets = [a for a in self.snapshot.get('answers', []) if a['writable']]
        complete = all(self.results.get(a['exam_answer_id'], {}).get('status') in ('ok', 'skipped') for a in targets)
        self.progress = {
            'unit_id': self.unit_id, 'run_id': str(self.run_id),
            'question_ids': self.snapshot.get('question_ids', []),
            'total_count': len(targets), 'draft_count': len(self.drafts),
            'written_count': sum(r['status'] == 'ok' for r in self.results.values()),
            'skipped_count': sum(r['status'] == 'skipped' for r in self.results.values()),
            'status': 'completed' if complete and self.snapshot.get('submitted') else ('draft' if self.drafts else 'pending'),
        }
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = set(kwargs['update_fields']) | {'progress'}
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'exam_grading_units'
        constraints = [models.UniqueConstraint(
            fields=['contest', 'grader', 'session_id', 'run_id', 'unit_id'],
            name='uq_exam_grading_unit_attempt',
        )]
