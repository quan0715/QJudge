"""AI Chat models for session, message, and durable run storage."""

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class AISession(models.Model):
    """AI 聊天 Session，追蹤用戶與 AI 的對話狀態

    設計原則：
    - session_id (Claude SDK 返回) 作為 primary key
    - 必須與認證用戶關聯（無匿名 session）
    - context 存儲額外的會話元數據
    """

    # Claude SDK 返回的 session_id 作為主鍵
    session_id = models.CharField(
        max_length=36,  # UUID v4 長度
        primary_key=True,
        verbose_name="Claude SDK Session ID",
        help_text="由 Claude Agent SDK 返回的唯一會話 ID"
    )

    # 用戶必須關聯（不允許匿名）
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_sessions",
        verbose_name="用戶",
        help_text="該會話所屬的用戶"
    )

    # 存儲額外的會話元數據
    context = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="上下文資料",
        help_text="存儲額外的會話元數據（如標題、自定義數據等）",
    )

    # 關聯創建的題目（如果有的話）
    created_problem = models.ForeignKey(
        "problems.CodingProblem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_sessions",
        verbose_name="創建的題目",
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="創建時間")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新時間")

    class Meta:
        verbose_name = "AI 聊天 Session"
        verbose_name_plural = "AI 聊天 Sessions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return f"AISession {self.session_id[:8]}... - {self.user.username}"


class AIMessage(models.Model):
    """AI 聊天訊息，記錄對話歷史"""

    class Role(models.TextChoices):
        USER = "user", "用戶"
        ASSISTANT = "assistant", "AI 助手"
        SYSTEM = "system", "系統"

    class MessageType(models.TextChoices):
        TEXT = "text", "文字"
        OPTIONS = "options", "選項"
        PREVIEW = "preview", "預覽"
        ERROR = "error", "錯誤"

    session = models.ForeignKey(
        AISession,
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name="Session",
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        verbose_name="角色",
    )
    content = models.TextField(
        verbose_name="訊息內容",
    )
    message_type = models.CharField(
        max_length=20,
        choices=MessageType.choices,
        default=MessageType.TEXT,
        verbose_name="訊息類型",
    )
    # 額外資料（如選項內容、預覽資料、用戶選擇結果）
    metadata = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="元資料",
        help_text="存儲選項、預覽資料等額外資訊",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="創建時間")

    class Meta:
        verbose_name = "AI 聊天訊息"
        verbose_name_plural = "AI 聊天訊息"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["session", "created_at"]),
        ]

    def __str__(self):
        content_preview = (
            self.content[:50] + "..." if len(self.content) > 50 else self.content
        )
        return f"[{self.role}] {content_preview}"


