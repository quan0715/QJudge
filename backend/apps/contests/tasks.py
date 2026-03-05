"""
Celery tasks for contest scheduled operations.
Auto-submit participants when contest ends, auto-unlock locked participants,
and check for heartbeat timeouts.
"""
from celery import shared_task
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from .models import Contest, ContestParticipant, ExamStatus, ExamEvent, ContestActivity

# Heartbeat timeout in seconds.
HEARTBEAT_TIMEOUT_SECONDS = 90  # 1.5 minutes
FORCE_SUBMIT_LOCKED_SECONDS = 180  # 3 minutes
PENALIZED_EVENT_TYPES = {
    'heartbeat_timeout',
    'tab_hidden',
    'window_blur',
    'exit_fullscreen',
    'multiple_displays',
    'mouse_leave',
    'warning_timeout',
    'forbidden_focus_event',
}


def _apply_penalty_from_event(participant: ContestParticipant, event_type: str):
    """
    Unified server-side anti-cheat escalation.
    - in_progress: threshold => lock
    - paused/locked: threshold => auto-submit
    """
    contest = participant.contest
    if event_type not in PENALIZED_EVENT_TYPES:
        return participant

    participant.violation_count += 1
    update_fields = ['violation_count']
    should_escalate = (
        event_type == 'warning_timeout'
        or participant.violation_count >= contest.max_cheat_warnings
    )

    if should_escalate:
        if participant.exam_status == ExamStatus.IN_PROGRESS:
            participant.exam_status = ExamStatus.LOCKED
            participant.locked_at = timezone.now()
            participant.lock_reason = (
                "Warning timeout: student did not acknowledge warning within 30 seconds"
                if event_type == 'warning_timeout'
                else f"System lock: {event_type}"
            )
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
            participant.exam_status = ExamStatus.SUBMITTED
            participant.left_at = timezone.now()
            participant.submit_reason = reason
            update_fields.extend(['exam_status', 'left_at', 'submit_reason'])
            participant.save(update_fields=update_fields)
            ContestActivity.objects.create(
                contest=contest,
                user=participant.user,
                action_type='auto_submit',
                details=reason,
            )
            return participant

    participant.save(update_fields=update_fields)
    return participant


@shared_task
def check_heartbeat_timeout():
    """
    Periodic task: Check for participants with stale heartbeats during active exams.
    
    Runs every 30 seconds via Celery Beat. Finds participants whose last heartbeat
    is older than HEARTBEAT_TIMEOUT_SECONDS and logs a warning event.
    This helps detect:
    - Students who closed their browser without proper logout
    - Network disconnections
    - Attempts to bypass monitoring
    """
    now = timezone.now()
    timeout_threshold = now - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)
    
    # Find monitored participants with stale heartbeats
    stale_participants = ContestParticipant.objects.filter(
        exam_status__in=[ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED],
        last_heartbeat__lt=timeout_threshold,
        contest__status='published',
        contest__cheat_detection_enabled=True,
        contest__end_time__gt=now  # Only active contests
    ).select_related('contest', 'user')
    
    count = 0
    for participant in stale_participants:
        # Avoid creating duplicate timeout events for the same stale heartbeat.
        already_logged = ExamEvent.objects.filter(
            contest=participant.contest,
            user=participant.user,
            event_type='forbidden_focus_event',
            metadata__source='heartbeat_timeout',
            created_at__gte=participant.last_heartbeat,
        ).exists()
        if already_logged:
            continue

        # Log heartbeat timeout event
        ExamEvent.objects.create(
            contest=participant.contest,
            user=participant.user,
            event_type='forbidden_focus_event',  # Use existing type
            metadata={
                'source': 'heartbeat_timeout',
                'last_heartbeat': participant.last_heartbeat.isoformat() if participant.last_heartbeat else None,
                'timeout_seconds': HEARTBEAT_TIMEOUT_SECONDS
            }
        )
        with transaction.atomic():
            refreshed = ContestParticipant.objects.select_for_update().select_related('contest', 'user').get(
                pk=participant.pk
            )
            _apply_penalty_from_event(refreshed, 'heartbeat_timeout')
        count += 1
    
    return f"Processed {count} heartbeat timeout events"


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
        
        count = ContestParticipant.objects.filter(
            contest_id=contest_id,
            exam_status__in=[
                ExamStatus.IN_PROGRESS,
                ExamStatus.PAUSED,
                ExamStatus.LOCKED
            ]
        ).update(
            exam_status=ExamStatus.SUBMITTED,
            left_at=timezone.now(),
            submit_reason='Auto-submitted: contest ended',
        )
        
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
            participant.violation_count = 0
            participant.lock_reason = ""
            participant.save(update_fields=['exam_status', 'locked_at', 'violation_count', 'lock_reason'])
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

        participant.exam_status = ExamStatus.SUBMITTED
        participant.left_at = timezone.now()
        participant.submit_reason = (
            f"Auto-submitted: locked for more than {FORCE_SUBMIT_LOCKED_SECONDS // 60} minutes"
        )
        participant.save(update_fields=['exam_status', 'left_at', 'submit_reason'])

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

        # Record ContestActivity
        ContestActivity.objects.create(
            contest=participant.contest,
            user=participant.user,
            action_type='auto_submit',
            details=f"Force-submitted after being locked for {FORCE_SUBMIT_LOCKED_SECONDS // 60} minutes",
        )

        return f"Force-submitted participant {participant_id}"

    except ContestParticipant.DoesNotExist:
        return f"Participant {participant_id} not found"
