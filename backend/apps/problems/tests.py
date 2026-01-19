from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Problem, Tag, TestCase as ProblemTestCase
from apps.submissions.models import Submission



class ProblemPermissionTests(TestCase):
    def setUp(self):
        User = get_user_model()
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


class ProblemCRUDTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        
        # Create users
        self.admin = User.objects.create_user(username='admin_crud', email='admin_crud@example.com', password='password', role='admin', is_staff=True)
        self.teacher = User.objects.create_user(username='teacher_crud', email='teacher_crud@example.com', password='password', role='teacher')
        self.student = User.objects.create_user(username='student_crud', email='student_crud@example.com', password='password', role='student')
        
        # Create tags
        self.tag1 = Tag.objects.create(name='DP', slug='dp')
        self.tag2 = Tag.objects.create(name='Graph', slug='graph')
        
        # Create initial problems
        self.problem = Problem.objects.create(
            title='CRUD Problem',
            slug='crud-p1',
            created_by=self.teacher,
            difficulty='medium',
            is_visible=True,
            is_practice_visible=True
        )
        self.problem.tags.add(self.tag1)

    def test_create_problem_with_tags(self):
        """Test creating a problem with tags"""
        self.client.force_authenticate(user=self.teacher)
        data = {
            'title': 'New Tagged Problem',
            'slug': 'new-tagged',
            'difficulty': 'hard',
            'time_limit': 2000,
            'memory_limit': 256,
            'existing_tag_ids': [self.tag1.id, self.tag2.id]
        }
        response = self.client.post('/api/v1/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        problem = Problem.objects.get(slug='new-tagged')
        self.assertEqual(problem.title, 'New Tagged Problem')
        self.assertEqual(problem.created_by, self.teacher)
        self.assertEqual(problem.tags.count(), 2)

    def test_create_problem_with_new_tags(self):
        """Test creating a problem with new tag names"""
        self.client.force_authenticate(user=self.teacher)
        data = {
            'title': 'New Tags Problem',
            'slug': 'new-tags',
            'difficulty': 'medium',
            'new_tag_names': ['Greedy', 'Sorting']
        }
        response = self.client.post('/api/v1/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        problem = Problem.objects.get(slug='new-tags')
        self.assertEqual(problem.tags.count(), 2)
        tag_names = list(problem.tags.values_list('name', flat=True))
        self.assertIn('Greedy', tag_names)
        self.assertIn('Sorting', tag_names)

    def test_create_problem_invalid_data(self):
        """Test creating a problem with missing required fields"""
        self.client.force_authenticate(user=self.teacher)
        data = {
            'difficulty': 'easy'
            # Missing title and slug
        }
        response = self.client.post('/api/v1/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Check for title in error details
        # Structure: {'success': False, 'error': {'code': 'INVALID', 'details': {'title': [...]}}}
        self.assertIn('title', response.data['error']['details'])

    def test_list_problems_anonymous(self):
        """Test anonymous users see only visible practice problems"""
        # Create a hidden problem
        Problem.objects.create(
            title='Hidden',
            slug='hidden',
            created_by=self.teacher,
            is_visible=False,
            is_practice_visible=False
        )
        
        response = self.client.get('/api/v1/problems/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        
        # Should see the visible problem
        self.assertTrue(any(p['id'] == self.problem.id for p in results))
        # Should NOT see the hidden problem
        self.assertFalse(any(p['slug'] == 'hidden' for p in results))

    def test_retrieve_problem_detail(self):
        """Test retrieving a single problem detail"""
        response = self.client.get(f'/api/v1/problems/{self.problem.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], self.problem.title)
        self.assertEqual(response.data['tags'][0]['slug'], self.tag1.slug)

    def test_retrieve_problem_not_found(self):
        """Test retrieving a non-existent problem"""
        response = self.client.get('/api/v1/problems/99999/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_problem_full(self):
        """Test full update (PUT) of a problem"""
        self.client.force_authenticate(user=self.teacher)
        data = {
            'title': 'Updated Full',
            'slug': 'updated-full',
            'difficulty': 'easy',
            'time_limit': 500,
            'memory_limit': 64,
            'existing_tag_ids': [self.tag2.id]
        }
        response = self.client.put(f'/api/v1/problems/{self.problem.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.title, 'Updated Full')
        self.assertEqual(self.problem.difficulty, 'easy')
        self.assertEqual(self.problem.tags.count(), 1)
        self.assertEqual(self.problem.tags.first(), self.tag2)

    def test_update_problem_partial(self):
        """Test partial update (PATCH) of a problem"""
        self.client.force_authenticate(user=self.teacher)
        data = {
            'difficulty': 'hard'
        }
        response = self.client.patch(f'/api/v1/problems/{self.problem.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.difficulty, 'hard')
        # Title should remain unchanged
        self.assertEqual(self.problem.title, 'CRUD Problem')

    def test_delete_problem_teacher_own(self):
        """Test teacher can delete their own problem"""
        self.client.force_authenticate(user=self.teacher)
        response = self.client.delete(f'/api/v1/problems/{self.problem.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Problem.objects.filter(id=self.problem.id).exists())

    def test_delete_problem_teacher_other(self):
        """Test teacher cannot delete other's problem"""
        # Create a problem by another teacher
        User = get_user_model()
        other_teacher = User.objects.create_user(username='other', password='password', role='teacher')
        other_problem = Problem.objects.create(
            title='Other',
            slug='other',
            created_by=other_teacher
        )
        
        self.client.force_authenticate(user=self.teacher)
        response = self.client.delete(f'/api/v1/problems/{other_problem.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Problem.objects.filter(id=other_problem.id).exists())

    def test_delete_problem_admin(self):
        """Test admin can delete any problem"""
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f'/api/v1/problems/{self.problem.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Problem.objects.filter(id=self.problem.id).exists())


class ProblemFilterTests(TestCase):
    """Test problem list filtering by difficulty and tags."""

    def setUp(self):
        User = get_user_model()
        self.client = APIClient()

        # Create teacher for problem ownership
        self.teacher = User.objects.create_user(
            username='filter_teacher',
            email='filter_teacher@example.com',
            password='password',
            role='teacher'
        )

        # Create tags
        self.tag_array = Tag.objects.create(name='Array', slug='array')
        self.tag_dp = Tag.objects.create(name='DP', slug='dp')
        self.tag_graph = Tag.objects.create(name='Graph', slug='graph')

        # Create problems with different difficulties and tags
        self.p1_easy_array = Problem.objects.create(
            title='Easy Array',
            slug='easy-array',
            difficulty='easy',
            is_practice_visible=True,
            created_by=self.teacher,
        )
        self.p1_easy_array.tags.add(self.tag_array)

        self.p2_medium_dp = Problem.objects.create(
            title='Medium DP',
            slug='medium-dp',
            difficulty='medium',
            is_practice_visible=True,
            created_by=self.teacher,
        )
        self.p2_medium_dp.tags.add(self.tag_dp)

        self.p3_hard_graph = Problem.objects.create(
            title='Hard Graph',
            slug='hard-graph',
            difficulty='hard',
            is_practice_visible=True,
            created_by=self.teacher,
        )
        self.p3_hard_graph.tags.add(self.tag_graph)

        self.p4_medium_array_dp = Problem.objects.create(
            title='Medium Array DP',
            slug='medium-array-dp',
            difficulty='medium',
            is_practice_visible=True,
            created_by=self.teacher,
        )
        self.p4_medium_array_dp.tags.add(self.tag_array, self.tag_dp)

    def test_filter_single_difficulty(self):
        """Filter by single difficulty returns matching problems."""
        response = self.client.get('/api/v1/problems/?difficulty=easy')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['difficulty'], 'easy')

    def test_filter_multiple_difficulties(self):
        """Filter by multiple difficulties returns all matching problems (OR logic)."""
        response = self.client.get(
            '/api/v1/problems/?difficulty=easy&difficulty=medium'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        difficulties = {p['difficulty'] for p in results}
        self.assertEqual(difficulties, {'easy', 'medium'})
        self.assertEqual(len(results), 3)  # p1(easy), p2(medium), p4(medium)

    def test_filter_single_tag(self):
        """Filter by single tag returns matching problems."""
        response = self.client.get('/api/v1/problems/?tags=array')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 2)  # p1, p4

    def test_filter_multiple_tags_or_logic(self):
        """Filter by multiple tags uses OR logic."""
        response = self.client.get('/api/v1/problems/?tags=array,graph')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 3)  # p1(array), p3(graph), p4(array)

    def test_combined_difficulty_and_tags(self):
        """Filter by both difficulty and tags."""
        response = self.client.get(
            '/api/v1/problems/?difficulty=medium&tags=dp'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 2)  # p2, p4

    def test_search_with_filters(self):
        """Search combined with filters."""
        response = self.client.get(
            '/api/v1/problems/?search=Array&difficulty=medium'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        slugs = [item['slug'] for item in results]
        self.assertIn('medium-array-dp', slugs)
        for item in results:
            self.assertEqual(item['difficulty'], 'medium')

    def test_filter_no_results(self):
        """Filter with no matches returns empty list."""
        response = self.client.get('/api/v1/problems/?difficulty=easy&tags=graph')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 0)

    def test_filter_all_difficulties(self):
        """Filter with all difficulties returns all problems."""
        response = self.client.get(
            '/api/v1/problems/?difficulty=easy&difficulty=medium&difficulty=hard'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 4)


class ProblemTestRunTests(TestCase):
    """Tests for the problem test-run endpoint."""

    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='runner',
            email='runner@example.com',
            password='password',
            role='student',
        )
        self.client.force_authenticate(user=self.user)

        self.problem = Problem.objects.create(
            title='A+B',
            slug='a-plus-b',
            difficulty='easy',
            time_limit=1000,
            memory_limit=128,
            is_practice_visible=True,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='1 2',
            output_data='3',
            is_sample=True,
            score=100,
            order=1,
        )

    def test_test_run_uses_samples_and_returns_results(self):
        """Test-run should execute sample cases and not create submissions."""
        with patch('apps.submissions.tasks.USE_REAL_JUDGE', True), patch(
            'apps.judge.judge_factory.get_judge'
        ) as mock_get_judge:
            mock_judge = MagicMock()
            mock_judge.execute.return_value = {
                'status': 'AC',
                'time': 12,
                'memory': 2048,
                'output': '3',
                'error': '',
            }
            mock_get_judge.return_value = mock_judge

            response = self.client.post(
                f'/api/v1/problems/{self.problem.id}/test_run/',
                {
                    'language': 'python',
                    'code': 'print(sum(map(int,input().split())))',
                    'use_samples': True,
                    'custom_test_cases': [],
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['status'], 'AC')
        self.assertEqual(len(data['results']), 1)
        sample_result = data['results'][0]
        self.assertEqual(sample_result['source'], 'sample')
        self.assertEqual(sample_result['status'], 'AC')
        self.assertEqual(sample_result['input'], '1 2')
        self.assertEqual(sample_result['expected_output'], '3')
        self.assertEqual(Submission.objects.count(), 0)

    def test_test_run_custom_input_without_expected_marks_info(self):
        """Custom input without expected output should return info status."""
        response = self.client.post(
            f'/api/v1/problems/{self.problem.id}/test_run/',
            {
                'language': 'python',
                'code': 'print(input())',
                'use_samples': False,
                'custom_test_cases': [{'input': 'hello'}],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['status'], 'AC')
        self.assertEqual(len(data['results']), 1)
        custom_result = data['results'][0]
        self.assertEqual(custom_result['source'], 'custom')
        self.assertEqual(custom_result['status'], 'info')
        self.assertEqual(custom_result['input'], 'hello')
        self.assertIsNone(custom_result['expected_output'])
        self.assertEqual(Submission.objects.count(), 0)
