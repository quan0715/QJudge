"""
Unit tests for Submission API and Models
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.problems.models import Problem, ProblemTranslation, TestCase as ProblemTestCase
from apps.submissions.models import Submission, SubmissionResult

User = get_user_model()


class SubmissionAPITestCase(TestCase):
    """Test cases for Submission API"""
    
    def setUp(self):
        """Set up test data"""
        # Create users
        self.student = User.objects.create_user(
            username='test_student',
            email='student@test.com',
            password='testpass123',
            role='student'
        )
        
        self.teacher = User.objects.create_user(
            username='test_teacher',
            email='teacher@test.com',
            password='testpass123',
            role='teacher'
        )
        
        # Create a test problem
        self.problem = Problem.objects.create(
            title='Test A+B',
            slug='test-a-plus-b',
            difficulty='easy',
            time_limit=1000,
            memory_limit=128,
            is_visible=True,
            created_by=self.teacher
        )
        
        # Create test cases
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='1 2',
            output_data='3',
            is_sample=True,
            score=50,
            order=1
        )
        
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='5 7',
            output_data='12',
            is_sample=False,
            score=50,
            order=2
        )
        
        self.client = APIClient()
    
    def test_create_submission_authenticated(self):
        """Test creating a submission as authenticated user"""
        self.client.force_authenticate(user=self.student)
        
        code = '''#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}'''
        
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'language': 'cpp',
            'code': code,
            'is_test': False
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['problem'], self.problem.id)
        self.assertEqual(response.data['language'], 'cpp')
        
        # Verify submission was created
        submission = Submission.objects.get(id=response.data['id'])
        self.assertEqual(submission.user, self.student)
        self.assertEqual(submission.problem, self.problem)
        self.assertEqual(submission.code, code)
    
    def test_create_submission_unauthenticated(self):
        """Test that unauthenticated users cannot submit"""
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'language': 'cpp',
            'code': 'test code',
        })
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_list_own_submissions(self):
        """Test that students can only see their own submissions"""
        # Create submission for student
        submission1 = Submission.objects.create(
            user=self.student,
            problem=self.problem,
            language='cpp',
            code='test code 1',
            status='AC'
        )
        
        # Create submission for teacher (should not be visible to student)
        submission2 = Submission.objects.create(
            user=self.teacher,
            problem=self.problem,
            language='cpp',
            code='test code 2',
            status='WA'
        )
        
        # Student login
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/v1/submissions/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], submission1.id)
    
    def test_teacher_can_see_all_submissions(self):
        """Test that teachers can see all submissions"""
        # Create submissions
        Submission.objects.create(
            user=self.student,
            problem=self.problem,
            language='cpp',
            code='test code 1',
            status='AC'
        )
        
        Submission.objects.create(
            user=self.teacher,
            problem=self.problem,
            language='cpp',
            code='test code 2',
            status='WA'
        )
        
        # Teacher login
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get('/api/v1/submissions/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 2)
    
    def test_filter_submissions_by_problem(self):
        """Test filtering submissions by problem"""
        # Create another problem
        problem2 = Problem.objects.create(
            title='Test Problem 2',
            slug='test-problem-2',
            difficulty='medium',
            created_by=self.teacher
        )
        
        # Create submissions for different problems
        sub1 = Submission.objects.create(
            user=self.student,
            problem=self.problem,
            language='cpp',
            code='code 1'
        )
        
        sub2 = Submission.objects.create(
            user=self.student,
            problem=problem2,
            language='cpp',
            code='code 2'
        )
        
        self.client.force_authenticate(user=self.student)
        
        # Filter by first problem
        response = self.client.get(f'/api/submissions/?problem={self.problem.id}')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], sub1.id)
        
        # Filter by second problem
        response = self.client.get(f'/api/submissions/?problem={problem2.id}')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], sub2.id)
    
    def test_filter_submissions_by_status(self):
        """Test filtering submissions by status"""
        Submission.objects.create(
            user=self.student,
            problem=self.problem,
            language='cpp',
            code='ac code',
            status='AC'
        )
        
        Submission.objects.create(
            user=self.student,
            problem=self.problem,
            language='cpp',
            code='wa code',
            status='WA'
        )
        
        self.client.force_authenticate(user=self.student)
        
        # Filter by AC status
        response = self.client.get('/api/submissions/?status=AC')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'AC')
        
        # Filter by WA status
        response = self.client.get('/api/submissions/?status=WA')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'WA')


class SubmissionModelTestCase(TestCase):
    """Test cases for Submission model"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='test_user',
            email='user@test.com',
            password='testpass123'
        )
        
        self.problem = Problem.objects.create(
            title='Test Problem',
            slug='test-problem',
            difficulty='easy',
            time_limit=1000,
            memory_limit=128
        )
    
    def test_create_submission(self):
        """Test creating a submission"""
        submission = Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language='cpp',
            code='test code',
            status='pending'
        )
        
        self.assertEqual(submission.user, self.user)
        self.assertEqual(submission.problem, self.problem)
        self.assertEqual(submission.language, 'cpp')
        self.assertEqual(submission.status, 'pending')
        self.assertEqual(submission.score, 0)
    
    def test_submission_str_representation(self):
        """Test string representation of submission"""
        submission = Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language='cpp',
            code='test code'
        )
        
        expected = f"Submission {submission.id} by {self.user.username} for {self.problem.title}"
        self.assertEqual(str(submission), expected)
