from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from .models import CodingProblem, TestCase as ProblemTestCase
from apps.submissions.models import Submission
from apps.contests.models import ContestParticipant, ExamStatus
from apps.contests.tests import bind_problem_to_contest
from apps.question_bank.models import ContestQuestionBinding
from apps.contests.tests.classroom_candidates import create_contest_in_classroom, enrol_candidates


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

        self.problem = CodingProblem.objects.create(
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
            order=1,
            weight_percent=100,
        )

    def _run(self, execute_results, **payload):
        with patch('apps.judge.judge_factory.get_judge') as mock_get_judge:
            mock_judge = MagicMock()
            mock_judge.run.return_value = [
                {'time': 1, 'memory': 1, 'error': '', **result} for result in execute_results
            ]
            mock_get_judge.return_value = mock_judge
            response = self.client.post(
                f'/api/v1/management/problems/{self.problem.id}/test_run/',
                {'language': 'python', 'code': 'x', **payload},
                format='json',
            )
        return response, mock_judge

    def test_test_run_options_describes_the_endpoint(self):
        response = self.client.options(f'/api/v1/management/problems/{self.problem.id}/test_run/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_test_run_runs_sample_cases_and_returns_results(self):
        """Test-run executes the public samples and creates no submission."""
        response, _ = self._run([{'status': 'AC', 'output': '3'}])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['status'], 'AC')
        self.assertEqual(len(data['results']), 1)
        first = data['results'][0]
        self.assertEqual(first['source'], 'sample')
        self.assertEqual(first['status'], 'AC')
        self.assertEqual(first['input'], '1 2')
        self.assertEqual(first['expected_output'], '3')
        self.assertEqual(Submission.objects.count(), 0)

    def test_test_run_never_runs_or_reveals_hidden_cases(self):
        """Hidden and non-sample cases are for formal submissions only."""
        ProblemTestCase.objects.create(
            problem=self.problem, input_data='SECRET-IN', output_data='SECRET-OUT',
            is_sample=False, is_hidden=True, order=2,
            weight_percent=0,
        )
        ProblemTestCase.objects.create(
            problem=self.problem, input_data='NON-SAMPLE-IN', output_data='NON-SAMPLE-OUT',
            is_sample=False, order=3,
            weight_percent=0,
        )

        response, judge = self._run([{'status': 'AC', 'output': '3'}])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(judge.run.call_args.kwargs['cases'], [('1 2', '3')])
        self.assertEqual(len(response.data['results']), 1)
        self.assertNotIn('SECRET', str(response.data))
        self.assertNotIn('NON-SAMPLE', str(response.data))

    def test_test_run_runs_custom_cases_after_the_samples(self):
        response, judge = self._run(
            [
                {'status': 'AC', 'output': '3'},
                {'status': 'WA', 'output': '6'},
                {'status': 'WA', 'output': 'hello'},
            ],
            custom_test_cases=[
                {'input': '2 3', 'expected_output': '5'},
                {'input': 'hello'},
            ],
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inputs = [case_input for case_input, _ in judge.run.call_args.kwargs['cases']]
        self.assertEqual(inputs, ['1 2', '2 3', 'hello'])
        sample, with_expected, output_only = response.data['results']
        self.assertEqual(sample['source'], 'sample')
        # A custom case with an expected output is judged like a sample.
        self.assertEqual(with_expected['source'], 'custom')
        self.assertEqual(with_expected['status'], 'WA')
        self.assertEqual(with_expected['expected_output'], '5')
        # Without one there is nothing to compare: just show the output.
        self.assertEqual(output_only['status'], 'info')
        self.assertIsNone(output_only['expected_output'])
        self.assertEqual(output_only['output'], 'hello')
        self.assertEqual(response.data['status'], 'WA')

    def test_output_only_custom_case_does_not_fail_the_run(self):
        response, _ = self._run(
            [{'status': 'AC', 'output': '3'}, {'status': 'WA', 'output': 'anything'}],
            custom_test_cases=[{'input': 'hello', 'expected_output': ''}],
        )

        self.assertEqual(response.data['status'], 'AC')
        self.assertEqual(response.data['results'][1]['status'], 'info')

    def test_output_only_custom_case_still_reports_a_runtime_error(self):
        response, _ = self._run(
            [{'status': 'AC', 'output': '3'}, {'status': 'RE', 'output': ''}],
            custom_test_cases=[{'input': 'boom'}],
        )

        self.assertEqual(response.data['status'], 'RE')
        self.assertEqual(response.data['results'][1]['status'], 'RE')

    def test_custom_case_whitespace_is_preserved(self):
        _, judge = self._run(
            [{'status': 'AC', 'output': '3'}, {'status': 'AC', 'output': '  x\n'}],
            custom_test_cases=[{'input': '  x\n', 'expected_output': '  x\n'}],
        )

        self.assertEqual(judge.run.call_args.kwargs['cases'][1], ('  x\n', '  x\n'))

    def test_too_many_custom_cases_are_rejected(self):
        response = self.client.post(
            f'/api/v1/management/problems/{self.problem.id}/test_run/',
            {
                'language': 'python',
                'code': 'x',
                'custom_test_cases': [{'input': str(i)} for i in range(21)],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_async_test_run_total_counts_samples_and_custom_cases(self):
        with patch('apps.problems.tasks.run_problem_test_run.apply_async') as apply_async:
            apply_async.return_value.id = 'task-1'
            response = self.client.post(
                f'/api/v1/management/problems/{self.problem.id}/test_run/',
                {
                    'language': 'python',
                    'code': 'x',
                    'asynchronous': True,
                    'custom_test_cases': [{'input': '5 6'}],
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data['total'], 2)
        self.assertEqual(
            apply_async.call_args.kwargs['kwargs']['custom_test_cases'],
            [{'input': '5 6', 'expected_output': ''}],
        )

    def test_test_run_stops_after_compile_error(self):
        """Hard failures should stop remaining case execution like the submission path."""
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='2 3',
            output_data='5',
            is_sample=True,
            order=2,
            weight_percent=100,
        )

        with patch('apps.judge.judge_factory.get_judge') as mock_get_judge:
            mock_judge = MagicMock()
            mock_judge.run.return_value = [
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
        self.assertEqual(mock_judge.run.call_count, 1)


class ProblemTestRunContestAccessTests(TestCase):
    """Test-run access requires an eligible participant and a bound problem."""

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

        self.problem = CodingProblem.objects.create(
            slug='cap', time_limit=1000, memory_limit=128,
            created_by=self.teacher,
        )
        ProblemTestCase.objects.create(
            problem=self.problem, input_data='1 2', output_data='3',
            is_sample=True, order=1,
            weight_percent=100,
        )

        now = timezone.now()
        self.active_contest = create_contest_in_classroom(
            name='Active', owner=self.teacher,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            status='published',
        )
        bind_problem_to_contest(self.active_contest, self.problem)
        enrol_candidates(self.active_contest, self.student)
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
        mock_judge.run.side_effect = lambda **kwargs: [
            {'status': 'AC', 'time': 1, 'memory': 1, 'output': '3', 'error': ''}
            for _ in kwargs['cases']
        ]
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
        future_contest = create_contest_in_classroom(
            name='Future', owner=future_owner,
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=3),
            status='published',
        )
        bind_problem_to_contest(future_contest, self.problem)
        enrol_candidates(future_contest, self.student)
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

    def test_classroom_ta_can_test_run_without_contest_id(self):
        """The MCP code runner omits contest_id; contest managers may still run the problem."""
        User = get_user_model()
        ta = User.objects.create_user(username='ta-run', email='ta-run@example.com', password='pw', role='teacher')
        enrol_candidates(self.active_contest, ta, role='ta')
        self._mock_judge()
        self.client.force_authenticate(user=ta)

        resp = self._post({'language': 'python', 'code': 'x'})

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

    def test_unrelated_teacher_cannot_test_run_without_contest_id(self):
        User = get_user_model()
        other = User.objects.create_user(username='t-other', email='t-other@example.com', password='pw', role='teacher')
        self.client.force_authenticate(user=other)

        resp = self._post({'language': 'python', 'code': 'x'})

        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.data)

    def test_unauthenticated_is_rejected(self):
        resp = self._post({'language': 'python', 'code': 'x'})
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def _contest_problem_detail(self, user):
        ProblemTestCase.objects.create(
            problem=self.problem, input_data='SECRET-IN', output_data='SECRET-OUT',
            is_sample=False, is_hidden=True, order=2,
            weight_percent=0,
        )
        binding = ContestQuestionBinding.objects.get(
            contest=self.active_contest, coding_problem=self.problem,
        )
        self.client.force_authenticate(user=user)
        return self.client.get(f'/api/v1/contests/{self.active_contest.id}/problems/{binding.id}/')

    def test_contest_problem_detail_shows_solvers_only_public_samples(self):
        resp = self._contest_problem_detail(self.student)

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual([case['input_data'] for case in resp.data['test_cases']], ['1 2'])
        self.assertNotIn('SECRET', str(resp.data))

    def test_contest_problem_detail_gives_staff_every_case_to_edit(self):
        resp = self._contest_problem_detail(self.teacher)

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(
            [case['input_data'] for case in resp.data['test_cases']], ['1 2', 'SECRET-IN'],
        )
