"""
Submission finalization helpers for exam anti-cheat flows.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.contests.models import (
    ContestActivity,
    ExamEvent,
    ExamEvidenceJob,
    EvidenceJobStatus,
    ExamStatus,
)

from .anti_cheat_session import clear_active_session, clear_exam_allowed_jti

if TYPE_CHECKING:
    from apps.contests.models import ContestParticipant
    from apps.users.models import User

logger = logging.getLogger(__name__)
VALID_SOURCE_MODULES = ("screen_share", "webcam")


def normalize_upload_session_id(upload_session_id: str | None) -> str:
    value = str(upload_session_id or "").strip()
    return value or "default"


def normalize_source_module(source_module: str | None) -> str:
    value = str(source_module or "").strip().lower()
    if value not in VALID_SOURCE_MODULES:
        return "screen_share"
    return value


def parse_source_module(source_module: str | None) -> str | None:
    value = str(source_module or "").strip().lower()
    if value not in VALID_SOURCE_MODULES:
        return None
    return value


def _extract_active_sources_from_exam_entered(metadata: dict | None) -> list[str]:
    if not isinstance(metadata, dict):
        return []
    raw_sources = metadata.get("active_sources")
    if not isinstance(raw_sources, list):
        return []
    out: list[str] = []
    for item in raw_sources:
        module = parse_source_module(item if isinstance(item, str) else None)
        if module and module not in out:
            out.append(module)
    return out


def resolve_submission_source_modules(
    participant: "ContestParticipant",
    upload_session_id: str | None = None,
    source_module: str | None = None,
) -> list[str]:
    """
    Resolve source modules for evidence jobs at submission time.

    Priority:
    1) active_sources from latest exam_entered metadata (best representation of runtime enabled modules)
    2) explicit source_module from client/event
    3) backward-compatible fallback: screen_share
    """
    explicit_module = parse_source_module(source_module)

    target_session_id = normalize_upload_session_id(upload_session_id)
    inferred_modules: list[str] = []
    entry_events = ExamEvent.objects.filter(
        contest=participant.contest,
        user=participant.user,
        event_type="exam_entered",
    ).order_by("-created_at")
    for entry_event in entry_events:
        metadata = entry_event.metadata if isinstance(entry_event.metadata, dict) else {}
        event_session_id = normalize_upload_session_id(metadata.get("upload_session_id"))
        if event_session_id != target_session_id:
            continue
        inferred_modules = _extract_active_sources_from_exam_entered(metadata)
        if inferred_modules:
            break
    if inferred_modules:
        if explicit_module and explicit_module not in inferred_modules:
            inferred_modules.append(explicit_module)
        return inferred_modules
    if explicit_module:
        return [explicit_module]
    return ["screen_share"]


def enqueue_compile_video(
    participant_id: int,
    upload_session_id: str | None,
    source_module: str | None = None,
) -> None:
    from apps.contests.tasks import compile_anticheat_video

    compile_anticheat_video.apply_async(
        args=[
            participant_id,
            normalize_upload_session_id(upload_session_id),
            normalize_source_module(source_module),
        ],
        queue="video_queue",
    )


def enqueue_retain_raw_screenshots(contest_id: int, user_id: int) -> None:
    from apps.contests.tasks import retain_raw_screenshots

    retain_raw_screenshots.delay(contest_id, user_id)


def ensure_evidence_job(
    participant: "ContestParticipant",
    upload_session_id: str | None,
    source_module: str | None = None,
) -> ExamEvidenceJob:
    session_id = normalize_upload_session_id(upload_session_id)
    module = normalize_source_module(source_module)
    job, _ = ExamEvidenceJob.objects.get_or_create(
        contest=participant.contest,
        participant=participant,
        source_module=module,
        upload_session_id=session_id,
        defaults={"status": EvidenceJobStatus.PENDING},
    )
    return job


def ensure_evidence_jobs(
    participant: "ContestParticipant",
    upload_session_id: str | None,
    source_module: str | None = None,
) -> list[ExamEvidenceJob]:
    session_id = normalize_upload_session_id(upload_session_id)
    modules = resolve_submission_source_modules(participant, session_id, source_module)
    jobs: list[ExamEvidenceJob] = []
    for module in modules:
        jobs.append(ensure_evidence_job(participant, session_id, module))
    return jobs


def finalize_submission(
    participant: "ContestParticipant",
    *,
    submit_reason: str,
    upload_session_id: str | None = None,
    source_module: str | None = None,
    activity_user: "User | None" = None,
    activity_action_type: str | None = None,
    activity_details: str = "",
) -> str:
    """
    Finalize participant submission in a single idempotent flow.
    Always records pending evidence jobs for monitored exams.
    Video compilation is triggered only by the explicit manual compile endpoint.
    """
    session_id = normalize_upload_session_id(upload_session_id)
    modules = resolve_submission_source_modules(participant, session_id, source_module)

    update_fields: list[str] = []
    now = timezone.now()
    if participant.exam_status != ExamStatus.SUBMITTED:
        participant.exam_status = ExamStatus.SUBMITTED
        update_fields.append("exam_status")
    if participant.left_at is None:
        participant.left_at = now
        update_fields.append("left_at")
    if submit_reason and participant.submit_reason != submit_reason:
        participant.submit_reason = submit_reason
        update_fields.append("submit_reason")
    if update_fields:
        participant.save(update_fields=update_fields)

    clear_active_session(participant.contest_id, participant.user_id)
    # Release JTI pin so other devices can work normally after exam ends
    clear_exam_allowed_jti(participant.user_id)

    if participant.contest.cheat_detection_enabled:
        for module in modules:
            ensure_evidence_job(participant, session_id, module)
        try:
            enqueue_retain_raw_screenshots(participant.contest_id, participant.user_id)
        except Exception:  # pragma: no cover - defensive guard for external storage/task backend failures
            logger.exception(
                "retain_raw_screenshots enqueue failed for contest=%s user=%s",
                participant.contest_id,
                participant.user_id,
            )

    if activity_user and activity_action_type:
        ContestActivity.objects.create(
            contest=participant.contest,
            user=activity_user,
            action_type=activity_action_type,
            details=activity_details,
        )

    return session_id
