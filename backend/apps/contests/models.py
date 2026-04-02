"""
Models for contests and exams.
"""
import uuid as uuid_lib
from django.db import models
from django.db.models import Sum
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, identify_hasher, make_password
from django.utils import timezone
from apps.problems.models import Problem
from .managers import ContestQuerySet

User = get_user_model()


def default_anticheat_device_policy():
    """Default anti-cheat device policy (desktop/tablet)."""
    return {
        "desktop": {
            "enabled": True,
            "sources": {
                "screen_share": {
                    "enabled": True,
                    "capture_interval_seconds": 5,
                },
                "webcam": {
                    "enabled": False,
                    "capture_interval_seconds": 10,
                },
            },
            "detectors": {
                "pwa_mode": False,
                "fullscreen": True,
                "focus": True,
                "tab_visibility": True,
                "multi_display": True,
                "mouse_leave": True,
                "viewport_integrity": False,
            },
        },
        "tablet": {
            "enabled": True,
            "sources": {
                "screen_share": {
                    "enabled": False,
                    "capture_interval_seconds": 5,
                },
                "webcam": {
                    "enabled": True,
                    "capture_interval_seconds": 10,
                },
            },
            "detectors": {
                "pwa_mode": True,
                "fullscreen": False,
                "focus": True,
                "tab_visibility": True,
                "multi_display": False,
                "mouse_leave": True,
                "viewport_integrity": True,
            },
        },
    }


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
    password = models.CharField(max_length=255, blank=True, null=True, verbose_name='密碼')
    
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
    
    # Auto-unlock settings
    allow_auto_unlock = models.BooleanField(default=False, verbose_name='允許自動解鎖')
    auto_unlock_minutes = models.IntegerField(default=0, null=True, blank=True, verbose_name='自動解鎖時間 (分鐘)')
    
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
    
    # Anonymous mode settings
    anonymous_mode_enabled = models.BooleanField(
        default=False,
        verbose_name='啟用匿名模式',
        help_text='啟用後學生可使用暱稱參與競賽，排行榜和提交列表顯示暱稱'
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')
    
    problems = models.ManyToManyField(
        Problem,
        through='ContestProblem',
        related_name='contests',
        verbose_name='題目'
    )
    
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
        return self.registrations.filter(
            exam_status__in=[
                ExamStatus.IN_PROGRESS,
                ExamStatus.PAUSED,
                ExamStatus.LOCKED,
                ExamStatus.SUBMITTED,
            ]
        ).exists()

    def set_contest_password(self, raw_password: str | None) -> None:
        """Hash and store contest password."""
        if not raw_password:
            self.password = None
            return
        self.password = make_password(raw_password)

    def verify_contest_password(self, raw_password: str | None) -> bool:
        """Verify contest password using Django hashers."""
        if not raw_password or not self.password:
            return False

        stored_password = self.password
        try:
            return check_password(raw_password, stored_password)
        except ValueError:
            return False

    def has_hashed_password(self) -> bool:
        """Return True when contest password is stored using Django hashers."""
        if not self.password:
            return False
        try:
            identify_hasher(self.password)
            return True
        except Exception:
            return False

    @property
    def requires_password(self) -> bool:
        """Whether contest entry requires a password."""
        return self.visibility == 'private'
    
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



class ContestProblem(models.Model):
    """
    DEPRECATED — Use ContestQuestionBinding instead.

    This model is kept as a dual-write shell. All reads should go through
    ContestQuestionBinding. On save(), this model auto-syncs to a binding.
    Will be removed in a future migration.
    """
    contest = models.ForeignKey(Contest, on_delete=models.CASCADE, related_name='contest_problems')
    problem = models.ForeignKey(Problem, on_delete=models.CASCADE)
    
    # label = models.CharField(max_length=10, default='A', verbose_name='標籤', help_text='例如: A, B, C')
    order = models.IntegerField(default=0, verbose_name='排序')
    max_score = models.PositiveIntegerField(default=100, verbose_name='題目配分')
    source_bank_id = models.UUIDField(null=True, blank=True, verbose_name='來源題庫 UUID')
    source_bank_name = models.CharField(max_length=255, blank=True, default='', verbose_name='來源題庫名稱')
    source_question_id = models.UUIDField(null=True, blank=True, verbose_name='來源題庫題目 UUID')

    class SourceMode(models.TextChoices):
        MANUAL = "manual", "Manual"
        COPY = "copy", "Copy"
        REFERENCE = "reference", "Reference"

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
        related_name='legacy_contest_problem_links',
        verbose_name='對應題目資產',
    )
    question_version = models.ForeignKey(
        'question_bank.QuestionVersion',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='legacy_contest_problem_links',
        verbose_name='對應題目版本',
    )

    # Set to True to skip auto-sync to ContestQuestionBinding (when caller manages binding explicitly).
    _skip_binding_sync = False

    def save(self, *args, **kwargs):
        if self._state.adding and self.problem_id and (self.max_score is None or self.max_score == 100):
            score_sum = self.problem.test_cases.aggregate(total=Sum('score')).get('total') or 0
            if score_sum > 0:
                self.max_score = max(1, int(score_sum))
        super().save(*args, **kwargs)
        if not self._skip_binding_sync:
            self._sync_to_binding()

    def delete(self, *args, **kwargs):
        # Also delete the corresponding ContestQuestionBinding
        from apps.question_bank.models import ContestQuestionBinding
        ContestQuestionBinding.objects.filter(legacy_contest_problem=self).delete()
        super().delete(*args, **kwargs)

    def _sync_to_binding(self):
        """Ensure a ContestQuestionBinding mirrors this ContestProblem."""
        from apps.question_bank.models import ContestQuestionBinding, QuestionAsset

        asset_id = self.question_asset_id or (self.problem.question_asset_id if self.problem_id else None)
        version_id = self.question_version_id or (self.problem.question_version_id if self.problem_id else None)

        # Auto-sync asset if Problem doesn't have one yet
        if not asset_id and self.problem_id:
            try:
                from apps.question_bank.question_assets import sync_problem_question_asset
                asset, version = sync_problem_question_asset(
                    problem=self.problem,
                    actor=self.problem.created_by or (self.contest.owner if self.contest_id else None),
                )
                asset_id = asset.pk
                version_id = version.pk
            except Exception:
                return

        if not asset_id:
            return

        ContestQuestionBinding.objects.update_or_create(
            legacy_contest_problem=self,
            defaults={
                "contest": self.contest,
                "question_asset_id": asset_id,
                "question_version_id": version_id,
                "coding_problem_id": self.problem_id,
                "binding_type": QuestionAsset.AssetType.CODING,
                "order": self.order,
                "score": self.max_score or 100,
                "source_bank_id": self.source_bank_id,
                "source_bank_name": self.source_bank_name,
                "source_question_id": self.source_question_id,
                "source_mode": self.source_mode,
            },
        )

    @property
    def label(self):
        if self.order < 26:
            return chr(65 + self.order)
        return f"P{self.order + 1}"
    
    class Meta:
        db_table = 'contest_problems'
        verbose_name = '考試題目'
        verbose_name_plural = '考試題目'
        ordering = ['order']
        unique_together = ['contest', 'problem']
        indexes = [
            models.Index(fields=['source_question_id']),
        ]


