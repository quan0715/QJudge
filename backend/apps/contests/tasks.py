"""
Celery tasks for contest scheduled operations.
Auto-submit participants when contest ends, auto-unlock locked participants,
and handle evidence video compilation/cleanup.
"""
import os
import re
import shutil
import subprocess
import tempfile

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from django.db import transaction
from datetime import datetime as dt, timedelta
from django.conf import settings
from .models import (
    Contest,
    ContestParticipant,
    ContestActivity,
    ExamEvent,
    ExamEvidenceJob,
    ExamEvidenceVideo,
    ExamStatus,
    EvidenceJobStatus,
)
from .services.anti_cheat_session import (
    get_last_heartbeat,
    touch_heartbeat,
    HEARTBEAT_TIMEOUT_SECONDS,
)
from .services.anticheat_storage import get_s3_client, tag_object_retain
from .services.exam_submission import finalize_submission, normalize_upload_session_id
from .constants import PENALIZED_EVENT_TYPES

FORCE_SUBMIT_LOCKED_SECONDS = 180  # 3 minutes


def _apply_penalty_from_event(participant: ContestParticipant, event_type: str):
    """
    Unified server-side anti-cheat escalation.
    - in_progress: threshold => lock
    - paused/locked: threshold => auto-submit
    - submitted: no-op (already finished)

    Uses transaction.atomic + select_for_update to ensure atomicity.
    """
    contest = participant.contest
    if event_type not in PENALIZED_EVENT_TYPES:
        return participant

    with transaction.atomic():
        participant = ContestParticipant.objects.select_for_update().get(pk=participant.pk)

        if participant.exam_status == ExamStatus.SUBMITTED:
            return participant

        # heartbeat_timeout and listener_tampered target is LOCKED, not submission.
        # If already locked, the intended action is complete — do not escalate to finalize.
        LOCK_TERMINAL_EVENT_TYPES = {'heartbeat_timeout', 'listener_tampered'}
        if event_type in LOCK_TERMINAL_EVENT_TYPES and participant.exam_status == ExamStatus.LOCKED:
            return participant

        participant.violation_count += 1
        update_fields = ['violation_count']
        IMMEDIATE_LOCK_EVENT_TYPES = {'warning_timeout', 'screen_share_stopped', 'heartbeat_timeout', 'listener_tampered'}
        should_escalate = (
            event_type in IMMEDIATE_LOCK_EVENT_TYPES
            or participant.violation_count >= contest.max_cheat_warnings
        )

        if should_escalate:
            if participant.exam_status == ExamStatus.IN_PROGRESS:
                participant.exam_status = ExamStatus.LOCKED
                participant.locked_at = timezone.now()
                if event_type == 'warning_timeout':
                    participant.lock_reason = "Warning timeout: student did not acknowledge warning within 30 seconds"
                elif event_type == 'heartbeat_timeout':
                    participant.lock_reason = "Heartbeat timeout: no client signal received for 60 seconds"
                elif event_type == 'listener_tampered':
                    participant.lock_reason = "Listener tampered: anti-cheat integrity check failed"
                else:
                    participant.lock_reason = f"System lock: {event_type}"
                update_fields.extend(['exam_status', 'locked_at', 'lock_reason'])
                participant.save(update_fields=update_fields)
                ContestActivity.objects.create(
                    contest=contest,
                    user=participant.user,
                    action_type='lock_user',
                    details=f"Auto-locked due to {event_type}",
                )
                return participant

            if participant.exam_status in [ExamStatus.PAUSED, ExamStatus.LOCKED]:
                reason = (
                    f"Auto-submitted: violation while {participant.exam_status} "
                    f"(event={event_type}, count={participant.violation_count}/{contest.max_cheat_warnings})"
                )
                participant.save(update_fields=update_fields)
                finalize_submission(
                    participant,
                    submit_reason=reason,
                    upload_session_id="default",
                    activity_user=participant.user,
                    activity_action_type="auto_submit",
                    activity_details=reason,
                )
                return participant

        participant.save(update_fields=update_fields)
        return participant


@shared_task
def check_contest_end():
    """
    Periodic task: Check for contests that have ended and auto-submit participants.
    
    Runs every minute via Celery Beat. Finds all published exam-mode contests
    that have passed their end_time and triggers auto-submit for each.
    """
    now = timezone.now()
    
    ended_contests = Contest.objects.filter(
        end_time__lte=now,
        status='published',
        cheat_detection_enabled=True,
        registrations__exam_status__in=[
            ExamStatus.IN_PROGRESS,
            ExamStatus.PAUSED,
            ExamStatus.LOCKED,
            ExamStatus.LOCKED_TAKEOVER,
        ],
    ).distinct()
    
    for contest in ended_contests:
        auto_submit_participants.delay(contest.id)


