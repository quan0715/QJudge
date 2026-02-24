"""Add AIPendingAction model for preview-then-confirm write flow."""

import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0005_session_redesign"),
        ("problems", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIPendingAction",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "action_type",
                    models.CharField(
                        choices=[("create", "建立題目"), ("patch", "修改題目")],
                        max_length=20,
                        verbose_name="動作類型",
                    ),
                ),
                (
                    "payload",
                    models.JSONField(
                        help_text="完整題目 JSON (create) 或 RFC6902 patch ops (patch)",
                        verbose_name="寫入資料",
                    ),
                ),
                (
                    "preview",
                    models.JSONField(
                        help_text="人可讀的預覽",
                        verbose_name="預覽資料",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "等待確認"),
                            ("confirmed", "已確認"),
                            ("executed", "已執行"),
                            ("cancelled", "已取消"),
                            ("expired", "已過期"),
                            ("failed", "執行失敗"),
                        ],
                        default="pending",
                        max_length=20,
                        verbose_name="狀態",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="建立時間"),
                ),
                (
                    "expires_at",
                    models.DateTimeField(
                        help_text="預設 created_at + 30 分鐘",
                        verbose_name="過期時間",
                    ),
                ),
                (
                    "error_message",
                    models.TextField(blank=True, null=True, verbose_name="錯誤訊息"),
                ),
                (
                    "session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pending_actions",
                        to="ai.aisession",
                        verbose_name="Session",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_pending_actions",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="用戶",
                    ),
                ),
                (
                    "target_problem",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pending_patches",
                        to="problems.problem",
                        verbose_name="目標題目",
                    ),
                ),
                (
                    "executed_problem",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="executed_actions",
                        to="problems.problem",
                        verbose_name="寫入的題目",
                    ),
                ),
            ],
            options={
                "verbose_name": "AI 待確認動作",
                "verbose_name_plural": "AI 待確認動作",
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["session", "status"],
                        name="ai_pendingact_sess_status_idx",
                    ),
                    models.Index(
                        fields=["user", "-created_at"],
                        name="ai_pendingact_user_created_idx",
                    ),
                ],
            },
        ),
    ]