class ExamQuestionType(models.TextChoices):
    TRUE_FALSE = "true_false", "是非題"
    SINGLE_CHOICE = "single_choice", "單選題"
    MULTIPLE_CHOICE = "multiple_choice", "多選題"
    SHORT_ANSWER = "short_answer", "簡答題"
    ESSAY = "essay", "問答題"


class ExamQuestion(models.Model):
    """
    Configurable exam question for paper-style contests.
    """

    id = models.UUIDField(primary_key=True, default=uuid_lib.uuid4, editable=False)

    contest = models.ForeignKey(
        Contest,
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
    score = models.PositiveIntegerField(default=1, verbose_name='配分')
    order = models.IntegerField(default=0, verbose_name='排序')
    source_bank_id = models.UUIDField(null=True, blank=True, verbose_name='來源題庫 UUID')
    source_bank_name = models.CharField(max_length=255, blank=True, default='', verbose_name='來源題庫名稱')
    source_question_id = models.UUIDField(null=True, blank=True, verbose_name='來源題庫題目 UUID')
    source_mode = models.CharField(
        max_length=20,
        choices=ContestProblem.SourceMode.choices,
        default=ContestProblem.SourceMode.MANUAL,
        verbose_name='來源模式',
    )
    question_asset = models.ForeignKey(
        'question_bank.QuestionAsset',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='legacy_exam_question_adapters',
        verbose_name='對應題目資產',
    )
    question_version = models.ForeignKey(
        'question_bank.QuestionVersion',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='legacy_exam_question_adapters',
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

    def __str__(self):
        return f"{self.contest_id}#{self.id}({self.question_type})"

    def to_snapshot(self):
        """產生題目快照，用於凍結學生作答時的題目狀態"""
        return {
            'prompt': self.prompt,
            'options': self.options,
            'correct_answer': self.correct_answer,
            'question_type': self.question_type,
            'score': self.score,
        }


class ExamStatus(models.TextChoices):
    """Explicit state for student exam participation."""
    NOT_STARTED = 'not_started', '未開始'
    IN_PROGRESS = 'in_progress', '進行中'
    PAUSED = 'paused', '暫停'
    LOCKED = 'locked', '已鎖定'
    LOCKED_TAKEOVER = 'locked_takeover', '接管鎖定'
    SUBMITTED = 'submitted', '已交卷'


class AssignmentState(models.TextChoices):
    UNACCEPTED = 'unaccepted', '未接受'
    ACCEPTED = 'accepted', '已接受'
    SUBMITTED = 'submitted', '已提交'


class ContestParticipant(models.Model):
    """
    Participant in a contest (registration record).
    Also known as ContestRegistration in API documentation.
    """
    contest = models.ForeignKey(Contest, on_delete=models.CASCADE, related_name='registrations')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    
    score = models.IntegerField(default=0, verbose_name='總分')
    rank = models.IntegerField(null=True, blank=True, verbose_name='排名')
    
    joined_at = models.DateTimeField(auto_now_add=True, verbose_name='加入時間')
    started_at = models.DateTimeField(null=True, blank=True, verbose_name='開始時間')
    left_at = models.DateTimeField(null=True, blank=True, verbose_name='離開時間')
    
    # Locking metadata (needed for auto-unlock and audit)
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
    
    # Anonymous mode nickname
    nickname = models.CharField(
        max_length=50,
        blank=True,
        default='',
        verbose_name='暱稱',
        help_text='匿名模式下顯示的名稱，預設為用戶名'
    )
    
    # Explicit exam state (primary state field for UI)
    exam_status = models.CharField(
        max_length=20,
        choices=ExamStatus.choices,
        default=ExamStatus.NOT_STARTED,
        verbose_name='考試狀態',
        help_text='學生考試狀態：未開始/進行中/暫停/已鎖定/接管鎖定/已交卷'
    )
    assignment_state = models.CharField(
        max_length=20,
        choices=AssignmentState.choices,
        default=AssignmentState.ACCEPTED,
        db_index=True,
        verbose_name='作業狀態',
        help_text='practice 模式使用：未接受/已接受/已提交',
    )
    accepted_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='接受時間',
    )
    submitted_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='作業提交時間',
    )
    
    @property
    def has_finished_exam(self):
        return self.exam_status == ExamStatus.SUBMITTED
    
    class Meta:
        db_table = 'contest_participants'
        verbose_name = '考試參與者'
        verbose_name_plural = '考試參與者'
        unique_together = ['contest', 'user']