@shared_task
def auto_submit_participants(contest_id):
    """
    Submit all non-submitted participants for a specific contest.
    
    Only submits participants in active exam states (IN_PROGRESS, PAUSED, LOCKED).
    Already SUBMITTED or NOT_STARTED participants are unaffected.
    """
    try:
        contest = Contest.objects.get(id=contest_id)
        
        # Double-check: If admin extended end_time, skip
        if contest.end_time and contest.end_time > timezone.now():
            return f"Contest {contest_id} end_time extended, skipping"
        
        participants = list(
            ContestParticipant.objects.select_related("contest", "user").filter(
            contest_id=contest_id,
            exam_status__in=[
                ExamStatus.IN_PROGRESS,
                ExamStatus.PAUSED,
                ExamStatus.LOCKED,
                ExamStatus.LOCKED_TAKEOVER,
            ]
        )
        )

        count = 0
        for participant in participants:
            finalize_submission(
                participant,
                submit_reason='Auto-submitted: contest ended',
                upload_session_id="default",
                activity_user=participant.user,
                activity_action_type="auto_submit",
                activity_details="Auto-submitted: contest ended",
            )
            count += 1
        
        return f"Auto-submitted {count} participants for contest {contest_id}"
        
    except Contest.DoesNotExist:
        return f"Contest {contest_id} not found"


@shared_task
def check_auto_unlock():
    """
    Periodic task: Check for locked participants who should be auto-unlocked.
    
    Runs every 30 seconds via Celery Beat. Finds all locked participants
    whose lock timeout has passed and triggers unlock for each.
    """
    now = timezone.now()
    
    locked_participants = ContestParticipant.objects.filter(
        exam_status=ExamStatus.LOCKED,
        locked_at__isnull=False,
        contest__allow_auto_unlock=True,
        contest__end_time__gt=now  # Only if contest hasn't ended
    ).select_related('contest')
    
    for participant in locked_participants:
        minutes = participant.contest.auto_unlock_minutes or 0
        unlock_time = participant.locked_at + timezone.timedelta(minutes=minutes)
        
        if now >= unlock_time:
            auto_unlock_participant.delay(participant.id)


@shared_task
def auto_unlock_participant(participant_id):
    """
    Unlock a specific participant.
    
    Transitions from LOCKED to PAUSED state and resets lock metadata.
    """
    try:
        participant = ContestParticipant.objects.select_related('contest').get(id=participant_id)
        
        # Validate: Don't unlock if contest has ended
        if participant.contest.end_time <= timezone.now():
            return f"Contest ended, not unlocking participant {participant_id}"
        
        if participant.exam_status == ExamStatus.LOCKED:
            participant.exam_status = ExamStatus.PAUSED
            participant.locked_at = None
            participant.lock_reason = ""
            participant.violation_count = 0
            participant.save(update_fields=['exam_status', 'locked_at', 'lock_reason', 'violation_count'])
            return f"Unlocked participant {participant_id}"
            
        return f"Participant {participant_id} not locked"
        
    except ContestParticipant.DoesNotExist:
        return f"Participant {participant_id} not found"


@shared_task
def check_force_submit_locked():
    """
    Periodic task: Force-submit participants locked for more than 3 minutes.

    Runs every 30 seconds via Celery Beat. If auto-unlock triggers first
    (auto_unlock_minutes < 3), the participant will already be unlocked and
    this task correctly skips them.
    """
    now = timezone.now()
    threshold = now - timedelta(seconds=FORCE_SUBMIT_LOCKED_SECONDS)

    locked_participants = ContestParticipant.objects.filter(
        exam_status=ExamStatus.LOCKED,
        locked_at__isnull=False,
        locked_at__lte=threshold,
        contest__status='published',
        contest__cheat_detection_enabled=True,
        contest__end_time__gt=now,
    ).select_related('contest', 'user')

    count = 0
    for participant in locked_participants:
        # Skip if auto-unlock would have triggered before 3 minutes
        if participant.contest.allow_auto_unlock:
            unlock_minutes = participant.contest.auto_unlock_minutes or 0
            if unlock_minutes > 0 and unlock_minutes * 60 < FORCE_SUBMIT_LOCKED_SECONDS:
                continue

        # Execute directly inside periodic task context to avoid queue lag/race.
        force_submit_locked_participant(participant.id)
        count += 1

    return f"Processed {count} locked participants for force-submit"


