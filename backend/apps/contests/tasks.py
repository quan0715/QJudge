"""
Celery tasks for contest scheduled operations.
Auto-submit participants when contest ends, auto-unlock locked participants.
"""
from celery import shared_task
from django.utils import timezone
from .models import Contest, ContestParticipant, ExamStatus


@shared_task
def check_contest_end():
    """
    Periodic task: Check for contests that have ended and auto-submit participants.
    
    Runs every minute via Celery Beat. Finds all active exam-mode contests
    that have passed their end_time and triggers auto-submit for each.
    """
    now = timezone.now()
    
    ended_contests = Contest.objects.filter(
        end_time__lte=now,
        status='active',
        exam_mode_enabled=True
    )
    
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
        if contest.end_time > timezone.now():
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
            left_at=timezone.now()
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
            participant.save()
            return f"Unlocked participant {participant_id}"
            
        return f"Participant {participant_id} not locked"
        
    except ContestParticipant.DoesNotExist:
        return f"Participant {participant_id} not found"
