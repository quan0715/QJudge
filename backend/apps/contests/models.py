"""
Models for contests and exams.
"""
from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.problems.models import Problem

User = get_user_model()


class Contest(models.Model):
    """
    Contest or Exam model.
    Supports both competition and exam modes with flexible creation flow.
    """
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
    
    # Contest status - replaces is_ended with explicit active/inactive
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='inactive',
        db_index=True,
        verbose_name='狀態',
        help_text='active: 比賽正在進行，可接受提交；inactive: 比賽已關閉或尚未啟用'
    )
    
    # Legacy settings - kept for backward compatibility
    allow_view_results = models.BooleanField(default=True, verbose_name='允許查看結果')
    allow_multiple_joins = models.BooleanField(default=False, verbose_name='允許多次加入')
    ban_tab_switching = models.BooleanField(default=False, verbose_name='禁止切換分頁')
    
    # Exam mode settings
    exam_mode_enabled = models.BooleanField(
        default=False,
        verbose_name='啟用考試模式',
        help_text='啟用全螢幕與防失焦的嚴格考試模式'
    )
    
    # Scoreboard settings
    scoreboard_visible_during_contest = models.BooleanField(
        default=False,
        verbose_name='比賽中顯示排行榜',
        help_text='False: 學生只能看自己成績；True: 學生可看完整排行榜'
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
    
    class Meta:
        db_table = 'contests'
        verbose_name = '考試'
        verbose_name_plural = '考試'
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name
    
    @property
    def computed_status(self):
        """
        Calculate dynamic status based on time (for backward compatibility).
        Use the 'status' field for primary state management.
        """
        if self.status == 'inactive':
            return 'inactive'
        
        if not self.start_time or not self.end_time:
            return 'inactive'
        
        now = timezone.now()
        if now < self.start_time:
            return 'upcoming'
        elif now <= self.end_time:
            return 'ongoing'
        else:
            return 'finished'


class ContestProblem(models.Model):
    """
    Problem in a contest with label (A, B, C, etc.) and ordering.
    """
    contest = models.ForeignKey(Contest, on_delete=models.CASCADE, related_name='contest_problems')
    problem = models.ForeignKey(Problem, on_delete=models.CASCADE)
    
    label = models.CharField(max_length=10, default='A', verbose_name='標籤', help_text='例如: A, B, C')
    order = models.IntegerField(default=0, verbose_name='排序')
    score = models.IntegerField(default=100, verbose_name='分數')
    
    class Meta:
        db_table = 'contest_problems'
        verbose_name = '考試題目'
        verbose_name_plural = '考試題目'
        ordering = ['order']
        unique_together = ['contest', 'problem']


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
    
    # Exam mode tracking
    has_finished_exam = models.BooleanField(
        default=False,
        verbose_name='已完成考試',
        help_text='學生按下「結束考試」後標記，用來控制是否還能繼續送出競賽提交'
    )
    
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
    ]
    event_type = models.CharField(
        max_length=50,
        choices=EVENT_TYPE_CHOICES,
        verbose_name='事件類型'
    )
    
    metadata =models.JSONField(
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
