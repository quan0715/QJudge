"""Contest monitoring and activity models."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class ExamEvent(models.Model):
    """
    Event log for exam mode monitoring.
    Records student behavior during exams (tab switching, focus loss, etc.)
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
        ('other_devices_logged_out', 'Other Devices Logged Out'),
        ('end_exam_device_mismatch', 'End Exam Device Mismatch'),
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
        ('clipboard_action', 'Clipboard Action'),
        ('manual_proctor_note', 'Manual Proctor Note'),
        ('attendance_check_in', 'Attendance Check-in'),
        ('attendance_check_out', 'Attendance Check-out'),
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
