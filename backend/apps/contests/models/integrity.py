import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class ExamIntegrityRun(models.Model):
    class ComputeState(models.TextChoices):
        STOPPED = "stopped", "Stopped"
        STARTING = "starting", "Starting"
        RUNNING = "running", "Running"
        STOPPING = "stopping", "Stopping"
        DESTROYED = "destroyed", "Destroyed"

    class Health(models.TextChoices):
        HEALTHY = "healthy", "Healthy"
        UNHEALTHY = "unhealthy", "Unhealthy"

    class DataState(models.TextChoices):
        OPEN = "open", "Open"
        ARCHIVED = "archived", "Archived"
        PURGED = "purged", "Purged"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contest = models.ForeignKey(
        "contests.Contest", on_delete=models.CASCADE, related_name="integrity_runs",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_exam_integrity_runs",
    )
    compute_state = models.CharField(
        max_length=16, choices=ComputeState.choices, default=ComputeState.STOPPED,
    )
    health = models.CharField(
        max_length=16, choices=Health.choices, default=Health.HEALTHY,
    )
    data_state = models.CharField(
        max_length=16, choices=DataState.choices, default=DataState.OPEN,
    )
    warnings = models.JSONField(default=list, blank=True)
    metrics = models.JSONField(default=dict, blank=True)
    last_error = models.TextField(blank=True, default="")
    last_correlation_id = models.CharField(max_length=128, blank=True, default="")
    policy_snapshot = models.JSONField(default=dict)
    registry_snapshot = models.JSONField(default=dict)
    registry_version = models.CharField(max_length=64)
    worker_image = models.CharField(max_length=255)
    worker_image_digest = models.CharField(max_length=255, blank=True, default="")
    worker_version = models.CharField(max_length=64, blank=True, default="")
    container_id = models.CharField(max_length=128, blank=True, default="")
    container_name = models.CharField(max_length=128, blank=True, default="")
    worker_url = models.URLField(max_length=512, blank=True, default="")
    token_digest = models.CharField(max_length=64, blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    token_revoked_at = models.DateTimeField(null=True, blank=True)
    archive_generation = models.PositiveIntegerField(default=0)
    archive_manifest_key = models.TextField(blank=True, default="")
    archive_manifest_sha256 = models.CharField(max_length=64, blank=True, default="")
    received_counts = models.JSONField(default=dict, blank=True)
    processed_counts = models.JSONField(default=dict, blank=True)
    archived_counts = models.JSONField(default=dict, blank=True)
    last_worker_heartbeat_at = models.DateTimeField(null=True, blank=True)
    scheduled_start_at = models.DateTimeField(null=True, blank=True)
    scheduled_end_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    destroyed_at = models.DateTimeField(null=True, blank=True)
    purged_at = models.DateTimeField(null=True, blank=True)
    retention_until = models.DateTimeField(null=True, blank=True)
    stopped_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    destroyed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    purged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exam_integrity_runs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["contest", "compute_state"]),
            models.Index(fields=["data_state", "updated_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["contest"],
                condition=~Q(compute_state="destroyed"),
                name="uniq_live_integrity_run_per_contest",
            ),
        ]


class ExamEvidenceChunk(models.Model):
    class Source(models.TextChoices):
        SCREEN = "screen_share", "Screen share"
        WEBCAM = "webcam", "Webcam"

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        UPLOADED = "uploaded", "Uploaded"
        VERIFIED = "verified", "Verified"
        FAILED = "failed", "Failed"
        UNAVAILABLE = "unavailable", "Unavailable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    integrity_run = models.ForeignKey(
        ExamIntegrityRun, on_delete=models.CASCADE, related_name="evidence_chunks",
    )
    contest = models.ForeignKey("contests.Contest", on_delete=models.CASCADE)
    participant = models.ForeignKey(
        "contests.ContestParticipant",
        on_delete=models.CASCADE,
        related_name="integrity_evidence_chunks",
    )
    exam_event = models.ForeignKey(
        "contests.ExamEvent", on_delete=models.CASCADE, related_name="evidence_chunks",
    )
    incident_id = models.UUIDField()
    source = models.CharField(max_length=20, choices=Source.choices)
    recording_session_id = models.UUIDField()
    chunk_seq = models.PositiveIntegerField()
    is_init_chunk = models.BooleanField(default=False)
    start_at_ms = models.BigIntegerField()
    end_at_ms = models.BigIntegerField()
    object_key = models.TextField()
    content_type = models.CharField(max_length=96)
    codec = models.CharField(max_length=96, blank=True, default="")
    byte_size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    previous_sha256 = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.REQUESTED,
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "exam_evidence_chunks"
        constraints = [
            models.UniqueConstraint(
                fields=["integrity_run", "participant", "source",
                        "recording_session_id", "chunk_seq"],
                name="uniq_integrity_evidence_chunk",
            ),
        ]
        indexes = [
            models.Index(fields=["integrity_run", "incident_id"]),
            models.Index(fields=["participant", "status"]),
        ]
