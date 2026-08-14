from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.contests.models import Contest

User = get_user_model()


class ContestRulesTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='password123',
            role='student'
        )
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='password123',
            role='admin',
            is_staff=True
        )
        
        # Create contest with rules
        self.contest = Contest.objects.create(
            name='Rules Contest',
            description='This is a description',
            rules='These are the rules',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            status='published'
        )
        self.classroom = Classroom.objects.create(
            name='Rules Classroom',
            owner=self.admin,
            invite_code='RULES001',
        )
        ClassroomMember.objects.create(
            classroom=self.classroom,
            user=self.user,
            role='student',
        )
        ClassroomContest.objects.create(
            classroom=self.classroom,
            contest=self.contest,
        )
        
        self.client.force_authenticate(user=self.user)

    def test_get_contest_rules(self):
        url = f'/api/v1/contests/{self.contest.id}/'
        
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        
        # Verify description
        self.assertEqual(data['description'], 'This is a description')
        
        # Verify rules
        self.assertIn('rules', data)
        self.assertEqual(data['rules'], 'These are the rules')
        
        # Verify rule (alias)
        self.assertIn('rule', data)
        self.assertEqual(data['rule'], 'These are the rules')
