"""Core contest model."""
from __future__ import annotations

import uuid as uuid_lib

from django.contrib.auth import get_user_model
from django.db import models

from ..managers import ContestQuerySet
from .policies import default_anticheat_device_policy

User = get_user_model()


class Contest(models.Model):
    """
    Contest or Exam model.
    Supports both competition and exam modes with flexible creation flow.
    """
    id = models.UUIDField(primary_key=True, default=uuid_lib.uuid4, editable=False)

    # Basic info - name is the only required field for creation
    name = models.CharField(max_length=255, blank=True, default='', verbose_name='名稱')
    description = models.TextField(blank=True, verbose_name='描述')
    rules = models.TextField(blank=True, verbose_name='競賽規定')

    # Time settings - nullable for MVP creation flow (can be set later)
    start_time = models.DateTimeField(null=True, blank=True, verbose_name='開始時間')
    end_time = models.DateTimeField(null=True, blank=True, verbose_name='結束時間')

    # Owner/creator
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='owned_contests',
        verbose_name='主辦者',
        null=True,
        blank=True
    )

    # Visibility and access control
    VISIBILITY_CHOICES = [
        ('public', 'Public'),
        ('private', 'Private'),
    ]
    visibility = models.CharField(
        max_length=20,
        choices=VISIBILITY_CHOICES,
        default='public',
        verbose_name='可見性'
    )
    attendance_check_enabled = models.BooleanField(
        default=False,
        verbose_name='啟用 QR 簽到簽退',
        help_text='啟用後學生需先完成 QR 簽到與現場照片佐證才可開始考試',
    )
    ATTENDANCE_PHOTO_POLICY_CHOICES = [
        ('room', 'Room photo'),
        ('room_and_selfie', 'Room and selfie photos'),
    ]
    attendance_photo_policy = models.CharField(
        max_length=24,
        choices=ATTENDANCE_PHOTO_POLICY_CHOICES,
        default='room',
        verbose_name='簽到佐證照片策略',
        help_text='room: 後鏡頭拍攝現場; room_and_selfie: 後鏡頭現場與前鏡頭本人各一張',
    )

    # Contest status - draft/published/archived
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True,
        verbose_name='狀態',
        help_text='draft: 草稿未發布；published: 已發布可進行；archived: 已封存唯讀'
    )

    allow_multiple_joins = models.BooleanField(default=False, verbose_name='允許多次加入')
    max_cheat_warnings = models.IntegerField(default=3)

    # Contest type
    CONTEST_TYPE_CHOICES = [
        ('coding', 'Coding Test'),
        ('paper_exam', 'Paper Exam'),
    ]
    contest_type = models.CharField(
        max_length=15,
        choices=CONTEST_TYPE_CHOICES,
        default='coding',
        verbose_name='比賽類型',
        help_text='coding: 程式題; paper_exam: 紙筆題考試'
    )

    DELIVERY_MODE_CHOICES = [
        ('exam', 'Exam'),
        ('practice', 'Practice'),
    ]
    delivery_mode = models.CharField(
        max_length=12,
        choices=DELIVERY_MODE_CHOICES,
        default='exam',
        db_index=True,
        verbose_name='交付模式',
        help_text='exam: 正式考試流程; practice: 教室練習/作業流程',
    )

    counts_toward_grade = models.BooleanField(
        default=True,
        verbose_name='計入正式成績',
        help_text='True: 作業/考試（成績計入成績簿）; False: 純練習（僅保留最新提交、不計分）',
    )

    # Contest-level question edit lock (production safeguard)
    class QuestionEditLockTrigger(models.TextChoices):
        CODING_SUBMISSION = 'coding_submission', 'Coding Submission'
        EXAM_ANSWER = 'exam_answer', 'Exam Answer'

    question_edit_locked = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name='題目編輯已鎖定',
        help_text='任一學生正式作答後鎖定整場競賽題目編輯',
    )
    question_edit_locked_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='題目鎖定時間',
    )
    question_edit_lock_trigger = models.CharField(
        max_length=32,
        choices=QuestionEditLockTrigger.choices,
        null=True,
        blank=True,
        verbose_name='題目鎖定觸發來源',
    )

    # Cheat detection settings
    cheat_detection_enabled = models.BooleanField(
        default=False,
        verbose_name='啟用防作弊模式',
        help_text='啟用全螢幕與防失焦的嚴格防作弊模式'
    )
    anticheat_device_policy = models.JSONField(
        default=default_anticheat_device_policy,
        verbose_name='防作弊裝置策略',
        help_text='依裝置定義 sources/detectors 的監考策略'
    )
    warning_timeout_seconds = models.PositiveIntegerField(
        default=20,
        verbose_name='警告框冷卻秒數',
        help_text='警告框顯示後，需等待幾秒才可手動關閉'
    )
    screen_share_recovery_grace_ms = models.PositiveIntegerField(
        default=30_000,
        verbose_name='螢幕共享恢復寬限時間 (毫秒)',
        help_text='螢幕共享中斷後，允許學生重新分享的寬限時間'
    )

    # Scoreboard settings
    scoreboard_visible_during_contest = models.BooleanField(
        default=False,
        verbose_name='比賽中顯示排行榜',
        help_text='False: 學生只能看自己成績；True: 學生可看完整排行榜'
    )

    # Results publication (TA manually opens after grading)
    results_published = models.BooleanField(
        default=False,
        verbose_name='成績已公布',
        help_text='TA 完成批改後手動設為 True，學生才能查看成績'
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')

    participants = models.ManyToManyField(
        User,
        through='ContestParticipant',
        related_name='participated_contests',
        verbose_name='參與者'
    )

    # Multiple admins/teachers for contest management
    admins = models.ManyToManyField(
        User,
        related_name='admin_contests',
        blank=True,
        verbose_name='管理員',
        help_text='除 owner 外的其他管理者 (teachers)'
    )

    objects = ContestQuerySet.as_manager()

    class Meta:
        db_table = 'contests'
        verbose_name = '考試'
        verbose_name_plural = '考試'
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def has_exam_started(self):
        """任何學生已開始作答即回傳 True（用於凍結題目判定）"""
        from .participants import ExamStatus

        return self.registrations.filter(
            exam_status__in=[
                ExamStatus.IN_PROGRESS,
                ExamStatus.PAUSED,
                ExamStatus.LOCKED,
                ExamStatus.SUBMITTED,
            ]
        ).exists()

    @property
    def can_download_my_report(self):
        """Participants can always download their report after submission."""
        return True

    @property
    def report_includes_grading(self):
        """
        Whether the student report should include grading details
        (scores, correct answers, TA feedback).
        For paper exams, only after results are published.
        For coding contests, always.
        """
        if self.contest_type == 'paper_exam':
            return self.results_published
        return True