class ContestAnnouncement(models.Model):
    """
    Announcement for a contest.
    """
    contest = models.ForeignKey(
        Contest,
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
        Contest,
        on_delete=models.CASCADE,
        related_name='clarifications',
        verbose_name='考試'
    )
    problem = models.ForeignKey(
        Problem,
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


class ExamEvent(models.Model):
    """
    Event log for exam mode monitoring.
    Records student behavior during exams (tab switching, focus loss, etc.)
    """
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name='exam_events',
        verbose_name='考試'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='exam_events',
        verbose_name='學生'
    )
    
    EVENT_TYPE_CHOICES = [
        ('tab_hidden', 'Tab Hidden'),
        ('window_blur', 'Window Blur'),
        ('exit_fullscreen', 'Exit Fullscreen'),
        ('forbidden_focus_event', 'Forbidden Focus Event'),
        ('forbidden_action', 'Forbidden Action'),
        ('multiple_displays', 'Multiple Displays'),
        ('mouse_leave', 'Mouse Leave'),
        ('warning_timeout', 'Warning Timeout'),
        ('force_submit_locked', 'Force Submit Locked'),
        ('screen_share_stopped', 'Screen Share Stopped'),
        ('screen_share_interrupted', 'Screen Share Interrupted'),
        ('screen_share_restored', 'Screen Share Restored'),
        ('screen_share_invalid_surface', 'Screen Share Invalid Surface'),
        ('webcam_interrupted', 'Webcam Interrupted'),
        ('webcam_restored', 'Webcam Restored'),
        ('webcam_stopped', 'Webcam Stopped'),
        ('webcam_quality_degraded', 'Webcam Quality Degraded'),
        ('viewport_interrupted', 'Viewport Interrupted'),
        ('viewport_restored', 'Viewport Restored'),
        ('viewport_stopped', 'Viewport Stopped'),
        ('split_view_detected', 'Split View Detected'),
        ('capture_upload_degraded', 'Capture Upload Degraded'),
        ('exam_entered', 'Exam Entered'),
        ('exam_submit_initiated', 'Exam Submit Initiated'),
        ('concurrent_login_detected', 'Concurrent Login Detected'),
        ('takeover_locked', 'Takeover Locked'),
        ('takeover_approved', 'Takeover Approved'),
        ('heartbeat', 'Heartbeat'),
        ('heartbeat_timeout', 'Heartbeat Timeout'),
        ('listener_tampered', 'Listener Tampered'),
        ('exit_fullscreen_triggered', 'Exit Fullscreen Triggered'),
        ('mouse_leave_triggered', 'Mouse Leave Triggered'),
        ('tab_hidden_triggered', 'Tab Hidden Triggered'),
        ('tab_hidden_restored', 'Tab Hidden Restored'),
        ('window_blur_triggered', 'Window Blur Triggered'),
        ('window_blur_restored', 'Window Blur Restored'),
        ('multi_display_triggered', 'Multi Display Triggered'),
        ('multi_display_restored', 'Multi Display Restored'),
        ('display_api_degraded', 'Display API Degraded'),
    ]
    event_type = models.CharField(
        max_length=50,
        choices=EVENT_TYPE_CHOICES,
        verbose_name='事件類型'
    )
    
    metadata = models.JSONField(
        null=True,
        blank=True,
        verbose_name='額外資訊',
        help_text='JSON 格式的額外事件資訊'
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='發生時間')
    
    class Meta:
        db_table = 'exam_events'
        verbose_name = '考試事件'
        verbose_name_plural = '考試事件'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['contest', 'user']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.event_type} by {self.user.username} at {self.created_at}"


