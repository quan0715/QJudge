"""
Models for submissions and judging results.
"""
from django.db import models
from django.contrib.auth import get_user_model
from apps.problems.models import Problem, TestCase

User = get_user_model()


class Submission(models.Model):
    """
    Code submission model.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('judging', 'Judging'),
        ('AC', 'Accepted'),
        ('WA', 'Wrong Answer'),
        ('TLE', 'Time Limit Exceeded'),
        ('MLE', 'Memory Limit Exceeded'),
        ('RE', 'Runtime Error'),
        ('CE', 'Compilation Error'),
        ('SE', 'System Error'),
    ]
    
    LANGUAGE_CHOICES = [
        ('python', 'Python 3.11'),
        ('cpp', 'C++ 20'),
        ('c', 'C 11'),
        ('java', 'Java 17'),
    ]
    
    # Relations
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='submissions',
        verbose_name='使用者'
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name='submissions',
        verbose_name='題目'
    )
    contest = models.ForeignKey(
        'contests.Contest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submissions',
        verbose_name='考試'
    )
    
    # Content
    language = models.CharField(max_length=20, choices=LANGUAGE_CHOICES, verbose_name='語言')
    code = models.TextField(verbose_name='程式碼')
    is_test = models.BooleanField(default=False, verbose_name='測試提交')
    
    # Result
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True,
        verbose_name='狀態'
    )
    score = models.IntegerField(default=0, verbose_name='分數')
    exec_time = models.IntegerField(default=0, verbose_name='執行時間 (ms)')
    memory_usage = models.IntegerField(default=0, verbose_name='記憶體使用 (KB)')
    error_message = models.TextField(blank=True, verbose_name='錯誤訊息')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='提交時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')
    
    class Meta:
        db_table = 'submissions'
        verbose_name = '提交記錄'
        verbose_name_plural = '提交記錄'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'problem']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"Submission {self.id} by {self.user.username} for {self.problem.title}"


class SubmissionResult(models.Model):
    """
    Result for each test case in a submission.
    """
    STATUS_CHOICES = [
        ('AC', 'Accepted'),
        ('WA', 'Wrong Answer'),
        ('TLE', 'Time Limit Exceeded'),
        ('MLE', 'Memory Limit Exceeded'),
        ('RE', 'Runtime Error'),
        ('SE', 'System Error'),
    ]
    
    submission = models.ForeignKey(
        Submission,
        on_delete=models.CASCADE,
        related_name='results',
        verbose_name='提交記錄'
    )
    test_case = models.ForeignKey(
        TestCase,
        on_delete=models.CASCADE,
        related_name='submission_results',
        verbose_name='測試案例'
    )
    
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, verbose_name='狀態')
    exec_time = models.IntegerField(default=0, verbose_name='執行時間 (ms)')
    memory_usage = models.IntegerField(default=0, verbose_name='記憶體使用 (KB)')
    output = models.TextField(blank=True, verbose_name='輸出')
    error_message = models.TextField(blank=True, verbose_name='錯誤訊息')
    
    class Meta:
        db_table = 'submission_results'
        verbose_name = '評測結果'
        verbose_name_plural = '評測結果'
        unique_together = ['submission', 'test_case']
    
    def __str__(self):
        return f"Result {self.id} for Submission {self.submission.id}"


class ScreenEvent(models.Model):
    """
    Screen monitoring events during contest submissions.
    """
    EVENT_TYPE_CHOICES = [
        ('blur', '視窗失焦'),
        ('focus', '視窗聚焦'),
        ('copy', '複製'),
        ('paste', '貼上'),
        ('fullscreen_exit', '退出全螢幕'),
    ]
    
    submission = models.ForeignKey(
        Submission,
        on_delete=models.CASCADE,
        related_name='screen_events',
        verbose_name='提交記錄'
    )
    
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES, verbose_name='事件類型')
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name='發生時間')
    details = models.JSONField(default=dict, blank=True, verbose_name='詳細資訊')
    
    class Meta:
        db_table = 'screen_events'
        verbose_name = '螢幕事件'
        verbose_name_plural = '螢幕事件'
        ordering = ['timestamp']
    
    def __str__(self):
        return f"{self.event_type} at {self.timestamp}"
