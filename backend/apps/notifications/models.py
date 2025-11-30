"""
Models for notifications.
"""
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Notification(models.Model):
    """
    Notification model.
    """
    TYPE_CHOICES = [
        ('system', '系統通知'),
        ('contest', '考試通知'),
        ('submission', '評測通知'),
        ('discussion', '討論通知'),
    ]
    
    recipient = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name='接收者'
    )
    
    notification_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default='system',
        verbose_name='類型'
    )
    
    title = models.CharField(max_length=255, verbose_name='標題')
    message = models.TextField(verbose_name='內容')
    
    link = models.CharField(max_length=255, blank=True, verbose_name='連結')
    
    is_read = models.BooleanField(default=False, verbose_name='已讀')
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    
    class Meta:
        db_table = 'notifications'
        verbose_name = '通知'
        verbose_name_plural = '通知'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
        ]
    
    def __str__(self):
        return f"{self.title} for {self.recipient.username}"
