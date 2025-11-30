"""
Models for contests and exams.
"""
from django.db import models
from django.contrib.auth import get_user_model
from apps.problems.models import Problem

User = get_user_model()


class Contest(models.Model):
    """
    Contest or Exam model.
    """
    title = models.CharField(max_length=255, verbose_name='標題')
    description = models.TextField(blank=True, verbose_name='描述')
    rules = models.TextField(blank=True, verbose_name='競賽規定')
    
    start_time = models.DateTimeField(verbose_name='開始時間')
    end_time = models.DateTimeField(verbose_name='結束時間')
    
    creator = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_contests',
        verbose_name='建立者'
    )
    
    is_visible = models.BooleanField(default=True, verbose_name='是否可見')
    is_public = models.BooleanField(default=False, verbose_name='是否公開')
    password = models.CharField(max_length=255, blank=True, null=True, verbose_name='密碼')
    
    # Settings
    allow_view_results = models.BooleanField(default=True, verbose_name='允許查看結果')
    allow_multiple_joins = models.BooleanField(default=False, verbose_name='允許多次加入')
    ban_tab_switching = models.BooleanField(default=False, verbose_name='禁止切換分頁')
    
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
        ordering = ['-start_time']
    
    def __str__(self):
        return self.title


class ContestProblem(models.Model):
    """
    Problem in a contest.
    """
    contest = models.ForeignKey(Contest, on_delete=models.CASCADE)
    problem = models.ForeignKey(Problem, on_delete=models.CASCADE)
    
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
    Participant in a contest.
    """
    contest = models.ForeignKey(Contest, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    
    score = models.IntegerField(default=0, verbose_name='總分')
    rank = models.IntegerField(null=True, blank=True, verbose_name='排名')
    
    joined_at = models.DateTimeField(auto_now_add=True, verbose_name='加入時間')
    left_at = models.DateTimeField(null=True, blank=True, verbose_name='離開時間')
    
    class Meta:
        db_table = 'contest_participants'
        verbose_name = '考試參與者'
        verbose_name_plural = '考試參與者'
        unique_together = ['contest', 'user']


class ContestQuestion(models.Model):
    """
    Q&A during contest.
    """
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name='questions',
        verbose_name='考試'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='contest_questions',
        verbose_name='提問者'
    )
    
    title = models.CharField(max_length=255, verbose_name='標題')
    content = models.TextField(verbose_name='內容')
    
    reply = models.TextField(blank=True, verbose_name='回覆')
    replied_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replied_questions',
        verbose_name='回覆者'
    )
    replied_at = models.DateTimeField(null=True, blank=True, verbose_name='回覆時間')
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='提問時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')
    
    class Meta:
        db_table = 'contest_questions'
        verbose_name = '考試提問'
        verbose_name_plural = '考試提問'
        ordering = ['created_at']


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
