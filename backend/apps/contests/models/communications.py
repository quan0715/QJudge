"""Contest announcement and clarification models."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import models

from apps.problems.models import CodingProblem

User = get_user_model()


class ContestAnnouncement(models.Model):
    """
    Announcement for a contest.
    """
    contest = models.ForeignKey(
        "contests.Contest",
        on_delete=models.CASCADE,
        related_name='announcements',
        verbose_name='考試'
    )

    title = models.CharField(max_length=255, verbose_name='標題')
    content = models.TextField(verbose_name='內容')

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_announcements',
        verbose_name='發布者'
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='發布時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')

    class Meta:
        db_table = 'contest_announcements'
        verbose_name = '考試公告'
        verbose_name_plural = '考試公告'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class Clarification(models.Model):
    """
    Clarification/Q&A during contest.
    Replaces the older ContestQuestion model with better structure.
    """
    contest = models.ForeignKey(
        "contests.Contest",
        on_delete=models.CASCADE,
        related_name='clarifications',
        verbose_name='考試'
    )
    problem = models.ForeignKey(
        CodingProblem,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='clarifications',
        verbose_name='題目',
        help_text='若為 null 則為一般問題'
    )
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='authored_clarifications',
        verbose_name='提問者'
    )

    question = models.TextField(verbose_name='問題')
    answer = models.TextField(null=True, blank=True, verbose_name='回答')

    is_public = models.BooleanField(
        default=False,
        verbose_name='公開',
        help_text='是否對所有參賽者公開此 Q&A'
    )

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('answered', 'Answered'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        verbose_name='狀態'
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='提問時間')
    answered_at = models.DateTimeField(null=True, blank=True, verbose_name='回答時間')

    class Meta:
        db_table = 'contest_clarifications'
        verbose_name = 'Clarification'
        verbose_name_plural = 'Clarifications'
        ordering = ['created_at']

    def __str__(self):
        return f"Clarification #{self.id} by {self.author.username}"