@shared_task
def force_submit_locked_participant(participant_id):
    """
    Force-submit a participant who has been locked for more than 3 minutes.

    Transitions LOCKED → SUBMITTED and records audit trail.
    """
    try:
        participant = ContestParticipant.objects.select_related(
            'contest', 'user'
        ).get(id=participant_id)

        # Guard: only submit if still locked
        if participant.exam_status != ExamStatus.LOCKED:
            return f"Participant {participant_id} no longer locked, skipping"

        # Guard: don't submit if contest ended (check_contest_end handles that)
        if participant.contest.end_time and participant.contest.end_time <= timezone.now():
            return f"Contest ended, skipping force-submit for {participant_id}"

        submit_reason = (
            f"Auto-submitted: locked for more than {FORCE_SUBMIT_LOCKED_SECONDS // 60} minutes"
        )
        finalize_submission(
            participant,
            submit_reason=submit_reason,
            upload_session_id="default",
            activity_user=participant.user,
            activity_action_type="auto_submit",
            activity_details=(
                f"Force-submitted after being locked for {FORCE_SUBMIT_LOCKED_SECONDS // 60} minutes"
            ),
        )

        # Record ExamEvent
        ExamEvent.objects.create(
            contest=participant.contest,
            user=participant.user,
            event_type='force_submit_locked',
            metadata={
                'source': 'celery_force_submit',
                'locked_at': participant.locked_at.isoformat() if participant.locked_at else None,
                'lock_reason': participant.lock_reason,
            }
        )

        return f"Force-submitted participant {participant_id}"

    except ContestParticipant.DoesNotExist:
        return f"Participant {participant_id} not found"




@shared_task
def check_heartbeat_timeout():
    """
    Periodic task: Lock students who haven't sent a heartbeat in 60 seconds.

    Runs every 30 seconds via Celery Beat. Detects:
    - Disabled event listeners (student tampered with anti-cheat)
    - Network disconnection
    - Browser crash / tab kill
    """
    now = timezone.now()
    participants = ContestParticipant.objects.filter(
        exam_status=ExamStatus.IN_PROGRESS,
        contest__status='published',
        contest__cheat_detection_enabled=True,
        contest__end_time__gt=now,
        started_at__isnull=False,
    ).select_related('contest', 'user')

    count = 0
    for participant in participants:
        last_hb = get_last_heartbeat(participant.contest_id, participant.user_id)
        if last_hb is None:
            # No heartbeat recorded yet — use started_at as baseline
            elapsed = (now - participant.started_at).total_seconds()
            if elapsed > HEARTBEAT_TIMEOUT_SECONDS:
                _lock_for_heartbeat_timeout(participant)
                count += 1
            continue

        try:
            last_hb_time = dt.fromisoformat(last_hb)
            if timezone.is_naive(last_hb_time):
                last_hb_time = timezone.make_aware(last_hb_time)
        except (ValueError, TypeError):
            continue

        if (now - last_hb_time).total_seconds() > HEARTBEAT_TIMEOUT_SECONDS:
            _lock_for_heartbeat_timeout(participant)
            count += 1

    return f"Checked heartbeat timeouts: {count} locked"


def _lock_for_heartbeat_timeout(participant: ContestParticipant):
    """Create heartbeat_timeout event and apply penalty.

    Uses cache.add() (Redis SETNX) as an idempotency guard so concurrent
    Celery workers don't double-fire on the same participant.
    """
    lock_key = f"hb_lock:{participant.pk}"
    if not cache.add(lock_key, 1, timeout=90):
        return  # Another worker is already processing this participant
    ExamEvent.objects.create(
        contest=participant.contest,
        user=participant.user,
        event_type='heartbeat_timeout',
        metadata={'source': 'celery_heartbeat_check'},
    )
    _apply_penalty_from_event(participant, 'heartbeat_timeout')


def _extract_seq_from_key(key: str) -> int:
    match = re.search(r"_seq_(\d+)\.webp$", key)
    if not match:
        return 0
    return int(match.group(1))


def _list_raw_keys(client, bucket: str, prefix: str) -> list[str]:
    paginator = client.get_paginator("list_objects_v2")
    keys: list[str] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item.get("Key")
            if key and key.endswith(".webp"):
                keys.append(key)
    keys.sort(key=_extract_seq_from_key)
    return keys


