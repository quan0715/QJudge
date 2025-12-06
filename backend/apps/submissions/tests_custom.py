
from django.test import TransactionTestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.problems.models import Problem
from apps.submissions.models import Submission

User = get_user_model()

@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class CustomTestCaseSubmissionTest(TransactionTestCase):
    """Test cases for submissions with custom test cases"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='test_user',
            email='user@test.com',
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
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
    def test_custom_test_cases_submission(self):
        """Test submitting with custom test cases"""
        code = '''
import sys
a, b = map(int, sys.stdin.read().split())
print(a + b)
'''
        custom_cases = [
            {'input': '1 2', 'output': '3'},
            {'input': '10 20', 'output': '30'}
        ]
        
        # Add a sample test case
        from apps.problems.models import TestCase as ProblemTestCase
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='3 4',
            output_data='7',
            is_sample=True,
            order=1
        )

        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'language': 'python',
            'code': code.strip(),
            'is_test': True,
            'custom_test_cases': custom_cases
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify submission has custom test cases stored
        submission = Submission.objects.get(id=response.data['id'])
        self.assertTrue(submission.is_test)
        self.assertEqual(len(submission.custom_test_cases), 2)
        
        # Verify results are generated for BOTH sample and custom cases
        submission.refresh_from_db()
        if submission.status == 'SE':
             print(f"Submission Error: {submission.error_message}")
        
        results = submission.results.all().order_by('id')
        # Expect 3 results: 1 sample + 2 custom
        self.assertEqual(results.count(), 3, f"Expected 3 results (1 sample + 2 custom), got {results.count()}. Status: {submission.status}, Error: {submission.error_message}")
        
        # Verify first result is sample (has test_case)
        # Note: Order might vary depending on execution, but typically sample (from DB) then custom
        # My implementation in tasks.py: test_cases = list(sample_cases) + custom_cases
        # So sample should be first.
        
        sample_result = results[0]
        self.assertIsNotNone(sample_result.test_case)
        self.assertEqual(sample_result.test_case.input_data, '3 4')
        self.assertEqual(sample_result.status, 'AC')

        # Verify custom results (test_case is None, input_data matches)
        custom_results = [r for r in results if r.test_case is None]
        self.assertEqual(len(custom_results), 2)
        
        # Check inputs of custom results
        inputs = sorted([r.input_data for r in custom_results])
        self.assertEqual(inputs, ['1 2', '10 20'])
        self.assertTrue(all(r.status == 'AC' for r in custom_results))

    def test_normal_submission(self):
        """Test normal submission uses DB test cases"""
        # Create a sample case
        from apps.problems.models import TestCase as ProblemTestCase
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='5 5',
            output_data='10',
            is_sample=False,
            order=1
        )
        
        code = '''
import sys
a, b = map(int, sys.stdin.read().split())
print(a + b)
'''
        response = self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'language': 'python',
            'code': code.strip(),
            'is_test': False  # Normal submission
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        submission = Submission.objects.get(id=response.data['id'])
        submission.refresh_from_db()
        
        # Should have 1 result (from the DB case we added)
        self.assertEqual(submission.results.count(), 1)
        self.assertEqual(submission.results.first().status, 'AC')