class ExamAnswer(models.Model):
    """
    Student answer for a paper-style exam question.
    Supports auto-save (upsert on participant+question) and TA grading.
    """
    participant = models.ForeignKey(
        ContestParticipant,
        on_delete=models.CASCADE,
        related_name='exam_answers',
        verbose_name='考生'
    )
    question = models.ForeignKey(
        ExamQuestion,
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


class EvidenceJobStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    RUNNING = "running", "Running"
    SUCCESS = "success", "Success"
    FAILED = "failed", "Failed"
    NO_DATA = "no_data", "No Data"


class ExamEvidenceJob(models.Model):
    """
    Background compilation job for anti-cheat raw screenshots.
    """
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name="evidence_jobs",
    )
    participant = models.ForeignKey(
        ContestParticipant,
        on_delete=models.CASCADE,
        related_name="evidence_jobs",
    )
    source_module = models.CharField(max_length=32, default="screen_share", blank=True)
    upload_session_id = models.CharField(max_length=64, default="", blank=True)
    status = models.CharField(
        max_length=20,
        choices=EvidenceJobStatus.choices,
        default=EvidenceJobStatus.PENDING,
    )
    raw_count = models.PositiveIntegerField(default=0)
    recording_started_at = models.DateTimeField(null=True, blank=True)
    recording_finished_at = models.DateTimeField(null=True, blank=True)
    video_bucket = models.CharField(max_length=128, default="", blank=True)
    video_key = models.CharField(max_length=512, default="", blank=True)
    error_message = models.TextField(default="", blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exam_evidence_jobs"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["contest", "participant", "source_module", "upload_session_id"],
                name="uniq_evidence_job_contest_participant_module_session",
            )
        ]
        indexes = [
            models.Index(
                fields=["contest", "status"],
                name="exam_eviden_contest_2bf0d4_idx",
            ),
            models.Index(
                fields=["participant", "created_at"],
                name="exam_eviden_partici_a82453_idx",
            ),
        ]


