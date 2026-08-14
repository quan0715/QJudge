from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("contests", "0089_remove_retired_contest_delivery_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="examevent",
            name="client_occurred_at_ms",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="examevent",
            name="delayed_delivery",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="examevent",
            name="event_definition_version",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="examevent",
            name="event_schema_version",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="examevent",
            name="incident_id",
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="examevent",
            name="integrity_command_id",
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="examevent",
            name="server_received_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="examevent",
            name="worker_processed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="examevent",
            name="event_type",
            field=models.CharField(max_length=64, verbose_name="事件類型"),
        ),
        migrations.CreateModel(
            name="ExamIntegrityRun",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("compute_state", models.CharField(choices=[("stopped", "Stopped"), ("starting", "Starting"), ("running", "Running"), ("stopping", "Stopping"), ("destroyed", "Destroyed")], default="stopped", max_length=16)),
                ("health", models.CharField(choices=[("healthy", "Healthy"), ("unhealthy", "Unhealthy")], default="healthy", max_length=16)),
                ("data_state", models.CharField(choices=[("open", "Open"), ("archived", "Archived"), ("purged", "Purged")], default="open", max_length=16)),
                ("warnings", models.JSONField(blank=True, default=list)),
                ("metrics", models.JSONField(blank=True, default=dict)),
                ("last_error", models.TextField(blank=True, default="")),
                ("last_correlation_id", models.CharField(blank=True, default="", max_length=128)),
                ("policy_snapshot", models.JSONField(default=dict)),
                ("registry_snapshot", models.JSONField(default=dict)),
                ("registry_version", models.CharField(max_length=64)),
                ("worker_image", models.CharField(max_length=255)),
                ("worker_image_digest", models.CharField(blank=True, default="", max_length=255)),
                ("worker_version", models.CharField(blank=True, default="", max_length=64)),
                ("container_id", models.CharField(blank=True, default="", max_length=128)),
                ("container_name", models.CharField(blank=True, default="", max_length=128)),
                ("worker_url", models.URLField(blank=True, default="", max_length=512)),
                ("token_digest", models.CharField(blank=True, default="", max_length=64)),
                ("token_expires_at", models.DateTimeField(blank=True, null=True)),
                ("token_revoked_at", models.DateTimeField(blank=True, null=True)),
                ("archive_generation", models.PositiveIntegerField(default=0)),
                ("archive_manifest_key", models.TextField(blank=True, default="")),
                ("archive_manifest_sha256", models.CharField(blank=True, default="", max_length=64)),
                ("received_counts", models.JSONField(blank=True, default=dict)),
                ("processed_counts", models.JSONField(blank=True, default=dict)),
                ("archived_counts", models.JSONField(blank=True, default=dict)),
                ("last_worker_heartbeat_at", models.DateTimeField(blank=True, null=True)),
                ("scheduled_start_at", models.DateTimeField(blank=True, null=True)),
                ("scheduled_end_at", models.DateTimeField(blank=True, null=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("stopped_at", models.DateTimeField(blank=True, null=True)),
                ("destroyed_at", models.DateTimeField(blank=True, null=True)),
                ("purged_at", models.DateTimeField(blank=True, null=True)),
                ("retention_until", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("contest", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="integrity_runs", to="contests.contest")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_exam_integrity_runs", to=settings.AUTH_USER_MODEL)),
                ("destroyed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("purged_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("stopped_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "exam_integrity_runs", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="ExamEvidenceChunk",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("incident_id", models.UUIDField()),
                ("source", models.CharField(choices=[("screen_share", "Screen share"), ("webcam", "Webcam")], max_length=20)),
                ("recording_session_id", models.UUIDField()),
                ("chunk_seq", models.PositiveIntegerField()),
                ("is_init_chunk", models.BooleanField(default=False)),
                ("start_at_ms", models.BigIntegerField()),
                ("end_at_ms", models.BigIntegerField()),
                ("object_key", models.TextField()),
                ("content_type", models.CharField(max_length=96)),
                ("codec", models.CharField(blank=True, default="", max_length=96)),
                ("byte_size", models.PositiveBigIntegerField()),
                ("sha256", models.CharField(max_length=64)),
                ("previous_sha256", models.CharField(blank=True, default="", max_length=64)),
                ("status", models.CharField(choices=[("requested", "Requested"), ("uploaded", "Uploaded"), ("verified", "Verified"), ("failed", "Failed"), ("unavailable", "Unavailable")], default="requested", max_length=16)),
                ("requested_at", models.DateTimeField(auto_now_add=True)),
                ("uploaded_at", models.DateTimeField(blank=True, null=True)),
                ("verified_at", models.DateTimeField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("contest", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="contests.contest")),
                ("exam_event", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="evidence_chunks", to="contests.examevent")),
                ("integrity_run", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="evidence_chunks", to="contests.examintegrityrun")),
                ("participant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="integrity_evidence_chunks", to="contests.contestparticipant")),
            ],
            options={"db_table": "exam_evidence_chunks"},
        ),
        migrations.AddField(
            model_name="examevent",
            name="integrity_run",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="normalized_events", to="contests.examintegrityrun"),
        ),
        migrations.AddIndex(
            model_name="examintegrityrun",
            index=models.Index(fields=["contest", "compute_state"], name="exam_integr_contest_b89025_idx"),
        ),
        migrations.AddIndex(
            model_name="examintegrityrun",
            index=models.Index(fields=["data_state", "updated_at"], name="exam_integr_data_st_e511a7_idx"),
        ),
        migrations.AddConstraint(
            model_name="examintegrityrun",
            constraint=models.UniqueConstraint(condition=models.Q(("compute_state", "destroyed"), _negated=True), fields=("contest",), name="uniq_live_integrity_run_per_contest"),
        ),
        migrations.AddIndex(
            model_name="examevidencechunk",
            index=models.Index(fields=["integrity_run", "incident_id"], name="exam_eviden_integri_5da9bf_idx"),
        ),
        migrations.AddIndex(
            model_name="examevidencechunk",
            index=models.Index(fields=["participant", "status"], name="exam_eviden_partici_22f20d_idx"),
        ),
        migrations.AddConstraint(
            model_name="examevidencechunk",
            constraint=models.UniqueConstraint(fields=("integrity_run", "participant", "source", "recording_session_id", "chunk_seq"), name="uniq_integrity_evidence_chunk"),
        ),
    ]