def _delete_raw_keys(client, bucket: str, keys: list[str]) -> None:
    chunk_size = 500
    for i in range(0, len(keys), chunk_size):
        chunk = keys[i:i + chunk_size]
        if not chunk:
            continue
        client.delete_objects(
            Bucket=bucket,
            Delete={
                "Objects": [{"Key": key} for key in chunk],
                "Quiet": True,
            },
        )


@shared_task
def compile_anticheat_video(participant_id: int, upload_session_id: str = ""):
    """
    Compile raw anti-cheat screenshots into a single MP4.
    """
    try:
        participant = ContestParticipant.objects.select_related("contest", "user").get(id=participant_id)
    except ContestParticipant.DoesNotExist:
        return f"Participant {participant_id} not found"

    contest = participant.contest
    upload_session_id = normalize_upload_session_id(upload_session_id)

    job, created = ExamEvidenceJob.objects.get_or_create(
        contest=contest,
        participant=participant,
        upload_session_id=upload_session_id,
        defaults={"status": EvidenceJobStatus.PENDING},
    )
    if not created and job.status == EvidenceJobStatus.RUNNING:
        return f"Job already running for participant={participant_id} session={upload_session_id}"

    client = get_s3_client()
    raw_bucket = settings.ANTICHEAT_RAW_BUCKET
    video_bucket = settings.ANTICHEAT_VIDEO_BUCKET
    if upload_session_id and upload_session_id != "default":
        raw_prefix = f"contest_{contest.id}/user_{participant.user_id}/session_{upload_session_id}/"
    else:
        raw_prefix = f"contest_{contest.id}/user_{participant.user_id}/"

    temp_dir = tempfile.mkdtemp(prefix=f"anticheat_{contest.id}_{participant.user_id}_")
    raw_keys: list[str] = []
    try:
        raw_keys = _list_raw_keys(client, raw_bucket, raw_prefix)
        if not raw_keys:
            if not created and job.status == EvidenceJobStatus.SUCCESS:
                return (
                    f"No new raw screenshots for participant={participant_id} "
                    f"session={upload_session_id}; keeping previous SUCCESS"
                )
            job.status = EvidenceJobStatus.FAILED
            job.error_message = "No raw screenshots found"
            job.finished_at = timezone.now()
            job.save(update_fields=["status", "error_message", "finished_at", "updated_at"])
            return "No raw screenshots found"

        job.status = EvidenceJobStatus.RUNNING
        job.started_at = timezone.now()
        job.error_message = ""
        job.finished_at = None
        job.save(update_fields=["status", "started_at", "error_message", "finished_at", "updated_at"])

        job.raw_count = len(raw_keys)
        job.save(update_fields=["raw_count", "updated_at"])

        for index, key in enumerate(raw_keys, start=1):
            filename = os.path.join(temp_dir, f"frame_{index:06d}.webp")
            client.download_file(raw_bucket, key, filename)

        output_name = f"session_{upload_session_id}.mp4"
        output_path = os.path.join(temp_dir, output_name)
        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-framerate",
            "1",
            "-i",
            os.path.join(temp_dir, "frame_%06d.webp"),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=ceil(iw/2)*2:ceil(ih/2)*2",
            "-movflags",
            "+faststart",
            output_path,
        ]
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)

        video_key = f"contest_{contest.id}/user_{participant.user_id}/{output_name}"
        client.upload_file(
            output_path,
            video_bucket,
            video_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        size_bytes = os.path.getsize(output_path)

        ExamEvidenceVideo.objects.update_or_create(
            contest=contest,
            participant=participant,
            upload_session_id=upload_session_id,
            defaults={
                "bucket": video_bucket,
                "object_key": video_key,
                "frame_count": len(raw_keys),
                "duration_seconds": len(raw_keys),
                "size_bytes": size_bytes,
            },
        )
        _delete_raw_keys(client, raw_bucket, raw_keys)
        job.status = EvidenceJobStatus.SUCCESS
        job.video_bucket = video_bucket
        job.video_key = video_key
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "video_bucket", "video_key", "finished_at", "updated_at"])
        return f"Compiled video for participant {participant_id} ({len(raw_keys)} frames)"
    except Exception as exc:
        for key in raw_keys:
            try:
                tag_object_retain(raw_bucket, key)
            except Exception:
                pass
        job.status = EvidenceJobStatus.FAILED
        job.error_message = str(exc)
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_message", "finished_at", "updated_at"])
        return f"Failed to compile video for participant {participant_id}: {exc}"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