class ExamEvidenceVideo(models.Model):
    """
    Compiled anti-cheat evidence video metadata.
    """
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name="evidence_videos",
    )
    participant = models.ForeignKey(
        ContestParticipant,
        on_delete=models.CASCADE,
        related_name="evidence_videos",
    )
    source_module = models.CharField(max_length=32, default="screen_share", blank=True)
    upload_session_id = models.CharField(max_length=64, default="", blank=True)
    bucket = models.CharField(max_length=128)
    object_key = models.CharField(max_length=512)
    duration_seconds = models.PositiveIntegerField(default=0)
    frame_count = models.PositiveIntegerField(default=0)
    size_bytes = models.BigIntegerField(default=0)
    recording_started_at = models.DateTimeField(null=True, blank=True)
    recording_finished_at = models.DateTimeField(null=True, blank=True)
    is_suspected = models.BooleanField(default=False)
    suspected_note = models.TextField(default="", blank=True)
    suspected_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="flagged_exam_videos",
    )
    suspected_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exam_evidence_videos"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["contest", "participant"],
                name="exam_eviden_contest_5f7ba0_idx",
            ),
            models.Index(
                fields=["contest", "is_suspected"],
                name="exam_eviden_contest_0efcb1_idx",
            ),
        ]


class ContestActivity(models.Model):
    """
    General activity log for a contest.
    Records high-level actions: register, start/end exam, submit, Q&A, updates, etc.
    """
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name='activities',
        verbose_name='考試'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='contest_activities',
        verbose_name='操作者'
    )
    
    ACTION_TYPE_CHOICES = [
        ('register', 'Register'),
        ('enter_contest', 'Enter Contest'),
        ('start_exam', 'Start Exam'),
        ('end_exam', 'End Exam'),
        ('auto_submit', 'Auto Submit'),
        ('lock_user', 'Lock User'),
        ('unlock_user', 'Unlock User'),
        ('submit_code', 'Submit Code'),
        ('ask_question', 'Ask Question'),
        ('reply_question', 'Reply Question'),
        ('update_contest', 'Update Contest'),
        ('update_problem', 'Update Problem'),
        ('update_participant', 'Update Participant'),
        ('concurrent_login_detected', 'Concurrent Login Detected'),
        ('takeover_lock', 'Takeover Lock'),
        ('takeover_approve', 'Takeover Approve'),
        ('announce', 'Announce'),
        ('other', 'Other'),
    ]
    action_type = models.CharField(
        max_length=50,
        choices=ACTION_TYPE_CHOICES,
        verbose_name='動作類型'
    )
    
    details = models.TextField(verbose_name='詳細內容')
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='發生時間')
    
    class Meta:
        db_table = 'contest_activities'
        verbose_name = '競賽活動'
        verbose_name_plural = '競賽活動'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['contest', 'created_at']),
        ]
    
    def __str__(self):
        return f"{self.action_type} by {self.user.username}"
