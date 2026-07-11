"""Contest participant state models."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class ExamStatus(models.TextChoices):
    """Explicit state for student exam participation."""
    NOT_STARTED = 'not_started', '未開始'
    IN_PROGRESS = 'in_progress', '進行中'
    PAUSED = 'paused', '暫停'
    LOCKED = 'locked', '已鎖定'
    SUBMITTED = 'submitted', '已交卷'


class ContestParticipant(models.Model):
    """
    Participant in a contest (registration record).
    Also known as ContestRegistration in API documentation.
    """
    contest = models.ForeignKey("contests.Contest", on_delete=models.CASCADE, related_name='registrations')
    user = models.ForeignKey(User, on_delete=models.CASCADE)

    score = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='總分')
    rank = models.IntegerField(null=True, blank=True, verbose_name='排名')

    joined_at = models.DateTimeField(auto_now_add=True, verbose_name='加入時間')
    started_at = models.DateTimeField(null=True, blank=True, verbose_name='開始時間')
    left_at = models.DateTimeField(null=True, blank=True, verbose_name='離開時間')

    # Locking metadata (needed for manual proctor action and audit)
    locked_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='鎖定時間'
    )
    lock_reason = models.TextField(
        blank=True,
        verbose_name='鎖定原因'
    )

    violation_count = models.IntegerField(default=0, verbose_name='違規次數')
    submit_reason = models.TextField(
        blank=True,
        default='',
        verbose_name='交卷原因',
        help_text='手動或系統自動交卷原因'
    )

    # Explicit exam state (primary state field for UI)
    exam_status = models.CharField(
        max_length=20,
        choices=ExamStatus.choices,
        default=ExamStatus.NOT_STARTED,
        verbose_name='考試狀態',
        help_text='學生考試狀態：未開始/進行中/暫停/已鎖定/已交卷'
    )
    @property
    def has_finished_exam(self):
        return self.exam_status == ExamStatus.SUBMITTED

    class Meta:
        db_table = 'contest_participants'
        verbose_name = '考試參與者'
        verbose_name_plural = '考試參與者'
        unique_together = ['contest', 'user']
