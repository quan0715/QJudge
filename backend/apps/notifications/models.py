"""
Models for the email notification system.
"""
import uuid

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


class NotificationType(models.TextChoices):
    CLASSROOM_ANNOUNCEMENT = "classroom_announcement", "教室公告"
    CONTEST_ANNOUNCEMENT = "contest_announcement", "考場公告"
    GRADE_PUBLISHED = "grade_published", "成績公布"
    EXAM_REMINDER = "exam_reminder", "考試提醒"


class NotificationStatus(models.TextChoices):
    PENDING = "pending", "待寄送"
    QUEUED = "queued", "已排入佇列"
    DELIVERED = "delivered", "已送達"
    FAILED = "failed", "失敗"


class EmailNotification(models.Model):
    """
    Record of every email notification sent by the system.
    Tracks recipient, status, retry attempts, and the source object
    that triggered the notification.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='email_notifications',
        verbose_name='收件人',
    )
    recipient_email = models.EmailField(verbose_name='收件信箱')
    notification_type = models.CharField(
        max_length=50,
        choices=NotificationType.choices,
        verbose_name='通知類型',
    )
    subject = models.CharField(max_length=255, verbose_name='信件主旨')
    body_text = models.TextField(blank=True, verbose_name='純文字內容')
    body_html = models.TextField(blank=True, verbose_name='HTML 內容')
    status = models.CharField(
        max_length=20,
        choices=NotificationStatus.choices,
        default=NotificationStatus.PENDING,
        db_index=True,
        verbose_name='狀態',
    )
    retry_count = models.PositiveSmallIntegerField(default=0, verbose_name='重試次數')
    error_message = models.TextField(blank=True, verbose_name='錯誤訊息')

    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        verbose_name='來源類型',
    )
    object_id = models.PositiveIntegerField(null=True, blank=True, verbose_name='來源 ID')
    source_object = GenericForeignKey('content_type', 'object_id')

    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='triggered_notifications',
        verbose_name='觸發者',
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name='寄送時間')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['notification_type', 'status']),
            models.Index(fields=['content_type', 'object_id']),
        ]
        verbose_name = 'Email 通知'
        verbose_name_plural = 'Email 通知'

    def __str__(self):
        return f"[{self.get_status_display()}] {self.subject} → {self.recipient_email}"
