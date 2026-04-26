from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from .models import Problem, Tag, TestCase as ProblemTestCase
from apps.submissions.models import Submission
from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.tests import bind_problem_to_contest



class ProblemPermissionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        
        # Create users
        self.admin = User.objects.create_user(username='admin', email='admin@example.com', password='password', role='admin', is_staff=True)
        self.teacher1 = User.objects.create_user(username='teacher1', email='teacher1@example.com', password='password', role='teacher')
        self.teacher2 = User.objects.create_user(username='teacher2', email='teacher2@example.com', password='password', role='teacher')
        self.student = User.objects.create_user(username='student', email='student@example.com', password='password', role='student')
        
        # Create problems (title/difficulty now live in QuestionAsset)
        self.problem1 = Problem.objects.create(
            slug='p1',
            created_by=self.teacher1,
        )
        self.problem2 = Problem.objects.create(
            slug='p2',
            created_by=self.teacher2,
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
        response = self.client.post('/api/v1/management/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Problem.objects.get(slug='new-prob').created_by, self.teacher1)

    def test_teacher_can_edit_own_problem(self):
        self.client.force_authenticate(user=self.teacher1)
        data = {'title': 'Updated Title'}
        response = self.client.patch(f'/api/v1/management/problems/{self.problem1.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.problem1.refresh_from_db()
        # title is now stored in QuestionAsset, verify via asset
        if self.problem1.question_asset_id:
            self.problem1.question_asset.refresh_from_db()
            self.assertEqual(self.problem1.question_asset.title, 'Updated Title')

    def test_teacher_cannot_edit_other_problem(self):
        self.client.force_authenticate(user=self.teacher1)
        data = {'title': 'Hacked Title'}
        response = self.client.patch(f'/api/v1/management/problems/{self.problem2.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.problem2.refresh_from_db()
        # Title should not have been changed (permission denied)

    def test_admin_can_edit_any_problem(self):
        self.client.force_authenticate(user=self.admin)
        data = {'title': 'Admin Edit'}
        response = self.client.patch(f'/api/v1/management/problems/{self.problem1.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.problem1.refresh_from_db()
        # title is now in QuestionAsset
        if self.problem1.question_asset_id:
            self.problem1.question_asset.refresh_from_db()
            self.assertEqual(self.problem1.question_asset.title, 'Admin Edit')

    def test_student_cannot_create_problem(self):
        self.client.force_authenticate(user=self.student)
        data = {
            'title': 'Student Problem',
            'slug': 'student-prob',
            'difficulty': 'easy'
        }
        response = self.client.post('/api/v1/management/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_scope_manage_filtering(self):
        """Test that teacher only sees their own problems with scope=manage"""
        self.client.force_authenticate(user=self.teacher1)
        response = self.client.get('/api/v1/management/problems/?scope=manage')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        # Should see problem1 (own) but not problem2 (teacher2's)
        self.assertTrue(any(p['id'] == str(self.problem1.id) for p in results))
        self.assertFalse(any(p['id'] == str(self.problem2.id) for p in results))

    def test_admin_scope_manage_filtering(self):
        """Test that admin sees all problems with scope=manage"""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/v1/management/problems/?scope=manage')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        # Should see both
        self.assertTrue(any(p['id'] == str(self.problem1.id) for p in results))
        self.assertTrue(any(p['id'] == str(self.problem2.id) for p in results))

    def test_management_alias_lists_problems(self):
        self.client.force_authenticate(user=self.teacher1)
        response = self.client.get('/api/v1/management/problems/?scope=manage')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertTrue(any(p['id'] == str(self.problem1.id) for p in results))


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
        
        # Create initial problems (title/difficulty now in QuestionAsset)
        self.problem = Problem.objects.create(
            slug='crud-p1',
            created_by=self.teacher,
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
        response = self.client.post('/api/v1/management/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        problem = Problem.objects.get(slug='new-tagged')
        self.assertEqual(problem.created_by, self.teacher)
        # title is now in QuestionAsset
        self.assertEqual(problem.question_asset.title, 'New Tagged Problem')
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
        response = self.client.post('/api/v1/management/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        problem = Problem.objects.get(slug='new-tags')
        self.assertEqual(problem.tags.count(), 2)
        tag_names = list(problem.tags.values_list('name', flat=True))
        self.assertIn('Greedy', tag_names)
        self.assertIn('Sorting', tag_names)

    def test_create_problem_invalid_data(self):
        """Test creating a problem with invalid data still works (title/difficulty optional)."""
        self.client.force_authenticate(user=self.teacher)
        data = {
            'difficulty': 'easy'
            # No slug - will be auto-generated
        }
        # title/difficulty are now optional (stored in QuestionAsset), so this should succeed
        response = self.client.post('/api/v1/management/problems/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_list_problems_anonymous(self):
        """Anonymous users are blocked from the retired problems management surface."""
        Problem.objects.create(
            slug='hidden',
            created_by=self.teacher,
        )

        response = self.client.get('/api/v1/management/problems/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_problem_detail(self):
        """Anonymous users are blocked from the retired problems management surface."""
        response = self.client.get(f'/api/v1/management/problems/{self.problem.id}/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_problem_not_found(self):
        """Anonymous access is rejected before malformed lookups are resolved."""
        response = self.client.get('/api/v1/management/problems/99999/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

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
        response = self.client.put(f'/api/v1/management/problems/{self.problem.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.problem.refresh_from_db()
        # title/difficulty now in QuestionAsset
        self.assertEqual(self.problem.question_asset.title, 'Updated Full')
        self.assertEqual((self.problem.question_asset.payload or {}).get('difficulty'), 'easy')
        self.assertEqual(self.problem.tags.count(), 1)
        self.assertEqual(self.problem.tags.first(), self.tag2)

    def test_update_problem_partial(self):
        """Test partial update (PATCH) of a problem"""
        self.client.force_authenticate(user=self.teacher)
        data = {
            'difficulty': 'hard'
        }
        response = self.client.patch(f'/api/v1/management/problems/{self.problem.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.problem.refresh_from_db()
        # difficulty now in QuestionAsset
        self.assertEqual((self.problem.question_asset.payload or {}).get('difficulty'), 'hard')

    def test_delete_problem_teacher_own(self):
        """Test teacher can delete their own problem"""
        self.client.force_authenticate(user=self.teacher)
        response = self.client.delete(f'/api/v1/management/problems/{self.problem.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Problem.objects.filter(id=self.problem.id).exists())

    def test_delete_problem_teacher_other(self):
        """Test teacher cannot delete other's problem"""
        # Create a problem by another teacher
        User = get_user_model()
        other_teacher = User.objects.create_user(username='other', password='password', role='teacher')
        other_problem = Problem.objects.create(
            slug='other',
            created_by=other_teacher
        )
        
        self.client.force_authenticate(user=self.teacher)
        response = self.client.delete(f'/api/v1/management/problems/{other_problem.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Problem.objects.filter(id=other_problem.id).exists())

    def test_delete_problem_admin(self):
        """Test admin can delete any problem"""
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f'/api/v1/management/problems/{self.problem.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Problem.objects.filter(id=self.problem.id).exists())


class ProblemFilterTests(TestCase):
    """Test problem list filtering by difficulty and tags."""

    def _create_problem_with_asset(self, slug, title, difficulty, owner):
        """Helper: create a Problem with a QuestionAsset holding title/difficulty."""
        from apps.question_bank.models import QuestionAsset
        asset = QuestionAsset.objects.create(
            owner=owner,
            asset_type=QuestionAsset.AssetType.CODING,
            title=title,
            payload={"difficulty": difficulty},
        )
        problem = Problem.objects.create(
            slug=slug,
            created_by=owner,
            question_asset=asset,
        )
        return problem

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

        # Create problems with different difficulties and tags (via QuestionAsset)
        self.p1_easy_array = self._create_problem_with_asset('easy-array', 'Easy Array', 'easy', self.teacher)
        self.p1_easy_array.tags.add(self.tag_array)

        self.p2_medium_dp = self._create_problem_with_asset('medium-dp', 'Medium DP', 'medium', self.teacher)
        self.p2_medium_dp.tags.add(self.tag_dp)

        self.p3_hard_graph = self._create_problem_with_asset('hard-graph', 'Hard Graph', 'hard', self.teacher)
        self.p3_hard_graph.tags.add(self.tag_graph)

        self.p4_medium_array_dp = self._create_problem_with_asset('medium-array-dp', 'Medium Array DP', 'medium', self.teacher)
        self.p4_medium_array_dp.tags.add(self.tag_array, self.tag_dp)
        self.client.force_authenticate(user=self.teacher)

    def test_filter_single_difficulty(self):
        """Filter by single difficulty returns matching problems."""
        response = self.client.get('/api/v1/management/problems/?difficulty=easy')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['difficulty'], 'easy')

    def test_filter_multiple_difficulties(self):
        """Filter by multiple difficulties returns all matching problems (OR logic)."""
        response = self.client.get(
            '/api/v1/management/problems/?difficulty=easy&difficulty=medium'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        difficulties = {p['difficulty'] for p in results}
        self.assertEqual(difficulties, {'easy', 'medium'})
        self.assertEqual(len(results), 3)  # p1(easy), p2(medium), p4(medium)

    def test_filter_single_tag(self):
        """Filter by single tag returns matching problems."""
        response = self.client.get('/api/v1/management/problems/?tags=array')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 2)  # p1, p4

    def test_filter_multiple_tags_or_logic(self):
        """Filter by multiple tags uses OR logic."""
        response = self.client.get('/api/v1/management/problems/?tags=array,graph')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 3)  # p1(array), p3(graph), p4(array)

    def test_combined_difficulty_and_tags(self):
        """Filter by both difficulty and tags."""
        response = self.client.get(
            '/api/v1/management/problems/?difficulty=medium&tags=dp'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 2)  # p2, p4

    def test_search_with_filters(self):
        """Search combined with filters."""
        response = self.client.get(
            '/api/v1/management/problems/?search=Array&difficulty=medium'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        slugs = [item['slug'] for item in results]
        self.assertIn('medium-array-dp', slugs)
        for item in results:
            self.assertEqual(item['difficulty'], 'medium')

    def test_filter_no_results(self):
        """Filter with no matches returns empty list."""
        response = self.client.get('/api/v1/management/problems/?difficulty=easy&tags=graph')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 0)

    def test_filter_all_difficulties(self):
        """Filter with all difficulties returns all problems."""
        response = self.client.get(
            '/api/v1/management/problems/?difficulty=easy&difficulty=medium&difficulty=hard'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 4)


class ProblemContestLockGuardTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="lock_owner",
            email="lock_owner@example.com",
            password="password",
            role="teacher",
        )
        self.contest = Contest.objects.create(
            name="Locked Contest",
            owner=self.owner,
            status="published",
            question_edit_locked=True,
            question_edit_lock_trigger=Contest.QuestionEditLockTrigger.CODING_SUBMISSION,
        )
        self.problem = Problem.objects.create(
            slug="locked-contest-problem",
            created_by=self.owner,
        )
        bind_problem_to_contest(self.contest, self.problem, order=0, score=10)

    def test_patch_problem_blocked_when_linked_contest_locked(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/v1/management/problems/{self.problem.id}/",
            {"title": "Should Not Update"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("CONTEST_QUESTION_EDIT_LOCKED", str(response.data))
        self.assertEqual(response.data["error"]["details"]["message"], "已有學生正式作答，競賽題目已鎖定")

    def test_delete_problem_blocked_when_linked_contest_locked(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(f"/api/v1/management/problems/{self.problem.id}/")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("CONTEST_QUESTION_EDIT_LOCKED", str(response.data))
        self.assertEqual(response.data["error"]["details"]["message"], "已有學生正式作答，競賽題目已鎖定")


class ProblemTestRunTests(TestCase):
    """Tests for the problem test-run endpoint."""

    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='runner',
            email='runner@example.com',
            password='password',
            role='teacher',
        )
        self.client.force_authenticate(user=self.user)

        self.problem = Problem.objects.create(
            slug='a-plus-b',
            time_limit=1000,
            memory_limit=128,
            created_by=self.user,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='1 2',
            output_data='3',
            is_sample=True,
            score=100,
            order=1,
        )

    def test_test_run_runs_all_stored_cases_and_returns_results(self):
        """Test-run should execute every stored test case and not create submissions."""
        with patch('apps.judge.judge_factory.get_judge') as mock_get_judge:
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
                f'/api/v1/management/problems/{self.problem.id}/test_run/',
                {
                    'language': 'python',
                    'code': 'print(sum(map(int,input().split())))',
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['status'], 'AC')
        self.assertEqual(len(data['results']), 1)
        first = data['results'][0]
        self.assertEqual(first['source'], 'test_case')
        self.assertEqual(first['status'], 'AC')
        self.assertEqual(first['input'], '1 2')
        self.assertEqual(first['expected_output'], '3')
        self.assertEqual(Submission.objects.count(), 0)

    def test_test_run_runs_non_sample_cases_too(self):
        """All DB test cases (sample and hidden) are executed in order."""
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='2 3',
            output_data='5',
            is_sample=False,
            is_hidden=True,
            score=0,
            order=2,
        )

        with patch('apps.judge.judge_factory.get_judge') as mock_get_judge:
            mock_judge = MagicMock()
            mock_judge.execute.side_effect = [
                {
                    'status': 'AC',
                    'time': 10,
                    'memory': 1024,
                    'output': '3',
                    'error': '',
                },
                {
                    'status': 'WA',
                    'time': 8,
                    'memory': 512,
                    'output': '0',
                    'error': '',
                },
            ]
            mock_get_judge.return_value = mock_judge

            response = self.client.post(
                f'/api/v1/management/problems/{self.problem.id}/test_run/',
                {
                    'language': 'python',
                    'code': 'x',
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['status'], 'WA')
        self.assertEqual(len(data['results']), 2)
        self.assertEqual(data['results'][0]['status'], 'AC')
        self.assertEqual(data['results'][1]['status'], 'WA')
        self.assertEqual(data['results'][0]['source'], 'test_case')
        self.assertEqual(data['results'][1]['source'], 'test_case')
        self.assertEqual(mock_judge.execute.call_count, 2)

    def test_test_run_stops_after_compile_error(self):
        """Hard failures should stop remaining case execution like the submission path."""
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='2 3',
            output_data='5',
            is_sample=True,
            score=100,
            order=2,
        )

        with patch('apps.judge.judge_factory.get_judge') as mock_get_judge:
            mock_judge = MagicMock()
            mock_judge.execute.side_effect = [
                {
                    'status': 'CE',
                    'time': 0,
                    'memory': 0,
                    'output': '',
                    'error': 'compile error',
                },
                {
                    'status': 'AC',
                    'time': 12,
                    'memory': 2048,
                    'output': '5',
                    'error': '',
                },
            ]
            mock_get_judge.return_value = mock_judge

            response = self.client.post(
                f'/api/v1/management/problems/{self.problem.id}/test_run/',
                {
                    'language': 'python',
                    'code': 'broken code',
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CE')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'CE')
        self.assertEqual(mock_judge.execute.call_count, 1)


class ProblemTestRunContestAccessTests(TestCase):
    """Access policy mirrors Submission: any authenticated user may test_run,
    and contest_id (when provided) gates by SubmissionAccessPolicy."""

    def setUp(self):
        User = get_user_model()
        self.client = APIClient()

        self.teacher = User.objects.create_user(
            username='owner-t', email='owner-t@example.com',
            password='pw', role='teacher',
        )
        self.student = User.objects.create_user(
            username='stu-1', email='stu-1@example.com',
            password='pw', role='student',
        )
        self.outsider = User.objects.create_user(
            username='stu-out', email='stu-out@example.com',
            password='pw', role='student',
        )

        self.problem = Problem.objects.create(
            slug='cap', time_limit=1000, memory_limit=128,
            created_by=self.teacher,
        )
        ProblemTestCase.objects.create(
            problem=self.problem, input_data='1 2', output_data='3',
            is_sample=True, score=100, order=1,
        )

        now = timezone.now()
        self.active_contest = Contest.objects.create(
            name='Active', owner=self.teacher,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            visibility='public', status='published',
        )
        bind_problem_to_contest(self.active_contest, self.problem)
        ContestParticipant.objects.create(
            contest=self.active_contest, user=self.student,
            exam_status=ExamStatus.IN_PROGRESS, started_at=now,
        )

    def _post(self, payload):
        return self.client.post(
            f'/api/v1/management/problems/{self.problem.id}/test_run/',
            payload, format='json',
        )

    def _mock_judge(self):
        patcher = patch('apps.judge.judge_factory.get_judge')
        mock_get_judge = patcher.start()
        self.addCleanup(patcher.stop)
        mock_judge = MagicMock()
        mock_judge.execute.return_value = {
            'status': 'AC', 'time': 1, 'memory': 1, 'output': '3', 'error': '',
        }
        mock_get_judge.return_value = mock_judge
        return mock_judge

    def test_student_participant_can_test_run_with_contest_id(self):
        self._mock_judge()
        self.client.force_authenticate(user=self.student)
        resp = self._post({
            'language': 'python',
            'code': 'x',
            'contest_id': str(self.active_contest.id),
        })
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(Submission.objects.count(), 0)

    def test_student_can_test_run_without_contest_id(self):
        """Mirrors Submission practice path: no contest context => any auth user."""
        self._mock_judge()
        self.client.force_authenticate(user=self.student)
        resp = self._post({'language': 'python', 'code': 'x'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

    def test_non_participant_with_contest_id_is_denied(self):
        self.client.force_authenticate(user=self.outsider)
        resp = self._post({
            'language': 'python',
            'code': 'x',
            'contest_id': str(self.active_contest.id),
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.data)

    def test_contest_not_started_blocks_student(self):
        User = get_user_model()
        future_owner = self.teacher
        now = timezone.now()
        future_contest = Contest.objects.create(
            name='Future', owner=future_owner,
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=3),
            visibility='public', status='published',
        )
        bind_problem_to_contest(future_contest, self.problem)
        ContestParticipant.objects.create(
            contest=future_contest, user=self.student,
            exam_status=ExamStatus.NOT_STARTED,
        )
        self.client.force_authenticate(user=self.student)
        resp = self._post({
            'language': 'python',
            'code': 'x',
            'contest_id': str(future_contest.id),
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.data)

    def test_unauthenticated_is_rejected(self):
        resp = self._post({'language': 'python', 'code': 'x'})
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
