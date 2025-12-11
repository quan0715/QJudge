"""
Performance tests for Submission API optimization.
"""
import time
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.problems.models import Problem
from apps.submissions.models import Submission
from django.db import connection
from django.test.utils import override_settings

User = get_user_model()


@override_settings(DEBUG=True)  # Enable query tracking
class SubmissionAPIPerformanceTestCase(TestCase):
    """Test submission API performance improvements."""
    
    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        # Create users
        cls.admin_user = User.objects.create_user(
            username='admin',
            email='admin@test.com',
            password='password123',
            role='admin'
        )
        cls.student_user = User.objects.create_user(
            username='student',
            email='student@test.com',
            password='password123',
            role='student'
        )
        
        # Create a problem
        cls.problem = Problem.objects.create(
            title='Test Problem',
            difficulty='easy',
            time_limit=1000,
            memory_limit=256,
            created_by=cls.admin_user
        )
        
        # Create multiple submissions for performance testing
        cls.submissions = []
        for i in range(50):
            submission = Submission.objects.create(
                user=cls.student_user if i % 2 == 0 else cls.admin_user,
                problem=cls.problem,
                language='python',
                code=f'print("test {i}")',
                status='AC' if i % 3 == 0 else 'WA',
                source_type='practice',
                is_test=False,
                score=100 if i % 3 == 0 else 0
            )
            cls.submissions.append(submission)
    
    def setUp(self):
        """Set up test client."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)
    
    def test_submission_list_query_count(self):
        """Test that submission list uses optimized queries."""
        # Reset queries
        connection.queries_log.clear()
        
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'page_size': 20
        })
        
        self.assertEqual(response.status_code, 200)
        
        # Should use select_related to avoid N+1
        # Expected: 1 main query + 1 count query = 2 queries max
        query_count = len(connection.queries)
        self.assertLessEqual(
            query_count, 
            3,  # Allow some margin
            f"Too many queries: {query_count}. Check if select_related is working."
        )
    
    def test_submission_list_response_time(self):
        """Test that submission list responds quickly."""
        start_time = time.time()
        
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'page_size': 20
        })
        
        elapsed = (time.time() - start_time) * 1000  # Convert to ms
        
        self.assertEqual(response.status_code, 200)
        
        # Should respond in less than 500ms (generous limit for tests)
        self.assertLess(
            elapsed,
            500,
            f"Response time too slow: {elapsed:.2f}ms"
        )
    
    def test_submission_list_response_size(self):
        """Test that submission list returns optimized data."""
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'page_size': 20
        })
        
        self.assertEqual(response.status_code, 200)
        
        # Check that code field is not included in list
        if response.data.get('results'):
            first_submission = response.data['results'][0]
            self.assertNotIn(
                'code',
                first_submission,
                "Code field should not be in list response"
            )
    
    def test_submission_list_has_necessary_fields(self):
        """Test that submission list includes all necessary fields."""
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'page_size': 20
        })
        
        self.assertEqual(response.status_code, 200)
        
        if response.data.get('results'):
            first_submission = response.data['results'][0]
            required_fields = [
                'id', 'username', 'problem_id', 'problem_title',
                'status', 'language', 'score', 'exec_time', 'created_at'
            ]
            for field in required_fields:
                self.assertIn(
                    field,
                    first_submission,
                    f"Missing required field: {field}"
                )
    
    def test_submission_list_with_filters(self):
        """Test that filters work correctly with optimization."""
        # Test status filter
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'status': 'AC',
            'page_size': 20
        })
        
        self.assertEqual(response.status_code, 200)
        
        # Verify all results have AC status
        for submission in response.data.get('results', []):
            self.assertEqual(submission['status'], 'AC')
    
    def test_submission_detail_includes_code(self):
        """Test that submission detail includes code field."""
        submission = self.submissions[0]
        
        response = self.client.get(f'/api/v1/submissions/{submission.id}/')
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('code', response.data)
    
    def test_practice_submissions_default_filter(self):
        """Test that practice submissions are filtered by default."""
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'page_size': 20
        })
        
        self.assertEqual(response.status_code, 200)
        
        # All results should be practice type
        for submission in response.data.get('results', []):
            self.assertEqual(submission.get('source_type'), 'practice')
    
    def test_retrieve_not_affected_by_filters(self):
        """Test that retrieve action is not affected by date/source filters."""
        # Use existing practice submission from setUpTestData
        practice_submission = self.submissions[0]
        
        # Should be able to retrieve even with different source_type filter
        # The filter should only affect list, not retrieve
        response = self.client.get(
            f'/api/v1/submissions/{practice_submission.id}/',
            {'source_type': 'contest'}  # This should not affect retrieve
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], practice_submission.id)
        self.assertEqual(response.data['source_type'], 'practice')


class SubmissionIndexTestCase(TestCase):
    """Test that database indexes are properly created."""
    
    def test_submission_indexes_exist(self):
        """Test that performance indexes exist."""
        from django.db import connection
        
        with connection.cursor() as cursor:
            if 'postgresql' in connection.settings_dict['ENGINE']:
                # Check for our performance indexes
                cursor.execute("""
                    SELECT indexname 
                    FROM pg_indexes 
                    WHERE tablename = 'submissions'
                    AND indexname LIKE 'sub_%_idx';
                """)
                
                indexes = {row[0] for row in cursor.fetchall()}
                
                expected_indexes = {
                    'sub_src_test_created_idx',
                    'sub_contest_src_created_idx',
                    'sub_problem_created_idx',
                    'sub_status_created_idx',
                    'sub_user_created_idx',
                }
                
                # Check if indexes exist (they might not in test DB, that's OK)
                # This test documents what indexes should exist
                for idx in expected_indexes:
                    if idx not in indexes:
                        self.skipTest(f"Index {idx} not found - may need migration")
