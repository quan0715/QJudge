from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Problem

User = get_user_model()

class ProblemPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create users
        self.admin = User.objects.create_user(username='admin', email='admin@example.com', password='password', role='admin', is_staff=True)
        self.teacher1 = User.objects.create_user(username='teacher1', email='teacher1@example.com', password='password', role='teacher')
        self.teacher2 = User.objects.create_user(username='teacher2', email='teacher2@example.com', password='password', role='teacher')
        self.student = User.objects.create_user(username='student', email='student@example.com', password='password', role='student')
        
        # Create problems
        self.problem1 = Problem.objects.create(
            title='Problem 1',
            slug='p1',
            created_by=self.teacher1,
            difficulty='easy'
        )
        self.problem2 = Problem.objects.create(
            title='Problem 2',
            slug='p2',
            created_by=self.teacher2,
            difficulty='medium'
        )

    def test_teacher_can_create_problem(self):
        self.client.force_authenticate(user=self.teacher1)
        data = {
            'title': 'New Problem',
            'slug': 'new-prob',
            'difficulty': 'easy',
            'time_limit': 1000,
            'memory_limit': 128
        }
        response = self.client.post('/api/v1/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Problem.objects.get(slug='new-prob').created_by, self.teacher1)

    def test_teacher_can_edit_own_problem(self):
        self.client.force_authenticate(user=self.teacher1)
        data = {'title': 'Updated Title'}
        response = self.client.patch(f'/api/v1/problems/{self.problem1.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.problem1.refresh_from_db()
        self.assertEqual(self.problem1.title, 'Updated Title')

    def test_teacher_cannot_edit_other_problem(self):
        self.client.force_authenticate(user=self.teacher1)
        data = {'title': 'Hacked Title'}
        response = self.client.patch(f'/api/v1/problems/{self.problem2.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.problem2.refresh_from_db()
        self.assertNotEqual(self.problem2.title, 'Hacked Title')

    def test_admin_can_edit_any_problem(self):
        self.client.force_authenticate(user=self.admin)
        data = {'title': 'Admin Edit'}
        response = self.client.patch(f'/api/v1/problems/{self.problem1.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.problem1.refresh_from_db()
        self.assertEqual(self.problem1.title, 'Admin Edit')

    def test_student_cannot_create_problem(self):
        self.client.force_authenticate(user=self.student)
        data = {
            'title': 'Student Problem',
            'slug': 'student-prob',
            'difficulty': 'easy'
        }
        response = self.client.post('/api/v1/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_scope_manage_filtering(self):
        """Test that teacher only sees their own problems with scope=manage"""
        self.client.force_authenticate(user=self.teacher1)
        response = self.client.get('/api/v1/problems/?scope=manage')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        # Should see problem1 (own) but not problem2 (teacher2's)
        self.assertTrue(any(p['id'] == self.problem1.id for p in results))
        self.assertFalse(any(p['id'] == self.problem2.id for p in results))

    def test_admin_scope_manage_filtering(self):
        """Test that admin sees all problems with scope=manage"""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/v1/problems/?scope=manage')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        # Should see both
        self.assertTrue(any(p['id'] == self.problem1.id for p in results))
        self.assertTrue(any(p['id'] == self.problem2.id for p in results))