class AIExecutionLog(models.Model):
    """AI 執行紀錄，記錄完整的思考過程和對話流"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_logs",
        null=True,  # Allow anonymous execution logs
        blank=True,
        verbose_name="用戶",
    )
    session = models.ForeignKey(
        AISession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="execution_logs",
        verbose_name="Session",
    )

    # 時間資訊
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="建立時間")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新時間")

    # 使用者訊息
    user_message = models.TextField(verbose_name="用戶訊息")

    # 完整的思考過程和對話日誌（JSON 格式）
    # 包含：AI 的思考過程、工具調用、前後文等所有細節
    raw_log = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="原始日誌",
        help_text="完整的 API 請求/回應、工具調用、思考過程等",
    )

    # AI 回應
    ai_response = models.TextField(null=True, blank=True, verbose_name="AI 回應")

    # 自由格式的元資訊（不限制結構）
    metadata = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="元資訊",
        help_text="任意的額外資訊：model, tokens, skill, tools used 等",
    )

    # 用量追蹤欄位
    input_tokens = models.IntegerField(
        default=0,
        verbose_name="輸入 Token 數",
        help_text="本次請求使用的輸入 Token 數"
    )
    output_tokens = models.IntegerField(
        default=0,
        verbose_name="輸出 Token 數",
        help_text="本次請求使用的輸出 Token 數"
    )
    cost_cents = models.IntegerField(
        default=0,
        verbose_name="費用（美分）",
        help_text="本次請求的費用（以美分表示）"
    )
    model_used = models.CharField(
        max_length=50,
        default='deepseek-v4',
        verbose_name="使用的模型",
        help_text="使用的 LLM 模型版本"
    )

    class Meta:
        verbose_name = "AI 執行紀錄"
        verbose_name_plural = "AI 執行紀錄"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["session", "-created_at"]),
        ]

    def __str__(self):
        user_str = self.user.username if self.user else "Anonymous"
        return f"AILog #{self.pk} - {user_str} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"


class AIChatRun(models.Model):
    """Durable AI chat task controlled by the backend."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        AWAITING_APPROVAL = "awaiting_approval", "Awaiting approval"
        AWAITING_USER_ANSWER = "awaiting_user_answer", "Awaiting user answer"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    class Kind(models.TextChoices):
        CHAT = "chat", "Chat"
        RESUME = "resume", "Resume"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AISession,
        on_delete=models.CASCADE,
        related_name="runs",
        verbose_name="Session",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_chat_runs",
        verbose_name="用戶",
    )
    user_message = models.ForeignKey(
        AIMessage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_runs_as_user_message",
    )
    assistant_message = models.ForeignKey(
        AIMessage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_runs_as_assistant_message",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.CHAT)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.QUEUED)
    content = models.TextField(blank=True)
    model_id = models.CharField(max_length=50, default="deepseek-v4")
    thread_id = models.CharField(max_length=100, blank=True)
    external_run_id = models.CharField(max_length=100, blank=True)
    celery_task_id = models.CharField(max_length=100, blank=True)
    error = models.TextField(blank=True)
    approval_payload = models.JSONField(default=dict, blank=True)
    question_payload = models.JSONField(default=dict, blank=True)
    resume_decision = models.CharField(max_length=20, blank=True)
    question_answer = models.TextField(blank=True)
    cancel_requested = models.BooleanField(default=False)
    last_event_seq = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["user", "status", "created_at"]),
            models.Index(fields=["session", "status", "created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]

    @property
    def is_active(self) -> bool:
        return self.status in {
            self.Status.QUEUED,
            self.Status.RUNNING,
            self.Status.AWAITING_APPROVAL,
            self.Status.AWAITING_USER_ANSWER,
        }

    def __str__(self):
        return f"AIChatRun {self.id} ({self.status})"


class AIStreamEvent(models.Model):
    """Persisted stream event for replaying an AI run subscription."""

    run = models.ForeignKey(
        AIChatRun,
        on_delete=models.CASCADE,
        related_name="events",
    )
    seq = models.PositiveIntegerField()
    event_type = models.CharField(max_length=64)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["seq"]
        constraints = [
            models.UniqueConstraint(fields=["run", "seq"], name="uniq_ai_stream_event_run_seq"),
        ]
        indexes = [
            models.Index(fields=["run", "seq"]),
            models.Index(fields=["event_type", "created_at"]),
        ]

    def __str__(self):
        return f"AIStreamEvent run={self.run_id} seq={self.seq} type={self.event_type}"


class UserAICredit(models.Model):
    """Per-user cumulative AI usage tracking."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_credit",
        verbose_name="用戶",
    )
    total_input_tokens = models.BigIntegerField(default=0, verbose_name="累計輸入 tokens")
    total_output_tokens = models.BigIntegerField(default=0, verbose_name="累計輸出 tokens")
    total_requests = models.IntegerField(default=0, verbose_name="累計請求數")
    total_cost_cents = models.BigIntegerField(default=0, verbose_name="累計費用 (cents)")
    total_credits = models.BigIntegerField(
        default=0,
        verbose_name="累計 AI Credits",
        help_text="依 usage_to_credits 由 token × 模型單價換算之累計點數",
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="最後更新")

    class Meta:
        verbose_name = "AI Credit 使用紀錄"
        verbose_name_plural = "AI Credit 使用紀錄"

    @property
    def total_cost_usd(self):
        return Decimal(self.total_cost_cents) / 100

    def __str__(self):
        return f"AICredit {self.user} - {self.total_requests} reqs, {self.total_credits} cr"


class AIArtifact(models.Model):
    """Artifact produced during an AI session (e.g. rubric, graded answers)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AISession,
        on_delete=models.CASCADE,
        related_name="artifacts",
    )
    run = models.ForeignKey(
        AIChatRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="artifacts",
        help_text="最近一次寫入此 artifact 的 run（保留紀錄，不影響讀取）",
    )
    step = models.CharField(
        max_length=64,
        help_text="SOP 階段識別（例：rubric、raw_answers、calibration、graded、final_delta）",
    )
    filename = models.CharField(max_length=255)
    object_key = models.CharField(
        max_length=512,
        help_text="MinIO 物件 key：ai-artifacts/{session_id}/{step}/{filename}",
    )
    content_type = models.CharField(max_length=100, default="application/octet-stream")
    size_bytes = models.PositiveIntegerField(default=0)
    checksum = models.CharField(
        max_length=64,
        blank=True,
        help_text="內容 sha256，用於完整性檢查",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="自由欄位：artifact_type、rubric 摘要、評分進度等",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "step", "filename"],
                name="uniq_ai_artifact_session_step_filename",
            ),
        ]
        indexes = [
            models.Index(fields=["session", "step"]),
            models.Index(fields=["session", "-updated_at"]),
        ]

    def __str__(self):
        return f"AIArtifact {self.session_id}/{self.step}/{self.filename}"
