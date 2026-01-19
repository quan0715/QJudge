from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from apps.contests.models import Contest, ContestParticipant, ExamStatus

User = get_user_model()

class ExamStateTests(APITestCase):
    def setUp(self):
        # Create user and admin
        self.user = User.objects.create_user(username='student', email='student@example.com', password='password')
        self.admin = User.objects.create_user(username='admin', email='admin@example.com', password='password', is_staff=True, role='admin')
        
        # Create contest
        self.contest = Contest.objects.create(
            name='Test Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='public',
            status='published',
            exam_mode_enabled=True,
            allow_auto_unlock=True,
            auto_unlock_minutes=10
        )
        
        # Register user
        ContestParticipant.objects.create(contest=self.contest, user=self.user)
        self.client.force_authenticate(user=self.user)
        
    def test_start_exam(self):
        url = reverse('contests:contest-exam-start-exam', args=[self.contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        p = ContestParticipant.objects.get(user=self.user, contest=self.contest)
        self.assertEqual(p.exam_status, ExamStatus.IN_PROGRESS)
        
    def test_end_exam(self):
        # Start first
        p = ContestParticipant.objects.get(user=self.user, contest=self.contest)
        p.exam_status = ExamStatus.IN_PROGRESS
        p.started_at = timezone.now()
        p.save()
        
        url = reverse('contests:contest-exam-end-exam', args=[self.contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        p.refresh_from_db()
        self.assertEqual(p.exam_status, ExamStatus.SUBMITTED)

    def test_unlock_participant(self):
        # Lock user
        p = ContestParticipant.objects.get(user=self.user, contest=self.contest)
        p.exam_status = ExamStatus.LOCKED
        p.save()
        
        # Admin unlocks
        self.client.force_authenticate(user=self.admin)
        url = reverse('contests:contest-unlock-participant', args=[self.contest.id])
        # Note: unlock_participant expects user_id in body
        response = self.client.post(url, {'user_id': self.user.id})
        
        if response.status_code != status.HTTP_200_OK:
             print(response.data)
             
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        p.refresh_from_db()
        self.assertFalse(p.exam_status == ExamStatus.LOCKED)
        self.assertTrue(p.exam_status == ExamStatus.PAUSED)
        self.assertEqual(p.exam_status, ExamStatus.PAUSED)
        
    def test_resume_exam(self):
        # Pause user
        p = ContestParticipant.objects.get(user=self.user, contest=self.contest)
        p.exam_status = ExamStatus.PAUSED
        p.save()
        
        # Resume (call start_exam)
        url = reverse('contests:contest-exam-start-exam', args=[self.contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        p.refresh_from_db()
        self.assertFalse(p.exam_status == ExamStatus.PAUSED)
        self.assertEqual(p.exam_status, ExamStatus.IN_PROGRESS)
        
    def test_reopen_exam(self):
        # Submit exam
        p = ContestParticipant.objects.get(user=self.user, contest=self.contest)
        p.exam_status = ExamStatus.SUBMITTED
        p.save()
        
        # Admin reopens
        self.client.force_authenticate(user=self.admin)
        url = reverse('contests:contest-reopen-exam', args=[self.contest.id])
        response = self.client.post(url, {'user_id': self.user.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        p.refresh_from_db()
        self.assertFalse(p.exam_status == ExamStatus.SUBMITTED)
        self.assertTrue(p.exam_status == ExamStatus.PAUSED)
        self.assertEqual(p.exam_status, ExamStatus.PAUSED)

    def test_auto_unlock_retrieve(self):
        # Lock user with past timestamp
        p = ContestParticipant.objects.get(user=self.user, contest=self.contest)
        p.exam_status = ExamStatus.LOCKED
        p.locked_at = timezone.now() - timedelta(minutes=20) # 20 mins ago, auto unlock is 10 mins
        p.save()
        
        # User checks contest details (retrieve)
        self.client.force_authenticate(user=self.user)
        url = reverse('contests:contest-detail', args=[self.contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        p.refresh_from_db()
        self.assertFalse(p.exam_status == ExamStatus.LOCKED)
        self.assertTrue(p.exam_status == ExamStatus.PAUSED)
        self.assertEqual(p.exam_status, ExamStatus.PAUSED)
