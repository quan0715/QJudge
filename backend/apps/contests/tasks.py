"""
Celery tasks for contest scheduled operations.
Auto-submit participants when contest ends and enforce locked-attempt handling.
"""

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from django.db import transaction
from datetime import datetime as dt, timedelta
from .models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamStatus,
)
from .services.activity_log import log_contest_activity
from .services.anti_cheat_session import (
    get_last_heartbeat,
    HEARTBEAT_TIMEOUT_SECONDS,
)
from .services.evidence_windows import attach_evidence_window_metadata
from .services.exam_submission import finalize_submission
from .constants import ENVIRONMENT_RECHECK_EVENT_TYPES, IMMEDIATE_LOCK_EVENT_TYPES, PENALIZED_EVENT_TYPES

FORCE_SUBMIT_LOCKED_SECONDS = 180  # 3 minutes


def _apply_penalty_from_event(participant: ContestParticipant, event_type: str):
    """
    Unified server-side anti-cheat escalation.
    - in_progress: critical monitoring failure => pause for pre-check
    - locked: manual TA lock remains terminal until TA action or force-submit
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

        participant.violation_count += 1
        update_fields = ['violation_count']
        requires_recheck_pause = event_type in ENVIRONMENT_RECHECK_EVENT_TYPES
        should_escalate = event_type in IMMEDIATE_LOCK_EVENT_TYPES or requires_recheck_pause

        if should_escalate:
            if participant.exam_status == ExamStatus.IN_PROGRESS:
                if event_type in IMMEDIATE_LOCK_EVENT_TYPES:
                    participant.exam_status = ExamStatus.LOCKED
                    participant.locked_at = timezone.now()
                    update_fields.extend(['exam_status', 'locked_at', 'lock_reason'])
                else:
                    participant.exam_status = ExamStatus.PAUSED
                    participant.locked_at = None
                    update_fields.extend(['exam_status', 'locked_at', 'lock_reason'])

                if event_type == 'heartbeat_timeout':
                    participant.lock_reason = (
                        "Heartbeat timeout: no client signal received for 60 seconds; "
                        "pre-check is required to continue"
                    )
                elif event_type == 'listener_tampered':
                    participant.lock_reason = (
                        "Listener tampered: anti-cheat integrity check failed; "
                        "pre-check is required to continue"
                    )
                elif event_type == 'exit_fullscreen':
                    participant.lock_reason = "Fullscreen recovery timed out; pre-check is required to continue"
                elif requires_recheck_pause:
                    participant.lock_reason = f"Monitoring recovery required: {event_type}"
                else:
                    participant.lock_reason = f"System lock: {event_type}"
                participant.save(update_fields=update_fields)
                log_contest_activity(
                    contest=contest,
                    user=participant.user,
                    action_type='lock_user' if event_type in IMMEDIATE_LOCK_EVENT_TYPES else 'update_participant',
                    details=(
                        f"Auto-locked due to {event_type}"
                        if event_type in IMMEDIATE_LOCK_EVENT_TYPES
                        else f"Paused for monitoring re-check due to {event_type}"
                    ),
                )
                return participant

            participant.save(update_fields=update_fields)
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
def check_force_submit_locked():
    """
    Periodic task: Force-submit participants locked for more than 3 minutes.

    Runs every 30 seconds via Celery Beat.
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
    Periodic task: Pause students who haven't sent a heartbeat in 60 seconds.

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

    return f"Checked heartbeat timeouts: {count} paused"


def _lock_for_heartbeat_timeout(participant: ContestParticipant):
    """Create heartbeat_timeout event and pause for pre-check.

    Uses cache.add() (Redis SETNX) as an idempotency guard so concurrent
    Celery workers don't double-fire on the same participant.
    """
    lock_key = f"hb_lock:{participant.pk}"
    if not cache.add(lock_key, 1, timeout=90):
        return  # Another worker is already processing this participant
    event = ExamEvent.objects.create(
        contest=participant.contest,
        user=participant.user,
        event_type='heartbeat_timeout',
        metadata={'source': 'celery_heartbeat_check'},
    )
    attach_evidence_window_metadata(event)
    _apply_penalty_from_event(participant, 'heartbeat_timeout')
