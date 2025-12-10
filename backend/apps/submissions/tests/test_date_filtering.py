"""
Tests for date range filtering on submissions.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from apps.problems.models import Problem
from apps.submissions.models import Submission

User = get_user_model()


class DateRangeFilteringTestCase(TestCase):
    """Test date range filtering for submissions."""
    
    @classmethod
    def setUpTestData(cls):
        """Create test data with different dates."""
        cls.admin_user = User.objects.create_user(
            username='admin',
            email='admin@test.com',
            password='password123',
            role='admin'
        )
        
        cls.problem = Problem.objects.create(
            title='Test Problem',
            description='Test',
            difficulty='easy',
            time_limit=1000,
            memory_limit=256,
            created_by=cls.admin_user
        )
        
        # Create submissions at different time points
        now = timezone.now()
        
        # Recent submissions (within 3 months)
        cls.recent_submissions = []
        for i in range(10):
            days_ago = i * 5  # 0, 5, 10, ..., 45 days ago
            created_at = now - timedelta(days=days_ago)
            submission = Submission.objects.create(
                user=cls.admin_user,
                problem=cls.problem,
                language='python',
                code='print("recent")',
                status='AC',
                source_type='practice',
                is_test=False,
                created_at=created_at
            )
            cls.recent_submissions.append(submission)
        
        # Old submissions (more than 3 months ago)
        cls.old_submissions = []
        for i in range(10):
            days_ago = 100 + i * 10  # 100, 110, 120, ... days ago
            created_at = now - timedelta(days=days_ago)
            submission = Submission.objects.create(
                user=cls.admin_user,
                problem=cls.problem,
                language='python',
                code='print("old")',
                status='AC',
                source_type='practice',
                is_test=False,
                created_at=created_at
            )
            cls.old_submissions.append(submission)
    
    def setUp(self):
        """Set up test client."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)
    
    def test_default_returns_only_recent_submissions(self):
        """Test that by default only recent submissions are returned."""
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'page_size': 100
        })
        
        self.assertEqual(response.status_code, 200)
        
        # Should only return recent submissions (within 3 months)
        results = response.data.get('results', [])
        self.assertEqual(len(results), 10, "Should return 10 recent submissions")
        
        # Verify all returned submissions are recent
        now = timezone.now()
        three_months_ago = now - timedelta(days=90)
        
        for submission in results:
            created_at = timezone.datetime.fromisoformat(
                submission['created_at'].replace('Z', '+00:00')
            )
            self.assertGreater(
                created_at,
                three_months_ago,
                f"Submission {submission['id']} is older than 3 months"
            )
    
    def test_include_all_returns_all_submissions(self):
        """Test that include_all=true returns all submissions."""
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'include_all': 'true',
            'page_size': 100
        })
        
        self.assertEqual(response.status_code, 200)
        
        # Should return all submissions
        results = response.data.get('results', [])
        self.assertEqual(len(results), 20, "Should return all 20 submissions")
    
    def test_custom_date_range_filter(self):
        """Test filtering by custom date range."""
        now = timezone.now()
        two_weeks_ago = now - timedelta(days=14)
        
        response = self.client.get('/api/v1/submissions/', {
            'source_type': 'practice',
            'created_after': two_weeks_ago.isoformat(),
            'page_size': 100
        })
        
        self.assertEqual(response.status_code, 200)
        
        # Should return submissions from last 2 weeks
        # We created submissions at 0, 5, 10 days ago (3 submissions)
        results = response.data.get('results', [])
        self.assertEqual(len(results), 3, "Should return 3 submissions within 2 weeks")
