
import unittest
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
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
        
        with override_settings(CELERY_TASK_ALWAYS_EAGER=True):
            response = self.client.post('/api/v1/submissions/', {
                'problem': self.problem.id,
                'language': 'cpp',
                'code': code,
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
        """Students only see their own practice submissions."""
        # Create submission for student
        submission1 = Submission.objects.create(
            user=self.student,
            problem=self.problem,
            language='cpp',
            code='test code 1',
            status='AC'
        )
        
        # Create submission for teacher (should also be visible to student in practice mode)
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
        # Practice submissions are limited to the viewer's own submissions
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
        response = self.client.get(f'/api/v1/submissions/?problem={self.problem.id}')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], sub1.id)
        
        # Filter by second problem
        response = self.client.get(f'/api/v1/submissions/?problem={problem2.id}')
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
        response = self.client.get('/api/v1/submissions/?status=AC')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'AC')
        
        # Filter by WA status
        response = self.client.get('/api/v1/submissions/?status=WA')
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


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class SubmissionExecutionTestCase(TestCase):
    """
    Integration tests for Submission Execution Flow.
    Verifies that submissions are correctly judged and status is updated.
    """
    
    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def setUp(self):
        # Patch transaction.on_commit to run immediately
        self.on_commit_patcher = patch('django.db.transaction.on_commit', side_effect=lambda func: func())
        self.on_commit_patcher.start()

        # Patch get_judge to avoid Docker execution
        self.get_judge_patcher = patch('apps.judge.judge_factory.get_judge')
        self.mock_get_judge = self.get_judge_patcher.start()
        
        # Setup default mock judge behavior (AC)
        self.mock_judge = MagicMock()
        self.mock_get_judge.return_value = self.mock_judge
        self.mock_judge.execute.return_value = {
            'status': 'AC',
            'time': 10,
            'memory': 1024,
            'output': '3',
            'error': ''
        }

        self.user = User.objects.create_user(
            username='exec_user',
            email='exec@test.com',
            password='testpass123'
        )
        
        self.problem = Problem.objects.create(
            title='A+B Problem',
            slug='a-plus-b',
            difficulty='easy',
            time_limit=1000,
            memory_limit=128,
            created_by=self.user
        )
        
        # Test Case: 1 + 2 = 3
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='1 2',
            output_data='3',
            is_sample=True,
            score=100,
            order=1
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        self.on_commit_patcher.stop()
        self.get_judge_patcher.stop()
    
    def test_submission_cpp_ac(self):
        """Test C++ submission that should be Accepted (AC)"""
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
            'code': code
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        submission_id = response.data['id']
        
        # Reload submission from DB
        submission = Submission.objects.get(id=submission_id)
        
        # Since CELERY_TASK_ALWAYS_EAGER = True in test settings, 
        # the task should have completed synchronously.
        self.assertEqual(submission.status, 'AC')
        self.assertEqual(submission.score, 100)

    def test_submission_cpp_ce(self):
        """Test C++ submission with syntax error (CE)"""
        code = '''#include <iostream>
using namespace std;
int main() {
    int index;
    cin >> index;
    int index; // Redeclaration error
    return 0;
}'''
        
        # Override mock to simulate CE
        self.mock_judge.execute.return_value = {
            'status': 'CE',
            'time': 0,
            'memory': 0,
            'output': '',
            'error': 'Redeclaration error'
        }
        
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'language': 'cpp',
            'code': code
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        submission_id = response.data['id']
        
        submission = Submission.objects.get(id=submission_id)
        self.assertEqual(submission.status, 'CE')
        self.assertIn('error', submission.error_message.lower())

    def test_submission_rejects_test_only_fields(self):
        """Submit API should reject is_test/custom_test_cases payload."""
        self.client.force_authenticate(user=self.user)
        with override_settings(CELERY_TASK_ALWAYS_EAGER=True):
            response = self.client.post('/api/v1/submissions/', {
                'problem': self.problem.id,
                'language': 'python',
                'code': 'print(42)',
                'is_test': True,
                'custom_test_cases': [{'input': '1 2'}],
            }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_submission_python_ac(self):
        """Test Python submission that should be Accepted (AC)"""
        code = '''
import sys
a, b = map(int, sys.stdin.read().split())
print(a + b)
'''
        
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'language': 'python',
            'code': code
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        submission_id = response.data['id']
        
        submission = Submission.objects.get(id=submission_id)
        self.assertEqual(submission.status, 'AC')
        self.assertEqual(submission.score, 100)
