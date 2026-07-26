"""Contest monitoring and activity models."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class ExamEvent(models.Model):
    """
    Event log for exam mode monitoring.
    Records normalized semantic incidents and explicit client operations.
    """
    contest = models.ForeignKey(
        "contests.Contest",
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

    event_type = models.CharField(
        max_length=64,
        verbose_name='事件類型'
    )

    integrity_run = models.ForeignKey(
        "contests.ExamIntegrityRun",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="normalized_events",
    )
    integrity_command_id = models.UUIDField(null=True, blank=True, unique=True)
    incident_id = models.UUIDField(null=True, blank=True, db_index=True)
    event_definition_version = models.CharField(max_length=64, blank=True, default="")
    event_schema_version = models.PositiveIntegerField(default=1)
    client_occurred_at_ms = models.BigIntegerField(null=True, blank=True)
    server_received_at = models.DateTimeField(null=True, blank=True)
    worker_processed_at = models.DateTimeField(null=True, blank=True)
    delayed_delivery = models.BooleanField(default=False)

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


class ExamEvidenceFrame(models.Model):
    """Manifest row for a student-local anti-cheat evidence frame."""

    class SourceModule(models.TextChoices):
        SCREEN_SHARE = "screen_share", "Screen Share"
        WEBCAM = "webcam", "Webcam"
        ATTENDANCE = "attendance", "Attendance"

    class CaptureOrigin(models.TextChoices):
        STUDENT_LOCAL = "student_local", "Student Local"

    class EvidenceMode(models.TextChoices):
        ANCHOR_WINDOW = "anchor_window", "Anchor Window"
        PRE_LOSS = "pre_loss", "Pre Loss"
        AUDIT = "audit", "Audit"

    class Status(models.TextChoices):
        ISSUED = "issued", "Issued"
        UPLOADED = "uploaded", "Uploaded"
        FAILED = "failed", "Failed"
        UNAVAILABLE = "unavailable", "Unavailable"

    contest = models.ForeignKey(
        "contests.Contest",
        on_delete=models.CASCADE,
        related_name="exam_evidence_frames",
        verbose_name="考試",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="exam_evidence_frames",
        verbose_name="學生",
    )
    exam_event = models.ForeignKey(
        ExamEvent,
        on_delete=models.CASCADE,
        related_name="evidence_frames",
        verbose_name="考試事件",
    )
    evidence_cluster_id = models.CharField(max_length=64, blank=True, default="")
    source_module = models.CharField(
        max_length=20,
        choices=SourceModule.choices,
        default=SourceModule.SCREEN_SHARE,
    )
    capture_origin = models.CharField(
        max_length=32,
        choices=CaptureOrigin.choices,
        default=CaptureOrigin.STUDENT_LOCAL,
    )
    evidence_mode = models.CharField(
        max_length=20,
        choices=EvidenceMode.choices,
        default=EvidenceMode.ANCHOR_WINDOW,
    )
    upload_session_id = models.CharField(max_length=64, blank=True, default="")
    seq = models.PositiveIntegerField(default=0)
    object_key = models.TextField(blank=True, default="")
    client_captured_at_ms = models.BigIntegerField(null=True, blank=True)
    server_issued_at = models.DateTimeField(auto_now_add=True)
    storage_confirmed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ISSUED,
    )
    content_type = models.CharField(max_length=64, default="image/webp")
    byte_size = models.PositiveIntegerField(null=True, blank=True)
    sha256 = models.CharField(max_length=64, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "exam_evidence_frames"
        verbose_name = "考試證據影格"
        verbose_name_plural = "考試證據影格"
        ordering = ["client_captured_at_ms", "seq", "id"]
        indexes = [
            models.Index(fields=["contest", "user", "exam_event"]),
            models.Index(fields=["evidence_cluster_id"]),
            models.Index(fields=["upload_session_id"]),
            models.Index(fields=["status"]),
            models.Index(fields=["client_captured_at_ms"]),
        ]

    def __str__(self):
        return f"{self.source_module} frame {self.seq} for event {self.exam_event_id}"


class ContestActivity(models.Model):
    """
    General activity log for a contest.
    Records high-level actions: register, start/end exam, submit, Q&A, updates, etc.
    """
    contest = models.ForeignKey(
        "contests.Contest",
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
        ('resume_exam', 'Resume Exam'),
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
        ('reopen_exam', 'Reopen Exam'),
        ('reset_exam_record', 'Reset Exam Record'),
        ('concurrent_login_detected', 'Concurrent Login Detected'),
        ('other_devices_logged_out', 'Other Devices Logged Out'),
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
