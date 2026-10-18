from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.tests import bind_problem_to_contest
from apps.problems.models import CodingProblem, TestCase as ProblemTestCase
from apps.submissions.models import Submission

User = get_user_model()


def create_contest(owner, problem, *participants):
    contest = Contest.objects.create(
        name='Submission API Contest', owner=owner, status='published',
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
        scoreboard_visible_during_contest=False,
    )
    bind_problem_to_contest(contest, problem)
    for user in participants:
        ContestParticipant.objects.create(contest=contest, user=user, exam_status=ExamStatus.IN_PROGRESS)
    return contest


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
        self.problem = CodingProblem.objects.create(
            slug='test-a-plus-b',
            time_limit=1000,
            memory_limit=128,
            created_by=self.teacher
        )
        
        # Create test cases
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='1 2',
            output_data='3',
            is_sample=True,
            order=1,
            weight_percent=50,
        )
        
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='5 7',
            output_data='12',
            is_sample=False,
            order=2,
            weight_percent=50,
        )
        self.contest = create_contest(self.teacher, self.problem, self.student)
        
        self.client = APIClient()
    
    def test_create_submission_authenticated(self):
        """Test creating a submission as authenticated user"""
        self.client.force_authenticate(user=self.teacher)
        
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
                'contest': self.contest.id,
                'language': 'cpp',
                'code': code,
            })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['problem'], self.problem.id)
        self.assertEqual(response.data['language'], 'cpp')
        
        # Verify submission was created
        submission = Submission.objects.get(id=response.data['id'])
        self.assertEqual(submission.user, self.teacher)
        self.assertEqual(submission.problem, self.problem)
        self.assertEqual(submission.code, code)
    
    def test_create_submission_unauthenticated(self):
        """Test that unauthenticated users cannot submit"""
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'contest': self.contest.id,
            'language': 'cpp',
            'code': 'test code',
        })
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_list_own_submissions(self):
        """Students only see their own submissions while the scoreboard is hidden."""
        # Create submission for student
        submission1 = Submission.objects.create(
            user=self.student,
            problem=self.problem,
            contest=self.contest,
            language='cpp',
            code='test code 1',
            status='AC'
        )
        
        # Create submission for teacher (hidden from the student)
        submission2 = Submission.objects.create(
            user=self.teacher,
            problem=self.problem,
            contest=self.contest,
            language='cpp',
            code='test code 2',
            status='WA'
        )
        
        # Student login
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/v1/submissions/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Contest submissions are limited to the viewer's own submissions
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], submission1.id)
    
    def test_teacher_can_see_all_submissions(self):
        """Test that teachers can see all submissions"""
        # Create submissions
        Submission.objects.create(
            user=self.student,
            problem=self.problem,
            contest=self.contest,
            language='cpp',
            code='test code 1',
            status='AC'
        )
        
        Submission.objects.create(
            user=self.teacher,
            problem=self.problem,
            contest=self.contest,
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
        problem2 = CodingProblem.objects.create(
            slug='test-problem-2',
            created_by=self.teacher
        )
        
        # Create submissions for different problems
        sub1 = Submission.objects.create(
            user=self.student,
            problem=self.problem,
            contest=self.contest,
            language='cpp',
            code='code 1'
        )
        
        sub2 = Submission.objects.create(
            user=self.student,
            problem=problem2,
            contest=self.contest,
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
            contest=self.contest,
            language='cpp',
            code='ac code',
            status='AC'
        )
        
        Submission.objects.create(
            user=self.student,
            problem=self.problem,
            contest=self.contest,
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
        self.get_judge_patcher = patch('apps.submissions.tasks.get_judge')
        self.mock_get_judge = self.get_judge_patcher.start()
        
        # Setup default mock judge behavior (AC)
        self.mock_judge = MagicMock()
        self.mock_get_judge.return_value = self.mock_judge
        self.verdict = {
            'status': 'AC',
            'time': 10,
            'memory': 1024,
            'output': '3',
            'error': ''
        }
        self.mock_judge.run.side_effect = lambda **kwargs: [self.verdict for _ in kwargs['cases']]

        self.user = User.objects.create_user(
            username='exec_user',
            email='exec@test.com',
            password='testpass123',
            role='teacher'
        )
        
        self.problem = CodingProblem.objects.create(
            slug='a-plus-b',
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
            order=1,
            weight_percent=100,
        )
        self.contest = create_contest(self.user, self.problem)
        
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
            'contest': self.contest.id,
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
        self.verdict = {
            'status': 'CE',
            'time': 0,
            'memory': 0,
            'output': '',
            'error': 'Redeclaration error'
        }
        
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'contest': self.contest.id,
            'language': 'cpp',
            'code': code
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        submission_id = response.data['id']
        
        submission = Submission.objects.get(id=submission_id)
        self.assertEqual(submission.status, 'CE')
        self.assertIn('error', submission.error_message.lower())

    def test_submission_is_judging_while_cases_run(self):
        statuses = []

        def run(**kwargs):
            for _ in kwargs['cases']:
                statuses.append(Submission.objects.values_list('status', flat=True).get())
                yield self.verdict

        self.mock_judge.run.side_effect = run
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'contest': self.contest.id,
            'language': 'cpp',
            'code': 'int main(){}',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(statuses, ['judging'])
        self.assertEqual(Submission.objects.get(id=response.data['id']).status, 'AC')

    def test_submission_python_ac(self):
        """Test Python submission that should be Accepted (AC)"""
        code = '''
import sys
a, b = map(int, sys.stdin.read().split())
print(a + b)
'''
        
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'contest': self.contest.id,
            'language': 'python',
            'code': code
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        submission_id = response.data['id']
        
        submission = Submission.objects.get(id=submission_id)
        self.assertEqual(submission.status, 'AC')
        self.assertEqual(submission.score, 100)
