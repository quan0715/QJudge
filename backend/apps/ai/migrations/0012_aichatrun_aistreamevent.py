import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0011_alter_aiexecutionlog_model_used_useraicredit"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIChatRun",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("kind", models.CharField(choices=[("chat", "Chat"), ("resume", "Resume")], default="chat", max_length=20)),
                ("status", models.CharField(choices=[("queued", "Queued"), ("running", "Running"), ("awaiting_approval", "Awaiting approval"), ("completed", "Completed"), ("failed", "Failed"), ("cancelled", "Cancelled")], default="queued", max_length=32)),
                ("content", models.TextField(blank=True)),
                ("model_id", models.CharField(default="deepseek-r1", max_length=50)),
                ("thread_id", models.CharField(blank=True, max_length=100)),
                ("external_run_id", models.CharField(blank=True, max_length=100)),
                ("celery_task_id", models.CharField(blank=True, max_length=100)),
                ("error", models.TextField(blank=True)),
                ("approval_payload", models.JSONField(blank=True, default=dict)),
                ("resume_decision", models.CharField(blank=True, max_length=20)),
                ("cancel_requested", models.BooleanField(default=False)),
                ("last_event_seq", models.PositiveIntegerField(default=0)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("assistant_message", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="chat_runs_as_assistant_message", to="ai.aimessage")),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="runs", to="ai.aisession", verbose_name="Session")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ai_chat_runs", to=settings.AUTH_USER_MODEL, verbose_name="用戶")),
                ("user_message", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="chat_runs_as_user_message", to="ai.aimessage")),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        migrations.CreateModel(
            name="AIStreamEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("seq", models.PositiveIntegerField()),
                ("event_type", models.CharField(max_length=64)),
                ("payload", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("run", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="events", to="ai.aichatrun")),
            ],
            options={
                "ordering": ["seq"],
            },
        ),
        migrations.AddIndex(
            model_name="aichatrun",
            index=models.Index(fields=["user", "status", "created_at"], name="ai_aichatru_user_id_bddaba_idx"),
        ),
        migrations.AddIndex(
            model_name="aichatrun",
            index=models.Index(fields=["session", "status", "created_at"], name="ai_aichatru_session_1b7859_idx"),
        ),
        migrations.AddIndex(
            model_name="aichatrun",
            index=models.Index(fields=["status", "created_at"], name="ai_aichatru_status_34e8bd_idx"),
        ),
        migrations.AddIndex(
            model_name="aistreamevent",
            index=models.Index(fields=["run", "seq"], name="ai_aistrea_run_id_19c03c_idx"),
        ),
        migrations.AddIndex(
            model_name="aistreamevent",
            index=models.Index(fields=["event_type", "created_at"], name="ai_aistrea_event_t_ce4d9c_idx"),
        ),
        migrations.AddConstraint(
            model_name="aistreamevent",
            constraint=models.UniqueConstraint(fields=("run", "seq"), name="uniq_ai_stream_event_run_seq"),
        ),
    ]
