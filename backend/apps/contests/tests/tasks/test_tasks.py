"""
Unit tests for contest scheduled tasks (auto-submit, auto-unlock).
"""
from django.test import TestCase, override_settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from datetime import timedelta
from apps.contests.models import Contest, ContestParticipant, ExamStatus

User = get_user_model()


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class AutoSubmitTaskTests(TestCase):
    """Tests for auto-submit functionality when contest ends."""
    
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin', email='admin@test.com', password='password', role='admin'
        )
        self.student = User.objects.create_user(
            username='student', email='student@test.com', password='password'
        )
        
    def test_auto_submit_when_contest_ends(self):
        """When contest ends, IN_PROGRESS participants should be auto-submitted."""
        from apps.contests.tasks import check_contest_end
        
        contest = Contest.objects.create(
            name='Ended Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(minutes=5),  # Ended 5 mins ago
            status='published', exam_mode_enabled=True
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now() - timedelta(hours=1)
        )
        
        check_contest_end()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.SUBMITTED)
        self.assertIsNotNone(participant.left_at)
        
    def test_no_submit_when_contest_not_ended(self):
        """When contest not ended, participants should NOT be auto-submitted."""
        from apps.contests.tasks import check_contest_end
        
        contest = Contest.objects.create(
            name='Active Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=1),  # Still running
            status='published', exam_mode_enabled=True
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now() - timedelta(minutes=30)
        )
        
        check_contest_end()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.IN_PROGRESS)  # Unchanged
        
    def test_skip_already_submitted(self):
        """Already submitted participants should not be affected."""
        from apps.contests.tasks import check_contest_end
        
        contest = Contest.objects.create(
            name='Ended Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(minutes=5),
            status='published', exam_mode_enabled=True
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.SUBMITTED,
            left_at=timezone.now() - timedelta(minutes=10)
        )
        original_left_at = participant.left_at
        
        check_contest_end()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.SUBMITTED)
        self.assertEqual(participant.left_at, original_left_at)  # Not changed
        
    def test_submit_paused_participants(self):
        """PAUSED participants should also be submitted when contest ends."""
        from apps.contests.tasks import check_contest_end
        
        contest = Contest.objects.create(
            name='Ended Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(minutes=5),
            status='published', exam_mode_enabled=True
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.PAUSED
        )
        
        check_contest_end()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.SUBMITTED)
        
    def test_submit_locked_participants(self):
        """LOCKED participants should also be submitted when contest ends."""
        from apps.contests.tasks import check_contest_end
        
        contest = Contest.objects.create(
            name='Ended Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(minutes=5),
            status='published', exam_mode_enabled=True
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.LOCKED,
            locked_at=timezone.now() - timedelta(minutes=30)
        )
        
        check_contest_end()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.SUBMITTED)
        
    def test_skip_non_exam_mode_contests(self):
        """Non-exam-mode contests should be skipped."""
        from apps.contests.tasks import check_contest_end
        
        contest = Contest.objects.create(
            name='Normal Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(minutes=5),
            status='published', exam_mode_enabled=False  # Not exam mode
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.IN_PROGRESS
        )
        
        check_contest_end()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.IN_PROGRESS)  # Unchanged


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class AutoUnlockTaskTests(TestCase):
    """Tests for auto-unlock functionality."""
    
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin', email='admin@test.com', password='password', role='admin'
        )
        self.student = User.objects.create_user(
            username='student', email='student@test.com', password='password'
        )
        
    def test_auto_unlock_after_timeout(self):
        """Locked participant should be unlocked after timeout."""
        from apps.contests.tasks import check_auto_unlock
        
        contest = Contest.objects.create(
            name='Active Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=1),  # Still active
            status='published', exam_mode_enabled=True,
            allow_auto_unlock=True, auto_unlock_minutes=10
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.LOCKED,
            locked_at=timezone.now() - timedelta(minutes=15),  # Locked 15 mins ago
            violation_count=3, lock_reason='Test lock'
        )
        
        check_auto_unlock()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.PAUSED)
        self.assertIsNone(participant.locked_at)
        self.assertEqual(participant.violation_count, 0)
        self.assertEqual(participant.lock_reason, '')
        
    def test_no_unlock_before_timeout(self):
        """Locked participant should NOT be unlocked before timeout."""
        from apps.contests.tasks import check_auto_unlock
        
        contest = Contest.objects.create(
            name='Active Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=1),
            status='published', exam_mode_enabled=True,
            allow_auto_unlock=True, auto_unlock_minutes=10
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.LOCKED,
            locked_at=timezone.now() - timedelta(minutes=5),  # Only 5 mins ago
            violation_count=3
        )
        
        check_auto_unlock()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.LOCKED)  # Still locked
        
    def test_no_unlock_when_contest_ended(self):
        """Should NOT unlock when contest has ended."""
        from apps.contests.tasks import check_auto_unlock
        
        contest = Contest.objects.create(
            name='Ended Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(minutes=5),  # Ended
            status='published', exam_mode_enabled=True,
            allow_auto_unlock=True, auto_unlock_minutes=10
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.LOCKED,
            locked_at=timezone.now() - timedelta(minutes=15)
        )
        
        check_auto_unlock()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.LOCKED)  # Still locked
        
    def test_no_unlock_when_disabled(self):
        """Should NOT unlock when auto_unlock is disabled."""
        from apps.contests.tasks import check_auto_unlock
        
        contest = Contest.objects.create(
            name='Active Contest', owner=self.admin,
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=1),
            status='published', exam_mode_enabled=True,
            allow_auto_unlock=False  # Disabled
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=self.student,
            exam_status=ExamStatus.LOCKED,
            locked_at=timezone.now() - timedelta(minutes=15)
        )
        
        check_auto_unlock()
        
        participant.refresh_from_db()
        self.assertEqual(participant.exam_status, ExamStatus.LOCKED)  # Still locked
